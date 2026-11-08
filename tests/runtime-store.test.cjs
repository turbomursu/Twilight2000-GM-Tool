const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { openRuntimeDatabase, importSetupPackage, getRuntimeDashboard, updateRuntimeDashboard, exportRuntimeSave, restoreRuntimeSave } = require("../server/runtime-store.cjs");
const coordinates = require("../map-coordinates.js");

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

test("hex waypoint saves use the declared grid in both coordinate spaces and roll back invalid drafts", () => {
  for (const image of [false, true]) {
    const database = openRuntimeDatabase();
    try {
      database.prepare(`INSERT INTO accounts (id, login_identifier, password_hash, global_role, created_at, updated_at)
        VALUES ('gm', 'gm', 'test-hash', 'gm', '2026-11-08', '2026-11-08')`).run();
      const setup = validSetupPackage();
      setup.map.grid.origin = null;
      if (image) {
        setup.map.bounds = { type: "image-km", widthPixels: 600, heightPixels: 300, widthKm: 60 };
        setup.map.center = { x: 30, y: 15 };
        setup.map.fieldPapersAtlas = null;
        setup.map.grid.origin = { x: 0, y: 30 };
        setup.map.offlineBasemap = { format: "static-image", assetId: "00000000-0000-4000-8000-000000000001", attribution: "Test" };
        setup.map.locations[0].mapPosition = { x: 2, y: 3 };
      }
      const result = importSetupPackage(database, JSON.stringify(setup), { ownerAccountId: "gm", validateOfflineBasemap() {} });
      const id = result.runtimeCampaignId;
      let runtime = getRuntimeDashboard(database, "gm", id);
      const first = { locationId: runtime.route[0].locationId, detail: "Start", kmFromPrevious: 0 };
      const hex = { q: 2, r: -1 };
      const save = (route, account = "gm", revision = runtime.campaign.revision) =>
        updateRuntimeDashboard(database, account, id, { route, expectedRevision: revision });
      const waypoint = { hex, detail: "Waypoint", kmFromPrevious: 0 };
      assert.throws(() => save([first, waypoint], "other"), /not found/);
      assert.throws(() => save([first, waypoint], "gm", runtime.campaign.revision + 1), /revision changed/);
      assert.throws(() => save([first, waypoint, { hex: { q: 9999, r: 9999 }, detail: "Bad", kmFromPrevious: 0 }]), /outside/);
      assert.equal(database.prepare("SELECT COUNT(*) AS n FROM locations WHERE runtime_campaign_id = ?").get(id).n, 1);
      assert.throws(() => save([first, waypoint, waypoint]), /same location/);
      assert.equal(database.prepare("SELECT COUNT(*) AS n FROM locations WHERE runtime_campaign_id = ?").get(id).n, 1);
      database.prepare(`INSERT INTO party_position (campaign_id, lat, lng, updated_at) VALUES (?, ?, ?, '2026-11-08T00:00:00.000Z')`)
        .run(id, image ? 3 : 60, image ? 2 : 14);
      const partyBefore = database.prepare("SELECT * FROM party_position WHERE campaign_id = ?").get(id);
      runtime = save([first, waypoint]);
      const center = coordinates.hexGeometry(2, -1, { ...setup.map.grid, origin: setup.map.grid.origin || { lat: 61, lng: 13 } }, setup.map.bounds).position;
      assert.deepEqual(runtime.route[1].mapPosition, center);
      const location = database.prepare("SELECT * FROM locations WHERE id = ? AND runtime_campaign_id = ?").get(runtime.route[1].locationId, id);
      assert.equal(location.visibility_eligibility, "gm-only");
      assert.equal(location.grid_ref, "2,-1");
      assert.deepEqual(JSON.parse(location.coordinates_json), hex);
      const locationId = runtime.route[1].locationId;
      runtime = save([first, waypoint]);
      assert.equal(runtime.route[1].locationId, locationId, "repeat saves reuse the center location");
      assert.equal(database.prepare("SELECT COUNT(*) AS n FROM locations WHERE runtime_campaign_id = ?").get(id).n, 2);
      assert.deepEqual(database.prepare("SELECT * FROM party_position WHERE campaign_id = ?").get(id), partyBefore);
      assert.equal(runtime.dashboard.activeStopIndex, 0);
      const reopened = getRuntimeDashboard(database, "gm", id);
      assert.deepEqual(reopened.route, runtime.route);
      const backup = exportRuntimeSave(database, "gm", id);
      assert.doesNotThrow(() => restoreRuntimeSave(database, "gm", id, backup, {
        expectedRevision: runtime.campaign.revision, confirmReplace: true, validateOfflineBasemap() {}
      }));
      assert.equal(backup.data.setupImport.source_json, JSON.stringify(setup));
    } finally {
      database.close();
    }
  }
});

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
    assert.equal(database.prepare("SELECT game_date FROM runtime_dashboard_state WHERE campaign_id = ?").get(result.runtimeCampaignId).game_date, "2000-01-01");
    assert.equal(database.prepare("SELECT location_id FROM route_stops WHERE campaign_id = ? AND ordinal = 0").get(result.runtimeCampaignId).location_id, "location-1");
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
    database.exec("DROP TABLE conflict_incidents; DROP TABLE roll_table_catalog; PRAGMA user_version = 21");
    database.close();
    database = openRuntimeDatabase(databasePath);
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 24);
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'conflict_incidents'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'roll_table_catalog'").get());
    assert.equal(JSON.parse(database.prepare("SELECT catalog_json FROM roll_table_catalog WHERE id = 1").get().catalog_json).tables.length, 17);
    assert.ok(database.prepare("PRAGMA table_info(accounts)").all().some(({ name }) => name === "must_change_password"));
    database.exec("ALTER TABLE accounts DROP COLUMN must_change_password; DROP TABLE roll_table_catalog; PRAGMA user_version = 21");
    database.close();
    database = openRuntimeDatabase(databasePath);
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 24);
    assert.ok(database.prepare("PRAGMA table_info(accounts)").all().some(({ name }) => name === "must_change_password"));
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'conflict_incidents'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'roll_table_catalog'").get());
    assert.equal(JSON.parse(database.prepare("SELECT catalog_json FROM roll_table_catalog WHERE id = 1").get().catalog_json).tables.length, 17);
  } finally {
    if (database) database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("version 23 upgrades add the supplied D100 table only to an untouched shared catalog", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-roll-table-catalog-migration-"));
  const databasePath = join(directory, "campaign.sqlite");
  let database;
  try {
    database = openRuntimeDatabase(databasePath);
    const catalogRow = database.prepare("SELECT catalog_json FROM roll_table_catalog WHERE id = 1").get();
    const oldCatalog = JSON.parse(catalogRow.catalog_json);
    oldCatalog.tables = oldCatalog.tables.filter(({ id }) => id !== "stationary-encounters");
    database.prepare("UPDATE roll_table_catalog SET catalog_json = ? WHERE id = 1").run(JSON.stringify(oldCatalog));
    database.exec("PRAGMA user_version = 23");
    database.close();

    database = openRuntimeDatabase(databasePath);
    const upgraded = JSON.parse(database.prepare("SELECT catalog_json FROM roll_table_catalog WHERE id = 1").get().catalog_json);
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 24);
    assert.equal(upgraded.tables.find(({ id }) => id === "stationary-encounters").dice, "1d100");
    assert.equal(upgraded.tables.length, 17);

    database.prepare("UPDATE roll_table_catalog SET revision = 3, catalog_json = ? WHERE id = 1")
      .run(JSON.stringify({ schemaVersion: 1, tables: [] }));
    database.exec("PRAGMA user_version = 23");
    database.close();

    database = openRuntimeDatabase(databasePath);
    const customized = database.prepare("SELECT revision, catalog_json FROM roll_table_catalog WHERE id = 1").get();
    assert.equal(customized.revision, 3);
    assert.deepEqual(JSON.parse(customized.catalog_json), { schemaVersion: 1, tables: [] });
  } finally {
    if (database) database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("imports initialize a loadable, backup-valid dashboard at the declared starting location", () => {
  const database = openRuntimeDatabase();
  try {
    const timestamp = "2026-11-05T22:00:00.000Z";
    database.prepare(`INSERT INTO accounts
      (id, login_identifier, password_hash, global_role, created_at, updated_at)
      VALUES ('gm-import', 'gm-import', 'test-hash', 'gm', ?, ?)`).run(timestamp, timestamp);
    const source = validSetupPackage();
    source.campaign.era = "Descriptive date label, not parsed";
    source.map.locations.unshift({
      ...source.map.locations[0], id: "other-location", name: "Not the start", isStartingLocation: false
    });
    const sourceJson = JSON.stringify(source);
    const result = importSetupPackage(database, sourceJson, { ownerAccountId: "gm-import", now: () => timestamp });
    let runtime = getRuntimeDashboard(database, "gm-import", result.runtimeCampaignId);
    assert.equal(runtime.campaign.id, result.runtimeCampaignId);
    assert.deepEqual({ ...runtime.dashboard }, {
      gameDate: "2000-01-01", gameTime: "00:00", dayNumber: 0, distanceKm: 0,
      rationsDays: 0, fuelUnits: 0, weather: "Not recorded",
      weatherNote: "Initial bookkeeping baseline: set the campaign date, weather, and supplies before play. Setup era is a descriptive label, not a runtime date.",
      weatherLastRollShift: "", weatherCloudyShiftsRemaining: 0, activeStopIndex: 0, updatedAt: timestamp
    });
    assert.equal(runtime.route.length, 1);
    assert.equal(runtime.route[0].locationId, "location-1");
    assert.equal(runtime.route[0].kmFromPrevious, 0);
    assert.deepEqual(runtime.personnel, []);
    assert.deepEqual(runtime.journal, []);
    const backup = exportRuntimeSave(database, "gm-import", result.runtimeCampaignId);
    assert.doesNotThrow(() => restoreRuntimeSave(database, "gm-import", result.runtimeCampaignId, backup, {
      expectedRevision: runtime.campaign.revision, confirmReplace: true
    }));
    runtime = getRuntimeDashboard(database, "gm-import", result.runtimeCampaignId);
    assert.equal(backup.data.setupImport.source_json, sourceJson);
    assert.equal(getRuntimeDashboard(database, "foreign-gm", result.runtimeCampaignId), null);
    const second = importSetupPackage(database, sourceJson, { ownerAccountId: "gm-import" });
    assert.notEqual(second.runtimeCampaignId, result.runtimeCampaignId);
    assert.deepEqual(getRuntimeDashboard(database, "gm-import", result.runtimeCampaignId), runtime);
  } finally {
    database.close();
  }
});

test("rolls back all rows when runtime initialization fails during import", () => {
  const database = openRuntimeDatabase();
  try {
    database.exec(`CREATE TRIGGER reject_initial_route BEFORE INSERT ON route_stops
      BEGIN SELECT RAISE(ABORT, 'injected database failure'); END`);
    assert.throws(() => importSetupPackage(database, JSON.stringify(validSetupPackage())), /injected database failure/);
    for (const table of ["campaigns", "setup_imports", "maps", "locations", "settlements", "factions", "gm_notes", "runtime_dashboard_state", "route_stops"]) {
      assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0, `${table} should be empty after rollback`);
    }
  } finally {
    database.close();
  }
});