const { test } = require("node:test");
const { strict: assert } = require("node:assert");
const { randomUUID } = require("node:crypto");
const { openRuntimeDatabase, importSetupPackage, restoreRuntimeSave } = require("../server/runtime-store.cjs");
const { createHash } = require("node:crypto");

test("offline basemap is stored in maps table during import", () => {
  const database = openRuntimeDatabase();
  try {
    const basemapAssetId = randomUUID();
    const pkg = {
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
        offlineBasemap: {
          format: "raster-pmtiles",
          assetId: basemapAssetId,
          attribution: "Test PMTiles Provider"
        },
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

    const result = importSetupPackage(database, JSON.stringify(pkg), { idFactory: () => "runtime-basemap-1" });
    assert.equal(result.runtimeCampaignId, "runtime-basemap-1");

    const map = database.prepare("SELECT offlineBasemap_json FROM maps WHERE runtime_campaign_id = ?").get("runtime-basemap-1");
    assert.ok(map);
    const basemap = JSON.parse(map.offlineBasemap_json);
    assert.ok(basemap);
    assert.equal(basemap.assetId, basemapAssetId);
    assert.equal(basemap.format, "raster-pmtiles");
    assert.equal(basemap.attribution, "Test PMTiles Provider");
  } finally {
    database.close();
  }
});

test("offline basemap is null when not provided in setup package", () => {
  const database = openRuntimeDatabase();
  try {
    const pkg = {
      packageType: "fieldbook.campaign-setup",
      schemaVersion: 2,
      campaign: { id: "setup-campaign-2", name: "Northbound Online", setting: "Dalarna", premise: "A column travels north.", era: "2000" },
      map: {
        id: "map-2",
        name: "Vansbro sector",
        bounds: { south: 59, west: 13, north: 61, east: 15 },
        center: { lat: 60, lng: 14 },
        zoom: 8,
        fieldPapersAtlas: { id: "atlas-1" },
        attribution: "© OpenStreetMap contributors",
        offlineAnnotations: [],
        offlineBasemap: null,
        grid: { coordinateSystem: "axial-q-r", cellKm: 10, terrainCells: [{ q: 1, r: -2, terrainType: "forest" }] },
        locations: [{
          id: "location-2", name: "Vansbro", kind: "Settlement", description: "Starting town",
          gridRef: "1,-2", coordinates: { q: 1, r: -2 }, mapPosition: { lat: 60, lng: 14 },
          visibility: "gm-only", isStartingLocation: true
        }]
      },
      factions: [{ id: "faction-2", name: "Local Guard", description: "A regional force", color: "#42735a", influenceCells: ["1,-2"] }],
      settlements: [{
        id: "settlement-2", locationId: "location-2", name: "Vansbro", prominentFactionIds: ["faction-2"],
        scale: "Town", populationEstimate: 1200, security: "Uneasy", attitude: "Wary", leadership: "Council", situation: "Short on fuel."
      }],
      scenarioNotes: [{ id: "note-2", title: "Bridge", body: "Status unknown.", visibility: "gm-only" }]
    };

    const result = importSetupPackage(database, JSON.stringify(pkg), { idFactory: () => "runtime-no-basemap" });

    const map = database.prepare("SELECT offlineBasemap_json FROM maps WHERE runtime_campaign_id = ?").get("runtime-no-basemap");
    assert.ok(map);
    assert.equal(map.offlineBasemap_json, null);
  } finally {
    database.close();
  }
});

test("offline basemap survives campaign restore from backup", () => {
  const database = openRuntimeDatabase();
  try {
    const basemapAssetId = randomUUID();
    const pkg = {
      packageType: "fieldbook.campaign-setup",
      schemaVersion: 2,
      campaign: { id: "setup-campaign-restore", name: "Restore Test", setting: "Test", premise: "Restore test.", era: "2000" },
      map: {
        id: "map-restore",
        name: "Vansbro sector",
        bounds: { south: 59, west: 13, north: 61, east: 15 },
        center: { lat: 60, lng: 14 },
        zoom: 8,
        fieldPapersAtlas: { id: "atlas-1" },
        attribution: "© OpenStreetMap contributors",
        offlineAnnotations: [],
        offlineBasemap: {
          format: "raster-pmtiles",
          assetId: basemapAssetId,
          attribution: "Test PMTiles Provider"
        },
        grid: { coordinateSystem: "axial-q-r", cellKm: 10, terrainCells: [{ q: 1, r: -2, terrainType: "forest" }] },
        locations: [{
          id: "location-3", name: "Vansbro", kind: "Settlement", description: "Starting town",
          gridRef: "1,-2", coordinates: { q: 1, r: -2 }, mapPosition: { lat: 60, lng: 14 },
          visibility: "gm-only", isStartingLocation: true
        }]
      },
      factions: [{ id: "faction-3", name: "Local Guard", description: "A regional force", color: "#42735a", influenceCells: ["1,-2"] }],
      settlements: [{
        id: "settlement-3", locationId: "location-3", name: "Vansbro", prominentFactionIds: ["faction-3"],
        scale: "Town", populationEstimate: 1200, security: "Uneasy", attitude: "Wary", leadership: "Council", situation: "Short on fuel."
      }],
      scenarioNotes: [{ id: "note-3", title: "Bridge", body: "Status unknown.", visibility: "gm-only" }]
    };

    const result = importSetupPackage(database, JSON.stringify(pkg), { idFactory: () => "runtime-restore" });
    const campaignId = result.runtimeCampaignId;

    const originalMap = database.prepare("SELECT offlineBasemap_json FROM maps WHERE runtime_campaign_id = ?").get(campaignId);
    assert.ok(originalMap.offlineBasemap_json);

    const backup = {
      backupType: "fieldbook.campaign-runtime",
      schemaVersion: 1,
      campaignId,
      sourceRevision: 0,
      exportedAt: new Date().toISOString(),
      data: {
        campaign: { runtime_id: campaignId, setup_campaign_id: pkg.campaign.id, schema_version: 1, name: pkg.campaign.name, setting: pkg.campaign.setting, premise: pkg.campaign.premise, era: pkg.campaign.era, revision: 0, active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        setupImport: { runtime_campaign_id: campaignId, source_campaign_id: pkg.campaign.id, schema_version: 2, imported_at: new Date().toISOString(), sha256: createHash("sha256").update(JSON.stringify(pkg), "utf8").digest("hex"), source_json: JSON.stringify(pkg) },
        campaignMemberships: [],
        accountReferences: [],
        maps: [{
          runtime_campaign_id: campaignId,
          source_map_id: "map-restore",
          name: "Vansbro sector",
          bounds_json: JSON.stringify(pkg.map.bounds),
          center_json: JSON.stringify(pkg.map.center),
          zoom: 8,
          atlas_json: JSON.stringify({ id: "atlas-1" }),
          annotations_json: JSON.stringify([]),
          offlineBasemap_json: JSON.stringify({ assetId: basemapAssetId, format: "raster-pmtiles", attribution: "Test PMTiles Provider" }),
          attribution: "© OpenStreetMap contributors"
        }],
        terrainCells: [{ runtime_campaign_id: campaignId, q: 1, r: -2, terrain_type: "forest" }],
        locations: [{
          runtime_campaign_id: campaignId, id: "location-3", name: "Vansbro", kind: "Settlement",
          description: "Starting town", grid_ref: "1,-2", coordinates_json: '{"q":1,"r":-2}', map_position_json: JSON.stringify({ lat: 60, lng: 14 }),
          visibility_eligibility: "gm-only", is_starting_location: 1
        }],
        settlements: [{ runtime_campaign_id: campaignId, id: "settlement-3", source_location_id: "location-3", name: "Vansbro", scale: "Town", population_estimate: 1200, security: "Uneasy", attitude: "Wary", leadership: "Council", situation: "Short on fuel." }],
        factions: [{ runtime_campaign_id: campaignId, id: "faction-3", name: "Local Guard", description: "A regional force", color: "#42735a" }],
        factionInfluenceCells: [],
        settlementFactions: [{ runtime_campaign_id: campaignId, settlement_id: "settlement-3", faction_id: "faction-3", prominence_rank: 0 }],
        gmNotes: [{ runtime_campaign_id: campaignId, id: "note-3", title: "Bridge", body: "Status unknown.", visibility: "gm-only" }],
        routeStops: [],
        personnel: [],
        journalEntries: [],
        characters: [],
        playerSeats: [],
        characterChangeRequests: [],
        commsMessages: [],
        inventoryItems: [],
        inventoryProposals: [],
        characterConditions: [],
        auditEvents: [],
        dailySupplyUsage: [],
        dashboardState: { campaign_id: campaignId, game_date: "2000-05-11", game_time: "00:00", day_number: 1, distance_km: 0, rations_days: 0, fuel_units: 0, weather: "Clear", weather_note: "", weather_last_roll_shift: "", weather_cloudy_shifts_remaining: 0, active_stop_index: 0, updated_at: new Date().toISOString() }
      }
    };

    function canonicalJson(value) {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
      }
      return JSON.stringify(value);
    }

    const payload = { backupType: backup.backupType, schemaVersion: backup.schemaVersion, campaignId: backup.campaignId, sourceRevision: backup.sourceRevision, exportedAt: backup.exportedAt, data: backup.data };
    backup.checksum = createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");

    restoreRuntimeSave(database, "gm-1", campaignId, backup, { confirmReplace: true, expectedRevision: 0 });

    const restoredMap = database.prepare("SELECT offlineBasemap_json FROM maps WHERE runtime_campaign_id = ?").get(campaignId);
    assert.ok(restoredMap.offlineBasemap_json);
    const basemap = JSON.parse(restoredMap.offlineBasemap_json);
    assert.equal(basemap.assetId, basemapAssetId);
    assert.equal(basemap.attribution, "Test PMTiles Provider");
  } finally {
    database.close();
  }
});
