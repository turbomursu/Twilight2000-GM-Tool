const assert = require("node:assert/strict");
const { createHash, randomBytes } = require("node:crypto");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const { openRuntimeDatabase, getRuntimeDashboard, exportRuntimeSave, restoreRuntimeSave, updateRuntimeDashboard, importSetupPackage } = require("../server/runtime-store.cjs");
const { seedSampleRuntime, sampleSetupPackage } = require("../server/sample-data.cjs");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { getRuntimeFactionLayers, updateRuntimeFactionLayers } = require("../server/runtime-store.cjs");
const { getGMReport, updateGMReport, getPlayerReport } = require("../server/situation-reports.cjs");
const { getGMMap, updateGMMap, getPlayerMap } = require("../server/map-publications.cjs");
const { listComms, sendComms } = require("../server/comms.cjs");
const { getPlayerInventory, createInventoryProposal, reviewInventoryProposal, manageGMInventory, validateInventoryBackup } = require("../server/inventory.cjs");
const { emptyConditions, getGMConditions, updateGMConditions, getPlayerConditions } = require("../server/conditions.cjs");
const { updatePlayerSeed, finalizePlayerSeed, createCharacterChangeRequest, getPlayerCharacter } = require("../server/runtime-store.cjs");

function createGm(database, id, username) {
  const timestamp = new Date().toISOString();
  database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
    VALUES (?, ?, ?, 0, ?, ?, 'gm')`).run(id, username, "test-only-hash", timestamp, timestamp);
}

test("combined campaign recovery preserves character/inventory requests, conditions and COMMS while withdrawing publications", () => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    const { campaignId } = seedSampleRuntime(database, "gm-owner");
    const seat = database.prepare("SELECT * FROM player_seats WHERE campaign_id = ?").get(campaignId);
    updatePlayerSeed(database, seat.account_id, campaignId, [{ key: "nationality", value: "Swedish" }]);
    finalizePlayerSeed(database, seat.account_id, campaignId);
    const characterRequest = createCharacterChangeRequest(database, seat.account_id, campaignId, [{ key: "appearance", value: "Pending description" }]);
    const item = { name: "Campaign ration", quantity: 2, carryLocation: "backpack", sourceCategory: "GM", sourceReference: "Campaign ruling", details: "Manual equipment" };
    const added = createInventoryProposal(database, seat.account_id, campaignId, { kind: "add", item }).proposal;
    reviewInventoryProposal(database, "gm-owner", campaignId, added.id,
      { decision: "approve", sourceCategory: "GM", sourceReference: item.sourceReference, confirmSource: true });
    const accepted = getPlayerInventory(database, seat.account_id, campaignId).items[0];
    const inventoryRequest = createInventoryProposal(database, seat.account_id, campaignId,
      { kind: "update", itemId: accepted.id, expectedItemRevision: accepted.revision, item: { ...item, quantity: 5 } }).proposal;
    updateGMConditions(database, "gm-owner", campaignId, { characterId: seat.character_id, expectedRevision: 0,
      conditions: { ...emptyConditions(), damage: 2, notes: "Visible medical record" }, gmNotes: "Private condition plan" });
    sendComms(database, seat.account_id, campaignId, "player", { text: "Ready at the checkpoint" });
    const report = { title: "Checkpoint", body: "Hold position", gameTime: "Day 14" };
    updateGMReport(database, "gm-owner", campaignId, { action: "draft", expectedRevision: 0, draft: report });
    updateGMReport(database, "gm-owner", campaignId, { action: "publish", expectedRevision: 1 });
    const catalog = getGMMap(database, "gm-owner", campaignId).catalog;
    const map = { locationIds: catalog.locations.slice(0, 2).map((location) => location.id), markings: [],
      routeLocationIds: catalog.locations.slice(0, 2).map((location) => location.id), playerPosition: catalog.locations[0].position };
    updateGMMap(database, "gm-owner", campaignId, { action: "draft", expectedRevision: 0, draft: map });
    updateGMMap(database, "gm-owner", campaignId, { action: "publish", expectedRevision: 1 });
    const savedMessages = listComms(database, seat.account_id, campaignId, "player");
    const backup = exportRuntimeSave(database, "gm-owner", campaignId);
    const source = backup.data.setupImport.source_json;
    sendComms(database, "gm-owner", campaignId, "gm", { text: "After backup" });
    const revision = database.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get(campaignId).revision;
    restoreRuntimeSave(database, "gm-owner", campaignId, backup, { confirmReplace: true, confirmOlderBackup: true, expectedRevision: revision });
    const character = getPlayerCharacter(database, seat.account_id, campaignId);
    assert.equal(character.seatId, seat.id); assert.equal(character.characterId, seat.character_id);
    assert.equal(character.pendingChangeRequest.id, characterRequest.id);
    const inventory = getPlayerInventory(database, seat.account_id, campaignId);
    assert.equal(inventory.items[0].id, accepted.id); assert.equal(inventory.items[0].quantity, 2);
    assert.equal(inventory.proposals.find((proposal) => proposal.id === inventoryRequest.id).expectedItemRevision, inventory.items[0].revision);
    assert.equal(getPlayerConditions(database, seat.account_id, campaignId).record.conditions.damage, 2);
    assert.doesNotMatch(JSON.stringify(getPlayerConditions(database, seat.account_id, campaignId)), /Private condition plan/);
    assert.deepEqual(listComms(database, seat.account_id, campaignId, "player"), savedMessages);
    assert.deepEqual(getPlayerReport(database, seat.account_id, campaignId), { report: null, publishedAt: null });
    assert.deepEqual(getPlayerMap(database, seat.account_id, campaignId), { map: null, publishedAt: null });
    assert.deepEqual(getGMReport(database, "gm-owner", campaignId).draft, report);
    assert.deepEqual(getGMMap(database, "gm-owner", campaignId).draft, map);
    assert.equal(exportRuntimeSave(database, "gm-owner", campaignId).data.setupImport.source_json, source);
  } finally { database.close(); }
});

test("condition records recover private/public data atomically and retain revision markers for old backups", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-condition-test-"));
  const path = join(directory, "runtime.sqlite");
  let database = openRuntimeDatabase(path);
  try {
    createGm(database, "gm-owner", "gm-owner");
    const { campaignId } = seedSampleRuntime(database, "gm-owner");
    const seat = database.prepare("SELECT account_id, character_id FROM player_seats WHERE campaign_id = ?").get(campaignId);
    const olderBackup = exportRuntimeSave(database, "gm-owner", campaignId);
    const value = { ...emptyConditions(), damage: 2, starving: false, notes: "Visible condition note" };
    const update = { characterId: seat.character_id, expectedRevision: 0, conditions: value, gmNotes: "PRIVATE CONDITION PLAN" };
    updateGMConditions(database, "gm-owner", campaignId, update);
    const backup = exportRuntimeSave(database, "gm-owner", campaignId);
    assert.equal(backup.data.characterConditions[0].gm_notes, "PRIVATE CONDITION PLAN");
    database.close(); database = openRuntimeDatabase(path);
    assert.deepEqual(getPlayerConditions(database, seat.account_id, campaignId).record.conditions, value);
    assert.equal(getGMConditions(database, "gm-owner", campaignId).characters[0].gmNotes, "PRIVATE CONDITION PLAN");
    updateGMConditions(database, "gm-owner", campaignId, { ...update, expectedRevision: 1, conditions: { ...value, damage: 9 } });
    const revision = database.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get(campaignId).revision;
    database.exec(`CREATE TRIGGER fail_condition_restore BEFORE INSERT ON character_conditions
      BEGIN SELECT RAISE(ABORT, 'condition restore failure'); END;`);
    assert.throws(() => restoreRuntimeSave(database, "gm-owner", campaignId, backup,
      { confirmReplace: true, confirmOlderBackup: true, expectedRevision: revision }), /condition restore failure/);
    assert.equal(getPlayerConditions(database, seat.account_id, campaignId).record.conditions.damage, 9);
    database.exec("DROP TRIGGER fail_condition_restore");
    restoreRuntimeSave(database, "gm-owner", campaignId, backup,
      { confirmReplace: true, confirmOlderBackup: true, expectedRevision: revision });
    assert.equal(getPlayerConditions(database, seat.account_id, campaignId).record.conditions.damage, 2);
    assert.equal(getPlayerConditions(database, seat.account_id, campaignId).record.revision, 3);
    assert.throws(() => updateGMConditions(database, "gm-owner", campaignId, { ...update, expectedRevision: 1 }), /revision changed/);
    const currentRevision = database.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get(campaignId).revision;
    restoreRuntimeSave(database, "gm-owner", campaignId, olderBackup,
      { confirmReplace: true, confirmOlderBackup: true, expectedRevision: currentRevision });
    assert.deepEqual(getPlayerConditions(database, seat.account_id, campaignId), { record: null });
    const cleared = getGMConditions(database, "gm-owner", campaignId).characters[0];
    assert.equal(cleared.revision, 4); assert.equal(cleared.recorded, false); assert.equal(cleared.gmNotes, "");
    assert.throws(() => updateGMConditions(database, "gm-owner", campaignId, update), /revision changed/);
    database.close(); database = openRuntimeDatabase(path);
    assert.deepEqual(getPlayerConditions(database, seat.account_id, campaignId), { record: null });
    assert.equal(getGMConditions(database, "gm-owner", campaignId).characters[0].revision, 4);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("inventories and pending proposals recover atomically without reviving stale item editors", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-inventory-test-"));
  const path = join(directory, "runtime.sqlite");
  let database = openRuntimeDatabase(path);
  try {
    createGm(database, "gm-owner", "gm-owner");
    const { campaignId } = seedSampleRuntime(database, "gm-owner");
    const playerId = database.prepare("SELECT account_id FROM player_seats WHERE campaign_id = ?").get(campaignId).account_id;
    const item = { name: "GM-defined ration", quantity: 2, carryLocation: "backpack", sourceCategory: "UF", sourceReference: "", details: "No automated rules" };
    const { proposal } = createInventoryProposal(database, playerId, campaignId, { kind: "add", item });
    reviewInventoryProposal(database, "gm-owner", campaignId, proposal.id,
      { decision: "approve", sourceCategory: "GM", sourceReference: "Campaign ruling", confirmSource: true });
    const accepted = getPlayerInventory(database, playerId, campaignId).items[0];
    const pending = createInventoryProposal(database, playerId, campaignId,
      { kind: "update", itemId: accepted.id, expectedItemRevision: 0, item: { ...item, quantity: 5 } }).proposal;
    const backup = exportRuntimeSave(database, "gm-owner", campaignId);
    assert.equal(backup.data.inventoryItems.length, 1); assert.equal(backup.data.inventoryProposals.length, 2);
    assert.equal(backup.data.inventoryProposals.find((row) => row.id === proposal.id).item_id, accepted.id);
    const invalid = structuredClone(backup.data); invalid.inventoryItems[0].character_id = "foreign-character";
    assert.throws(() => validateInventoryBackup(invalid), /Invalid inventory/);
    database.close(); database = openRuntimeDatabase(path);
    assert.equal(getPlayerInventory(database, playerId, campaignId).items[0].quantity, 2);
    manageGMInventory(database, "gm-owner", campaignId, { kind: "update", characterId: getPlayerInventory(database, playerId, campaignId).characterId,
      itemId: accepted.id, expectedItemRevision: 0, item: { ...item, quantity: 9, sourceCategory: "GM" }, confirmSource: true });
    assert.throws(() => reviewInventoryProposal(database, "gm-owner", campaignId, pending.id,
      { decision: "approve", sourceCategory: "GM", sourceReference: "Campaign", confirmSource: true }), /revision changed/);
    const revision = database.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get(campaignId).revision;
    database.exec(`CREATE TRIGGER fail_inventory_restore BEFORE INSERT ON inventory_items
      BEGIN SELECT RAISE(ABORT, 'inventory restore failure'); END;`);
    assert.throws(() => restoreRuntimeSave(database, "gm-owner", campaignId, backup,
      { confirmReplace: true, confirmOlderBackup: true, expectedRevision: revision }), /inventory restore failure/);
    assert.equal(getPlayerInventory(database, playerId, campaignId).items[0].quantity, 9);
    database.exec("DROP TRIGGER fail_inventory_restore");
    restoreRuntimeSave(database, "gm-owner", campaignId, backup,
      { confirmReplace: true, confirmOlderBackup: true, expectedRevision: revision });
    let restored = getPlayerInventory(database, playerId, campaignId);
    assert.equal(restored.items[0].id, accepted.id); assert.equal(restored.items[0].quantity, 2);
    assert.equal(restored.items[0].revision, 2);
    assert.equal(restored.proposals.find((row) => row.id === pending.id).expectedItemRevision, 2);
    assert.throws(() => manageGMInventory(database, "gm-owner", campaignId, { kind: "update", characterId: restored.characterId,
      itemId: accepted.id, expectedItemRevision: 0, item, confirmSource: true }), /revision changed/);
    reviewInventoryProposal(database, "gm-owner", campaignId, pending.id,
      { decision: "approve", sourceCategory: "GM", sourceReference: "Restored campaign ruling", confirmSource: true });
    database.close(); database = openRuntimeDatabase(path);
    restored = getPlayerInventory(database, playerId, campaignId);
    assert.equal(restored.items[0].quantity, 5); assert.equal(restored.items[0].revision, 3);
    assert.equal(restored.proposals.find((row) => row.id === pending.id).status, "approved");
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("COMMS messages persist and restore with immutable sender/time snapshots and atomic rollback", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-comms-test-"));
  const path = join(directory, "runtime.sqlite");
  let database = openRuntimeDatabase(path);
  try {
    createGm(database, "gm-owner", "gm-owner");
    const { campaignId } = seedSampleRuntime(database, "gm-owner");
    const playerId = database.prepare("SELECT account_id FROM player_seats WHERE campaign_id = ?").get(campaignId).account_id;
    sendComms(database, playerId, campaignId, "player", { text: "First report" });
    sendComms(database, "gm-owner", campaignId, "gm", { text: "Copy" });
    const saved = listComms(database, playerId, campaignId, "player");
    const backup = exportRuntimeSave(database, "gm-owner", campaignId);
    assert.equal(backup.data.commsMessages.length, 2);
    database.close(); database = openRuntimeDatabase(path);
    assert.deepEqual(listComms(database, playerId, campaignId, "player"), saved);
    sendComms(database, playerId, campaignId, "player", { text: "After backup" });
    const current = listComms(database, playerId, campaignId, "player");
    const revision = database.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get(campaignId).revision;
    database.exec(`CREATE TRIGGER fail_comms_restore BEFORE INSERT ON comms_messages
      BEGIN SELECT RAISE(ABORT, 'comms restore failure'); END;`);
    assert.throws(() => restoreRuntimeSave(database, "gm-owner", campaignId, backup,
      { confirmReplace: true, confirmOlderBackup: true, expectedRevision: revision }), /comms restore failure/);
    assert.deepEqual(listComms(database, playerId, campaignId, "player"), current);
    database.exec("DROP TRIGGER fail_comms_restore");
    restoreRuntimeSave(database, "gm-owner", campaignId, backup,
      { confirmReplace: true, confirmOlderBackup: true, expectedRevision: revision });
    assert.deepEqual(listComms(database, playerId, campaignId, "player"), saved);
    database.close(); database = openRuntimeDatabase(path);
    assert.deepEqual(listComms(database, playerId, campaignId, "player"), saved);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("COMMS returns the latest 200 messages in send order without leaking account IDs", () => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    const { campaignId } = seedSampleRuntime(database, "gm-owner");
    const playerId = database.prepare("SELECT account_id FROM player_seats WHERE campaign_id = ?").get(campaignId).account_id;
    for (let index = 0; index < 201; index += 1) sendComms(database, playerId, campaignId, "player", { text: `Message ${index}` });
    const result = listComms(database, playerId, campaignId, "player");
    assert.equal(result.messages.length, 200); assert.equal(result.hasEarlier, true);
    assert.equal(result.messages[0].text, "Message 1"); assert.equal(result.messages[199].text, "Message 200");
    assert.equal(exportRuntimeSave(database, "gm-owner", campaignId).data.commsMessages.length, 201);
    assert.doesNotMatch(JSON.stringify(result), /sender_account_id|sort_order|password/);
  } finally { database.close(); }
});

test("map selections persist and recovery withdraws publication atomically", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-map-test-"));
  const path = join(directory, "runtime.sqlite");
  let database = openRuntimeDatabase(path);
  try {
    createGm(database, "gm-owner", "gm-owner");
    const { campaignId } = seedSampleRuntime(database, "gm-owner");
    const playerId = database.prepare("SELECT account_id FROM player_seats WHERE campaign_id = ?").get(campaignId).account_id;
    const catalog = getGMMap(database, "gm-owner", campaignId).catalog;
    const draft = { locationIds: catalog.locations.slice(0, 2).map((location) => location.id),
      markings: [{ id: "checkpoint", label: "Checkpoint", position: catalog.locations[0].position }],
      routeLocationIds: catalog.locations.slice(0, 2).map((location) => location.id), playerPosition: catalog.locations[0].position };
    updateGMMap(database, "gm-owner", campaignId, { action: "draft", expectedRevision: 0, draft });
    updateGMMap(database, "gm-owner", campaignId, { action: "publish", expectedRevision: 1 });
    const published = getPlayerMap(database, playerId, campaignId);
    database.close();
    database = openRuntimeDatabase(path);
    assert.deepEqual(getPlayerMap(database, playerId, campaignId), published);
    const backup = exportRuntimeSave(database, "gm-owner", campaignId);
    assert.deepEqual(JSON.parse(backup.data.mapPublication.draft_json), draft);
    assert.equal(Object.hasOwn(backup.data.mapPublication, "published_json"), false);
    const revision = database.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get(campaignId).revision;
    database.exec(`CREATE TRIGGER fail_map_restore BEFORE UPDATE ON map_publications
      BEGIN SELECT RAISE(ABORT, 'map restore failure'); END;`);
    assert.throws(() => restoreRuntimeSave(database, "gm-owner", campaignId, backup,
      { confirmReplace: true, expectedRevision: revision }), /map restore failure/);
    assert.deepEqual(getPlayerMap(database, playerId, campaignId), published);
    assert.equal(getGMMap(database, "gm-owner", campaignId).revision, 2);
    database.exec("DROP TRIGGER fail_map_restore");
    updateGMMap(database, "gm-owner", campaignId, { action: "withdraw", expectedRevision: 2 });
    restoreRuntimeSave(database, "gm-owner", campaignId, backup, { confirmReplace: true, confirmOlderBackup: true, expectedRevision: revision + 1 });
    assert.deepEqual(getPlayerMap(database, playerId, campaignId), { map: null, publishedAt: null });
    assert.deepEqual(getGMMap(database, "gm-owner", campaignId).draft, draft);
    assert.equal(getGMMap(database, "gm-owner", campaignId).revision, 4);
    assert.throws(() => updateGMMap(database, "gm-owner", campaignId, { action: "publish", expectedRevision: 2 }), /revision changed/);
    database.close();
    database = openRuntimeDatabase(path);
    assert.deepEqual(getPlayerMap(database, playerId, campaignId), { map: null, publishedAt: null });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("situation drafts persist and backup recovery cannot republish withdrawn content", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-report-test-"));
  const path = join(directory, "runtime.sqlite");
  let database = openRuntimeDatabase(path);
  try {
    createGm(database, "gm-owner", "gm-owner");
    const { campaignId } = seedSampleRuntime(database, "gm-owner");
    const playerId = database.prepare("SELECT account_id FROM player_seats WHERE campaign_id = ?").get(campaignId).account_id;
    const draft = { title: "Hold position", body: "Await further orders.", gameTime: "2000-04-14 / 08:00" };
    updateGMReport(database, "gm-owner", campaignId, { action: "draft", expectedRevision: 0, draft });
    updateGMReport(database, "gm-owner", campaignId, { action: "publish", expectedRevision: 1 });
    database.close();
    database = openRuntimeDatabase(path);
    assert.deepEqual(getPlayerReport(database, playerId, campaignId).report, draft);
    const backup = exportRuntimeSave(database, "gm-owner", campaignId);
    assert.deepEqual(JSON.parse(backup.data.situationReport.draft_json), draft);
    assert.equal(Object.hasOwn(backup.data.situationReport, "published_json"), false);
    database.exec(`CREATE TRIGGER fail_report_update BEFORE UPDATE ON situation_reports
      BEGIN SELECT RAISE(ABORT, 'report write failure'); END;`);
    assert.throws(() => updateGMReport(database, "gm-owner", campaignId, { action: "withdraw", expectedRevision: 2 }), /report write failure/);
    assert.equal(getGMReport(database, "gm-owner", campaignId).revision, 2);
    assert.deepEqual(getPlayerReport(database, playerId, campaignId).report, draft);
    database.exec("DROP TRIGGER fail_report_update");
    updateGMReport(database, "gm-owner", campaignId, { action: "withdraw", expectedRevision: 2 });
    const revision = database.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get(campaignId).revision;
    restoreRuntimeSave(database, "gm-owner", campaignId, backup, { confirmReplace: true, confirmOlderBackup: true, expectedRevision: revision });
    assert.deepEqual(getPlayerReport(database, playerId, campaignId), { report: null, publishedAt: null });
    assert.deepEqual(getGMReport(database, "gm-owner", campaignId).draft, draft);
    assert.equal(getGMReport(database, "gm-owner", campaignId).revision, 4);
    assert.throws(() => updateGMReport(database, "gm-owner", campaignId, { action: "publish", expectedRevision: 2 }), /revision changed/);
    database.close();
    database = openRuntimeDatabase(path);
    assert.deepEqual(getPlayerReport(database, playerId, campaignId), { report: null, publishedAt: null });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("faction layer and prominence edits persist without changing setup and reject stale or foreign writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-layer-test-"));
  const path = join(directory, "runtime.sqlite");
  let database = openRuntimeDatabase(path);
  try {
    createGm(database, "gm-owner", "gm-owner");
    const { campaignId } = seedSampleRuntime(database, "gm-owner");
    ["guard", "locals"].forEach((id) => database.prepare("INSERT INTO factions (runtime_campaign_id, id, name, description) VALUES (?, ?, ?, '')").run(campaignId, id, id));
    database.prepare("INSERT INTO settlements (runtime_campaign_id, id, source_location_id, name, situation) VALUES (?, 'town', 'sample-location-vansbro', 'Vansbro', '')").run(campaignId);
    const source = database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(campaignId).source_json;
    let layers = updateRuntimeFactionLayers(database, "gm-owner", campaignId, { expectedRevision: 0, factionId: "guard", cells: ["1,-2", "2,3"] });
    assert.deepEqual(layers.influence.guard, ["1,-2", "2,3"]);
    assert.throws(() => updateRuntimeFactionLayers(database, "gm-owner", campaignId, { expectedRevision: 0, factionId: "guard", cells: [] }), /revision changed/);
    layers = updateRuntimeFactionLayers(database, "gm-owner", campaignId, { expectedRevision: 1, settlementId: "town", factionIds: ["locals", "guard"] });
    assert.deepEqual(layers.prominence.town, ["locals", "guard"]);
    assert.equal(layers.revision, 2);
    assert.throws(() => updateRuntimeFactionLayers(database, "gm-owner", campaignId, { expectedRevision: 2, settlementId: "town", factionIds: ["outside"] }), /in this campaign/);
    assert.throws(() => updateRuntimeFactionLayers(database, "gm-owner", campaignId, { expectedRevision: 2, factionId: "guard", cells: ["1,2", "01,2"] }), /duplicate/);
    assert.throws(() => updateRuntimeFactionLayers(database, "other-owner", campaignId, { expectedRevision: 2, factionId: "guard", cells: [] }), /not found/);
    assert.deepEqual(getRuntimeFactionLayers(database, "gm-owner", campaignId), layers);
    assert.equal(database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(campaignId).source_json, source);
    const backup = exportRuntimeSave(database, "gm-owner", campaignId);
    updateRuntimeFactionLayers(database, "gm-owner", campaignId, { expectedRevision: 2, factionId: "guard", cells: [] });
    updateRuntimeFactionLayers(database, "gm-owner", campaignId, { expectedRevision: 3, settlementId: "town", factionIds: [] });
    restoreRuntimeSave(database, "gm-owner", campaignId, backup, { expectedRevision: 4, confirmReplace: true, confirmOlderBackup: true });
    database.close();
    database = openRuntimeDatabase(path);
    const restored = getRuntimeFactionLayers(database, "gm-owner", campaignId);
    assert.deepEqual(restored.influence, layers.influence);
    assert.deepEqual(restored.prominence, layers.prominence);
    assert.equal(restored.revision, 5);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function withChecksum(backup) {
  const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
      : JSON.stringify(value);
  const { checksum, ...payload } = backup;
  return { ...payload, checksum: createHash("sha256").update(canonical(payload)).digest("hex") };
}

test("rejects malformed embedded JSON and broken seat ownership even with a recomputed checksum", () => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const backup = exportRuntimeSave(database, "gm-owner", seeded.campaignId);
    const invalidJson = structuredClone(backup);
    invalidJson.data.characters[0].fields_json = "broken JSON";
    const invalidSeat = structuredClone(backup);
    invalidSeat.data.playerSeats[0].account_id = "gm-owner";
    for (const invalid of [invalidJson, invalidSeat]) {
      assert.throws(() => restoreRuntimeSave(database, "gm-owner", seeded.campaignId, withChecksum(invalid), {
        confirmReplace: true, expectedRevision: 0
      }), /Invalid/);
      assert.deepEqual(exportRuntimeSave(database, "gm-owner", seeded.campaignId, { now: () => backup.exportedAt }), backup);
    }
  } finally { database.close(); }
});

test("runtime backup round-trips dashboard and preserves record IDs and monotonic revision", () => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const before = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    const originalCharacterId = database.prepare("SELECT id FROM characters WHERE campaign_id = ?").get(seeded.campaignId).id;
    const originalSeatId = database.prepare("SELECT id FROM player_seats WHERE campaign_id = ?").get(seeded.campaignId).id;
    const originalPersonnelIds = database.prepare("SELECT id FROM personnel WHERE campaign_id = ? ORDER BY sort_order").all(seeded.campaignId).map(({ id }) => id);
    const backup = exportRuntimeSave(database, "gm-owner", seeded.campaignId, { now: () => "2026-11-01T10:00:00.000Z" });

    updateRuntimeDashboard(database, "gm-owner", seeded.campaignId, {
      dashboard: { rationsDays: 2, weather: "Fog" },
      personnel: before.personnel.slice(0, 1),
      journal: []
    }, { now: () => Date.parse("2026-11-01T10:10:00.000Z") });
    const changed = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    assert.equal(changed.dashboard.rationsDays, 2);
    assert.equal(changed.personnel.length, 1);
    assert.equal(changed.journal.length, 0);

    assert.throws(() => restoreRuntimeSave(database, "gm-owner", seeded.campaignId, backup, {
      confirmReplace: true,
      expectedRevision: changed.campaign.revision
    }), /older than the active campaign/);
    assert.equal(getRuntimeDashboard(database, "gm-owner", seeded.campaignId).dashboard.rationsDays, 2);

    assert.throws(() => restoreRuntimeSave(database, "gm-owner", seeded.campaignId, backup, {
      confirmReplace: true,
      confirmOlderBackup: true,
      expectedRevision: changed.campaign.revision - 1
    }), /revision changed/);

    const result = restoreRuntimeSave(database, "gm-owner", seeded.campaignId, backup, {
      confirmReplace: true,
      confirmOlderBackup: true,
      expectedRevision: changed.campaign.revision,
      now: () => Date.parse("2026-11-01T10:20:00.000Z")
    });
    const restored = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    assert.equal(result.restoredFromRevision, before.campaign.revision);
    assert.equal(restored.dashboard.rationsDays, before.dashboard.rationsDays);
    assert.equal(restored.dashboard.weather, before.dashboard.weather);
    assert.equal(restored.personnel.length, before.personnel.length);
    assert.equal(restored.journal.length, before.journal.length);
    assert.equal(restored.campaign.revision, changed.campaign.revision + 1);
    assert.deepEqual(database.prepare("SELECT id FROM personnel WHERE campaign_id = ? ORDER BY sort_order").all(seeded.campaignId).map(({ id }) => id), originalPersonnelIds);
    assert.equal(database.prepare("SELECT id FROM characters WHERE campaign_id = ?").get(seeded.campaignId).id, originalCharacterId);
    assert.equal(database.prepare("SELECT id FROM player_seats WHERE campaign_id = ?").get(seeded.campaignId).id, originalSeatId);
  } finally {
    database.close();
  }
});

test("runtime restore rejects bad checksums and rolls back database failures atomically", () => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const backup = exportRuntimeSave(database, "gm-owner", seeded.campaignId);
    const badChecksum = { ...backup, checksum: "0".repeat(64) };
    assert.throws(() => restoreRuntimeSave(database, "gm-owner", seeded.campaignId, badChecksum, {
      confirmReplace: true,
      expectedRevision: 0
    }), /checksum is invalid/);

    updateRuntimeDashboard(database, "gm-owner", seeded.campaignId, { dashboard: { rationsDays: 1 } });
    const beforeFailure = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    database.exec(`CREATE TRIGGER reject_restore_personnel BEFORE INSERT ON personnel
      BEGIN SELECT RAISE(ABORT, 'injected restore failure'); END`);
    assert.throws(() => restoreRuntimeSave(database, "gm-owner", seeded.campaignId, backup, {
      confirmReplace: true,
      confirmOlderBackup: true,
      expectedRevision: beforeFailure.campaign.revision
    }), /injected restore failure/);
    const afterFailure = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    assert.equal(afterFailure.dashboard.rationsDays, 1);
    assert.equal(afterFailure.campaign.revision, beforeFailure.campaign.revision);
    assert.equal(afterFailure.personnel.length, beforeFailure.personnel.length);
  } finally {
    database.close();
  }
});

test("runtime backups and restores are isolated to the campaign owner", () => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    createGm(database, "other-gm", "other-gm");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const backup = exportRuntimeSave(database, "gm-owner", seeded.campaignId);
    const revision = getRuntimeDashboard(database, "gm-owner", seeded.campaignId).campaign.revision;
    assert.ok(backup);
    assert.equal(exportRuntimeSave(database, "other-gm", seeded.campaignId), null);
    assert.throws(() => restoreRuntimeSave(database, "other-gm", seeded.campaignId, backup, {
      confirmReplace: true,
      expectedRevision: revision
    }), /Runtime campaign not found/);
  } finally {
    database.close();
  }
});

test("runtime backup HTTP routes export and restore only for the owning GM", async (t) => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    createGm(database, "other-gm", "other-gm");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const timestamp = new Date().toISOString();
    const ownerToken = randomBytes(32).toString("base64url");
    const otherToken = randomBytes(32).toString("base64url");
    database.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(createHash("sha256").update(ownerToken).digest("hex"), "gm-owner", timestamp, "2099-01-01T00:00:00.000Z");
    database.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(createHash("sha256").update(otherToken).digest("hex"), "other-gm", timestamp, "2099-01-01T00:00:00.000Z");
    const server = http.createServer(createAppHandler({ database, authHandler: createAuthHandler({ database }) }));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(() => resolve())));
    const origin = `http://127.0.0.1:${server.address().port}`;

    const exportResponse = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/backup`, {
      headers: { Cookie: `fieldbook_session=${ownerToken}` }
    });
    assert.equal(exportResponse.status, 200);
    const backup = (await exportResponse.json()).backup;
    assert.equal(backup.backupType, "fieldbook.campaign-runtime");

    const otherExport = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/backup`, {
      headers: { Cookie: `fieldbook_session=${otherToken}` }
    });
    assert.equal(otherExport.status, 404);

    const currentRevision = getRuntimeDashboard(database, "gm-owner", seeded.campaignId).campaign.revision;
    const updateResponse = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${ownerToken}` },
      body: JSON.stringify({ dashboard: { rationsDays: 2 } })
    });
    assert.equal(updateResponse.status, 200);

    const conflict = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${ownerToken}` },
      body: JSON.stringify({ backup, confirmReplace: true, confirmOlderBackup: true, expectedRevision: currentRevision })
    });
    assert.equal(conflict.status, 409);

    const invalidBackup = { ...backup, checksum: "0".repeat(64) };
    const invalidRestore = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${ownerToken}` },
      body: JSON.stringify({ backup: invalidBackup, confirmReplace: true, confirmOlderBackup: true, expectedRevision: currentRevision + 1 })
    });
    assert.equal(invalidRestore.status, 422);
    assert.equal(getRuntimeDashboard(database, "gm-owner", seeded.campaignId).dashboard.rationsDays, 2);

    const otherRestore = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${otherToken}` },
      body: JSON.stringify({ backup, confirmReplace: true, confirmOlderBackup: true, expectedRevision: currentRevision + 1 })
    });
    assert.equal(otherRestore.status, 404);

    const restored = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${ownerToken}` },
      body: JSON.stringify({ backup, confirmReplace: true, confirmOlderBackup: true, expectedRevision: currentRevision + 1 })
    });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).restore.revision, currentRevision + 2);
    assert.equal(getRuntimeDashboard(database, "gm-owner", seeded.campaignId).dashboard.rationsDays, 6);
  } finally {
    database.close();
  }
});

test("file-backed recovery preserves rows and does not modify another campaign owned by the same GM", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-backup-test-"));
  const path = join(directory, "runtime.sqlite");
  let database;
  try {
    database = openRuntimeDatabase(path);
    createGm(database, "gm-owner", "gm-owner");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const setup = sampleSetupPackage();
    setup.campaign.id = "independent-setup";
    setup.campaign.name = "Independent campaign";
    const second = importSetupPackage(database, JSON.stringify(setup), { ownerAccountId: "gm-owner" });
    const backup = exportRuntimeSave(database, "gm-owner", seeded.campaignId);
    const independent = exportRuntimeSave(database, "gm-owner", second.runtimeCampaignId);
    updateRuntimeDashboard(database, "gm-owner", seeded.campaignId, { dashboard: { rationsDays: 0 } });
    assert.throws(() => restoreRuntimeSave(database, "gm-owner", second.runtimeCampaignId, backup, {
      confirmReplace: true, expectedRevision: 0
    }), /does not match/);
    restoreRuntimeSave(database, "gm-owner", seeded.campaignId, backup, {
      confirmReplace: true, confirmOlderBackup: true, expectedRevision: 1
    });
    database.close();
    database = openRuntimeDatabase(path);
    const recovered = exportRuntimeSave(database, "gm-owner", seeded.campaignId);
    for (const key of Object.keys(backup.data).filter((key) => !["campaign", "auditEvents"].includes(key))) {
      assert.deepEqual(recovered.data[key], backup.data[key], `${key} survived recovery`);
    }
    assert.equal(recovered.data.auditEvents.at(-1).action, "campaign.restore");
    backup.data.auditEvents.forEach((event) => assert.ok(recovered.data.auditEvents.some((saved) => saved.id === event.id)));
    assert.equal(recovered.sourceRevision, 2);
    assert.deepEqual(exportRuntimeSave(database, "gm-owner", second.runtimeCampaignId, {
      now: () => independent.exportedAt
    }), independent);
  } finally {
    database?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
