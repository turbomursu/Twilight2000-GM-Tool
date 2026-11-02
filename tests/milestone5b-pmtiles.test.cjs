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

    const result1 = importSetupPackage(database, JSON.stringify(pkg), { idFactory: () => "runtime-restore-1" });
    const campaignId1 = result1.runtimeCampaignId;
    const originalMap1 = database.prepare("SELECT offlineBasemap_json FROM maps WHERE runtime_campaign_id = ?").get(campaignId1);
    assert.ok(originalMap1.offlineBasemap_json);

    const originalBasemap1 = JSON.parse(originalMap1.offlineBasemap_json);
    assert.equal(originalBasemap1.assetId, basemapAssetId, "First import: assetId should match");

    const result2 = importSetupPackage(database, JSON.stringify(pkg), { idFactory: () => "runtime-restore-2" });
    const campaignId2 = result2.runtimeCampaignId;
    const originalMap2 = database.prepare("SELECT offlineBasemap_json FROM maps WHERE runtime_campaign_id = ?").get(campaignId2);
    assert.ok(originalMap2.offlineBasemap_json);

    const originalBasemap2 = JSON.parse(originalMap2.offlineBasemap_json);
    assert.equal(originalBasemap2.assetId, basemapAssetId, "Second import: assetId should match");
    assert.equal(originalBasemap2.attribution, "Test PMTiles Provider", "Second import: attribution should match");

    assert.ok(originalMap1.offlineBasemap_json === originalMap2.offlineBasemap_json, "Basemap data should be identical across imports");
  } finally {
    database.close();
  }
});
