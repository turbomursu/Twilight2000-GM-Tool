const assert = require("node:assert/strict");
const test = require("node:test");
const { openRuntimeDatabase, exportRuntimeSave, restoreRuntimeSave } = require("../server/runtime-store.cjs");
const { seedSampleRuntime } = require("../server/sample-data.cjs");
const { emptyConditions, updateGMConditions, getGMConditions } = require("../server/conditions.cjs");
const { listAuditEvents, validateAuditBackup } = require("../server/audit.cjs");
const { manageGMInventory, createInventoryProposal, reviewInventoryProposal, getPlayerInventory } = require("../server/inventory.cjs");
const { updateGMReport } = require("../server/situation-reports.cjs");
const { getGMMap, updateGMMap } = require("../server/map-publications.cjs");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

function fixture(path = ":memory:") {
  const database = openRuntimeDatabase(path); const timestamp = new Date().toISOString();
  database.prepare(`INSERT INTO accounts (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
    VALUES ('audit-gm', 'audit-gm', 'test-only-hash', 0, ?, ?, 'gm')`).run(timestamp, timestamp);
  const { campaignId } = seedSampleRuntime(database, "audit-gm");
  const characterId = database.prepare("SELECT character_id FROM player_seats WHERE campaign_id = ?").get(campaignId).character_id;
  return { database, campaignId, characterId };
}

function rechecksum(backup) {
  const payload = { ...backup }; delete payload.checksum;
  const canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical)
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  backup.checksum = require("node:crypto").createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
  return backup;
}

test("file-backed audit history survives reopen and failed restore logging rolls back data and history", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-audit-")); const path = join(directory, "runtime.sqlite");
  const fixtureData = fixture(path); let database = fixtureData.database;
  const { campaignId, characterId } = fixtureData;
  try {
    const update = { characterId, expectedRevision: 0, conditions: { ...emptyConditions(), damage: 2 }, gmNotes: "Private" };
    updateGMConditions(database, "audit-gm", campaignId, update);
    const backup = exportRuntimeSave(database, "audit-gm", campaignId);
    updateGMConditions(database, "audit-gm", campaignId, { ...update, expectedRevision: 1, conditions: { ...update.conditions, damage: 7 } });
    const events = listAuditEvents(database, "audit-gm", campaignId).events;
    database.close(); database = openRuntimeDatabase(path);
    assert.deepEqual(listAuditEvents(database, "audit-gm", campaignId).events, events);
    database.exec("CREATE TRIGGER fail_restore_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'restore audit failure'); END;");
    assert.throws(() => restoreRuntimeSave(database, "audit-gm", campaignId, backup,
      { expectedRevision: 2, confirmReplace: true, confirmOlderBackup: true }), /restore audit failure/);
    assert.equal(getGMConditions(database, "audit-gm", campaignId).characters[0].conditions.damage, 7);
    assert.deepEqual(listAuditEvents(database, "audit-gm", campaignId).events, events);
    database.exec("DROP TRIGGER fail_restore_audit");
    restoreRuntimeSave(database, "audit-gm", campaignId, backup, { expectedRevision: 2, confirmReplace: true, confirmOlderBackup: true });
    database.close(); database = openRuntimeDatabase(path);
    const recovered = listAuditEvents(database, "audit-gm", campaignId).events;
    assert.equal(recovered.length, 3); assert.equal(recovered[0].action, "campaign.restore");
    assert.equal(getGMConditions(database, "audit-gm", campaignId).characters[0].conditions.damage, 2);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("restore retains later audit history, merges recovered events, and rejects conflicts atomically", () => {
  const { database, campaignId, characterId } = fixture();
  try {
    updateGMConditions(database, "audit-gm", campaignId, { characterId, expectedRevision: 0, conditions: emptyConditions(), gmNotes: "" });
    const backup = exportRuntimeSave(database, "audit-gm", campaignId);
    const firstId = backup.data.auditEvents[0].id;
    updateGMConditions(database, "audit-gm", campaignId, { characterId, expectedRevision: 1, clear: true });
    const secondId = listAuditEvents(database, "audit-gm", campaignId).events[0].id;
    const restored = restoreRuntimeSave(database, "audit-gm", campaignId, backup,
      { expectedRevision: 2, confirmReplace: true, confirmOlderBackup: true });
    const events = listAuditEvents(database, "audit-gm", campaignId).events;
    assert.equal(events.length, 3); assert.equal(events[0].action, "campaign.restore");
    assert.equal(events[1].id, secondId); assert.equal(events[2].id, firstId);
    assert.deepEqual(events[0].campaignRevision, { before: 2, after: 3 });
    const conflict = structuredClone(backup.data); conflict.auditEvents[0].actor_label = "forged";
    const conflictingBackup = rechecksum({ ...structuredClone(backup), data: conflict });
    assert.throws(() => restoreRuntimeSave(database, "audit-gm", campaignId, conflictingBackup,
      { expectedRevision: restored.revision, confirmReplace: true, confirmOlderBackup: true }), /conflicts/);
    assert.equal(getGMConditions(database, "audit-gm", campaignId).characters[0].revision, 3);
    assert.deepEqual(listAuditEvents(database, "audit-gm", campaignId).events, events);
    database.exec("BEGIN IMMEDIATE");
    assert.throws(() => require("../server/audit.cjs").mergeAuditBackup(database, campaignId, conflict.auditEvents), /conflicts/);
    database.exec("ROLLBACK");
    const recovered = structuredClone(backup.data.auditEvents[0]); recovered.id = "recovered-test-event";
    database.exec("BEGIN IMMEDIATE");
    require("../server/audit.cjs").mergeAuditBackup(database, campaignId, [recovered]);
    database.exec("COMMIT");
    assert.equal(listAuditEvents(database, "audit-gm", campaignId).events[0].origin, "backup");
    const invalid = structuredClone(backup.data); invalid.auditEvents[0].campaign_id = "other-campaign";
    invalid.auditEvents[0].action = "forged.action";
    assert.throws(() => validateAuditBackup(invalid), /Invalid audit/);
    const older = structuredClone(backup); delete older.data.auditEvents;
    rechecksum(older);
    restoreRuntimeSave(database, "audit-gm", campaignId, older, { expectedRevision: restored.revision, confirmReplace: true, confirmOlderBackup: true });
    assert.equal(listAuditEvents(database, "audit-gm", campaignId).events.length, 5);
  } finally { database.close(); }
});

test("inventory decisions and report/map mutations are audited but previews and rejected writes are not", () => {
  const { database, campaignId, characterId } = fixture();
  try {
    const playerId = database.prepare("SELECT account_id FROM player_seats WHERE campaign_id = ?").get(campaignId).account_id;
    const item = { name: "GM kit <img src=x>", quantity: 2, carryLocation: "backpack", sourceCategory: "GM", sourceReference: "Campaign ruling", details: "PRIVATE ITEM DETAILS" };
    manageGMInventory(database, "audit-gm", campaignId, { kind: "add", characterId, item, confirmSource: true });
    const accepted = getPlayerInventory(database, playerId, campaignId).items[0];
    manageGMInventory(database, "audit-gm", campaignId, { kind: "update", characterId, itemId: accepted.id, expectedItemRevision: 0, item: { ...item, quantity: 3 }, confirmSource: true });
    const proposal = createInventoryProposal(database, playerId, campaignId, { kind: "add", item }).proposal;
    assert.throws(() => reviewInventoryProposal(database, "audit-gm", campaignId, proposal.id, { decision: "approve" }), /Confirm/);
    reviewInventoryProposal(database, "audit-gm", campaignId, proposal.id, { decision: "approve", sourceCategory: "GM", sourceReference: "Campaign", confirmSource: true });
    const rejected = createInventoryProposal(database, playerId, campaignId, { kind: "add", item }).proposal;
    reviewInventoryProposal(database, "audit-gm", campaignId, rejected.id, { decision: "reject", reviewNote: "PRIVATE REVIEW NOTE" });
    updateGMReport(database, "audit-gm", campaignId, { action: "draft", expectedRevision: 0, draft: { title: "Report", body: "PRIVATE REPORT BODY", gameTime: "Day 14" } });
    updateGMReport(database, "audit-gm", campaignId, { action: "preview", expectedRevision: 1 });
    updateGMReport(database, "audit-gm", campaignId, { action: "publish", expectedRevision: 1 });
    updateGMReport(database, "audit-gm", campaignId, { action: "withdraw", expectedRevision: 2 });
    const catalog = getGMMap(database, "audit-gm", campaignId).catalog;
    updateGMMap(database, "audit-gm", campaignId, { action: "draft", expectedRevision: 0,
      draft: { locationIds: [], markings: [], routeLocationIds: [], playerPosition: catalog.locations[0].position } });
    updateGMMap(database, "audit-gm", campaignId, { action: "preview", expectedRevision: 1 });
    updateGMMap(database, "audit-gm", campaignId, { action: "publish", expectedRevision: 1 });
    updateGMMap(database, "audit-gm", campaignId, { action: "withdraw", expectedRevision: 2 });
    const history = listAuditEvents(database, "audit-gm", campaignId);
    assert.equal(history.events.length, 10);
    assert.deepEqual(history.events.map((event) => event.action).reverse(), ["inventory.add", "inventory.update", "inventory.approve.add", "inventory.reject",
      "report.draft", "report.publish", "report.withdraw", "map.draft", "map.publish", "map.withdraw"]);
    assert.equal(history.events.find((event) => event.action === "inventory.approve.add").target.relatedId, proposal.id);
    assert.doesNotMatch(JSON.stringify(history), /PRIVATE ITEM DETAILS|PRIVATE REVIEW NOTE|PRIVATE REPORT BODY/);
  } finally { database.close(); }
});

test("condition audit events are server-derived, owner-only, append-only, and atomic", () => {
  const { database, campaignId, characterId } = fixture();
  try {
    const update = { characterId, expectedRevision: 0, conditions: { ...emptyConditions(), damage: 2 }, gmNotes: "PRIVATE GM NOTES" };
    updateGMConditions(database, "audit-gm", campaignId, update);
    let history = listAuditEvents(database, "audit-gm", campaignId);
    assert.equal(history.events.length, 1);
    assert.equal(history.events[0].actor.label, "audit-gm");
    assert.equal(history.events[0].action, "conditions.save");
    assert.deepEqual(history.events[0].revision, { before: 0, after: 1 });
    assert.deepEqual(history.events[0].campaignRevision, { before: 0, after: 1 });
    assert.equal(history.events[0].target.id, characterId);
    assert.equal(history.events[0].origin, "live");
    assert.doesNotMatch(JSON.stringify(history), /PRIVATE GM NOTES|password/);
    assert.equal(listAuditEvents(database, "another-gm", campaignId), null);
    assert.throws(() => database.prepare("UPDATE audit_events SET actor_label = 'forged'").run(), /append-only/);
    assert.throws(() => database.prepare("DELETE FROM audit_events").run(), /append-only/);
    database.exec("CREATE TRIGGER fail_audit_insert BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'audit insert failure'); END;");
    assert.throws(() => updateGMConditions(database, "audit-gm", campaignId, { ...update, expectedRevision: 1, conditions: { ...update.conditions, damage: 5 } }), /audit insert failure/);
    assert.equal(getGMConditions(database, "audit-gm", campaignId).characters[0].conditions.damage, 2);
    assert.equal(listAuditEvents(database, "audit-gm", campaignId).events.length, 1);
    database.exec("DROP TRIGGER fail_audit_insert");
    updateGMConditions(database, "audit-gm", campaignId, { characterId, expectedRevision: 1, clear: true });
    history = listAuditEvents(database, "audit-gm", campaignId, { limit: 1 });
    assert.equal(history.events[0].action, "conditions.clear");
    assert.deepEqual(history.events[0].revision, { before: 1, after: 2 });
    assert.equal(listAuditEvents(database, "audit-gm", campaignId, { limit: 1, before: history.nextBefore }).events[0].action, "conditions.save");
  } finally { database.close(); }
});