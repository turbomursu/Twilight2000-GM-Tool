const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { openRuntimeDatabase, importSetupPackage } = require("../server/runtime-store.cjs");

function validSetupPackage() {
  return {
    packageType: "fieldbook.campaign-setup",
    schemaVersion: 2,
    campaign: { id: "setup-campaign-1", name: "Northbound", setting: "Dalarna", premise: "A column travels north.", era: "2000" },
    map: {
      id: "map-1",
      name: "Vansbro sector",
      bounds: { south: 59, west: 13, north: 61, east: 15 },
      center: { lat: 60, lng: 14 },
      zoom: 8,
      fieldPapersAtlas: { id: "atlas-1" },
      attribution: "© OpenStreetMap contributors",
      offlineAnnotations: [],
      grid: { coordinateSystem: "axial-q-r", cellKm: 10, terrainCells: [{ q: 1, r: -2, terrainType: "forest" }] },
      locations: [{
        id: "location-1", name: "Vansbro", kind: "Settlement", description: "Starting town",
        gridRef: "1,-2", coordinates: { q: 1, r: -2 }, mapPosition: { lat: 60, lng: 14 },
        visibility: "gm-only", isStartingLocation: true
      }]
    },
    factions: [{ id: "faction-1", name: "Local Guard", description: "A regional force", color: "#42735a", influenceCells: ["1,-2"] }],
    settlements: [{
      id: "settlement-1", locationId: "location-1", name: "Vansbro", prominentFactionIds: ["faction-1"],
      scale: "Town", populationEstimate: 1200, security: "Uneasy", attitude: "Wary", leadership: "Council", situation: "Short on fuel."
    }],
    scenarioNotes: [{ id: "note-1", title: "Bridge", body: "Status unknown.", visibility: "gm-only" }]
  };
}

test("imports a setup package as an independent runtime campaign and preserves its source", () => {
  const database = openRuntimeDatabase();
  try {
    const sourceJson = JSON.stringify(validSetupPackage());
    const result = importSetupPackage(database, sourceJson, { idFactory: () => "runtime-campaign-1", now: () => "2026-10-31T12:00:00.000Z" });

    assert.deepEqual(result, {
      runtimeCampaignId: "runtime-campaign-1",
      sourceCampaignId: "setup-campaign-1",
      schemaVersion: 1,
      checksum: result.checksum
    });
    assert.notEqual(result.runtimeCampaignId, result.sourceCampaignId);
    assert.equal(database.prepare("SELECT name FROM campaigns WHERE runtime_id = ?").get(result.runtimeCampaignId).name, "Northbound");
    assert.equal(database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(result.runtimeCampaignId).source_json, sourceJson);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM terrain_cells WHERE runtime_campaign_id = ?").get(result.runtimeCampaignId).count, 1);
    assert.equal(database.prepare("SELECT visibility_eligibility FROM locations WHERE runtime_campaign_id = ?").get(result.runtimeCampaignId).visibility_eligibility, "gm-only");
    assert.equal(database.prepare("SELECT prominence_rank FROM settlement_factions WHERE runtime_campaign_id = ?").get(result.runtimeCampaignId).prominence_rank, 0);
    assert.equal(database.prepare("SELECT visibility FROM gm_notes WHERE runtime_campaign_id = ?").get(result.runtimeCampaignId).visibility, "gm-only");
  } finally {
    database.close();
  }
});

test("rejects malformed setup input without creating a runtime campaign", () => {
  const database = openRuntimeDatabase();
  try {
    const input = validSetupPackage();
    input.schemaVersion = 99;
    assert.throws(() => importSetupPackage(database, JSON.stringify(input)), /schema version 2/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM campaigns").get().count, 0);
  } finally {
    database.close();
  }
});

test("persists the runtime campaign and source snapshot across database reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-runtime-test-"));
  const databasePath = join(directory, "campaign.sqlite");
  let database;
  try {
    const sourceJson = JSON.stringify(validSetupPackage());
    database = openRuntimeDatabase(databasePath);
    const result = importSetupPackage(database, sourceJson, { idFactory: () => "runtime-persistent-1" });
    database.close();
    database = null;

    database = openRuntimeDatabase(databasePath);
    assert.equal(database.prepare("SELECT name FROM campaigns WHERE runtime_id = ?").get(result.runtimeCampaignId).name, "Northbound");
    assert.equal(database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(result.runtimeCampaignId).source_json, sourceJson);
  } finally {
    if (database) database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("upgrades either version 21 database layout to the merged schema", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-runtime-migration-test-"));
  const databasePath = join(directory, "campaign.sqlite");
  let database;
  try {
    database = openRuntimeDatabase(databasePath);
    database.exec("DROP TABLE conflict_incidents; PRAGMA user_version = 21");
    database.close();
    database = openRuntimeDatabase(databasePath);
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 22);
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'conflict_incidents'").get());
    assert.ok(database.prepare("PRAGMA table_info(accounts)").all().some(({ name }) => name === "must_change_password"));
    database.exec("ALTER TABLE accounts DROP COLUMN must_change_password; PRAGMA user_version = 21");
    database.close();
    database = openRuntimeDatabase(databasePath);
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 22);
    assert.ok(database.prepare("PRAGMA table_info(accounts)").all().some(({ name }) => name === "must_change_password"));
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'conflict_incidents'").get());
  } finally {
    if (database) database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rolls back all rows when a database constraint fails during import", () => {
  const database = openRuntimeDatabase();
  try {
    database.exec(`CREATE TRIGGER reject_faction BEFORE INSERT ON factions
      BEGIN SELECT RAISE(ABORT, 'injected database failure'); END`);
    assert.throws(() => importSetupPackage(database, JSON.stringify(validSetupPackage())), /injected database failure/);
    for (const table of ["campaigns", "setup_imports", "maps", "locations", "settlements", "factions", "gm_notes"]) {
      assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0, `${table} should be empty after rollback`);
    }
  } finally {
    database.close();
  }
});