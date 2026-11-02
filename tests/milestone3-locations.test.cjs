const test = require("node:test");
const assert = require("node:assert");
const { openRuntimeDatabase } = require("../server/runtime-store.cjs");

let db;

test("Phase 3.1: Location Management", async (suite) => {
  // Setup database and test GM account
  suite.beforeEach(() => {
    db = openRuntimeDatabase(":memory:");
    
    // Create test account
    db.prepare(`
      INSERT INTO accounts (id, login_identifier, password_hash, disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("test-gm-id", "testgm", "hash_placeholder", 0, new Date().toISOString(), new Date().toISOString());
    
    // Create test campaign
    db.prepare(`
      INSERT INTO campaigns (runtime_id, setup_campaign_id, schema_version, name, setting, premise, era, revision, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "test-campaign-id",
      "setup-campaign-id",
      1,
      "Test Campaign",
      "Test Setting",
      "Test Premise",
      "2000",
      0,
      1,
      new Date().toISOString(),
      new Date().toISOString()
    );
    
    // Assign GM
    db.prepare(`
      INSERT INTO campaign_memberships (campaign_id, account_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `).run("test-campaign-id", "test-gm-id", "gm", new Date().toISOString());
    
    // Create test map with bounds
    db.prepare(`
      INSERT INTO maps (runtime_campaign_id, source_map_id, name, bounds_json, center_json, zoom, atlas_json, annotations_json, attribution)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "test-campaign-id",
      null,
      "Test Map",
      JSON.stringify({ south: 60, north: 62, west: 14, east: 16 }),
      JSON.stringify({ lat: 61, lng: 15 }),
      10,
      null,
      JSON.stringify([]),
      "Test Attribution"
    );
  });

  await suite.test("Create location with valid data", () => {
    const { listLocationsForCampaign, createLocation } = require("../server/runtime-store.cjs");
    
    const location = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Sälen",
      kind: "Settlement",
      description: "Small mountain village",
      gridRef: "A1",
      mapPosition: { lat: 61.4, lng: 14.9 },
      visibilityEligibility: "players"
    });
    
    assert.ok(location, "Location should be created");
    assert.equal(location.name, "Sälen");
    assert.equal(location.kind, "Settlement");
    assert.equal(location.visibility_eligibility, "players");
    
    const all = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(all.length, 1);
    assert.equal(all[0].name, "Sälen");
  });

  await suite.test("Create location rejects empty name", () => {
    const { createLocation } = require("../server/runtime-store.cjs");
    
    assert.throws(() => {
      createLocation(db, "test-gm-id", "test-campaign-id", {
        name: "",
        kind: "Settlement",
        mapPosition: { lat: 61.4, lng: 14.9 }
      });
    }, /name/i);
  });

  await suite.test("Create location rejects out-of-bounds coordinates", () => {
    const { createLocation } = require("../server/runtime-store.cjs");
    
    assert.throws(() => {
      createLocation(db, "test-gm-id", "test-campaign-id", {
        name: "Outside",
        kind: "Settlement",
        mapPosition: { lat: 70, lng: 15 } // 70 is outside bounds
      });
    }, /out of bounds/i);
  });

  await suite.test("Create location requires valid visibility setting", () => {
    const { createLocation } = require("../server/runtime-store.cjs");
    
    assert.throws(() => {
      createLocation(db, "test-gm-id", "test-campaign-id", {
        name: "Test",
        kind: "Settlement",
        mapPosition: { lat: 61.4, lng: 14.9 },
        visibilityEligibility: "invalid"
      });
    }, /gm-only.*players/i);
  });

  await suite.test("Create location enforces campaign ownership", () => {
    const { createLocation } = require("../server/runtime-store.cjs");
    
    assert.throws(() => {
      createLocation(db, "other-gm-id", "test-campaign-id", {
        name: "Test",
        kind: "Settlement",
        mapPosition: { lat: 61.4, lng: 14.9 }
      });
    }, /access denied|not found/i);
  });

  await suite.test("List locations for campaign", () => {
    const { createLocation, listLocationsForCampaign } = require("../server/runtime-store.cjs");
    
    createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Sälen",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Mora",
      kind: "Checkpoint",
      mapPosition: { lat: 61.5, lng: 14.8 }
    });
    
    const locations = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(locations.length, 2);
    assert.deepEqual(locations.map(l => l.name).sort(), ["Mora", "Sälen"]);
  });

  await suite.test("List locations returns proper format with mapPosition", () => {
    const { createLocation, listLocationsForCampaign } = require("../server/runtime-store.cjs");
    
    createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Test",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 },
      gridRef: "A1"
    });
    
    const locations = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(locations[0].mapPosition.lat, 61.4);
    assert.equal(locations[0].mapPosition.lng, 14.9);
    assert.equal(locations[0].gridRef, "A1");
  });

  await suite.test("Update location changes properties", () => {
    const { createLocation, updateLocation, listLocationsForCampaign } = require("../server/runtime-store.cjs");
    
    const created = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Sälen",
      kind: "Settlement",
      description: "Original",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    updateLocation(db, "test-gm-id", "test-campaign-id", created.id, {
      name: "Sälen Updated",
      description: "Updated description",
      mapPosition: { lat: 61.41, lng: 14.91 }
    });
    
    const locations = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(locations[0].name, "Sälen Updated");
    assert.equal(locations[0].description, "Updated description");
    assert.equal(locations[0].mapPosition.lat, 61.41);
  });

  await suite.test("Update location validates coordinates within bounds", () => {
    const { createLocation, updateLocation } = require("../server/runtime-store.cjs");
    
    const created = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Sälen",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    assert.throws(() => {
      updateLocation(db, "test-gm-id", "test-campaign-id", created.id, {
        mapPosition: { lat: 70, lng: 15 }
      });
    }, /out of bounds/i);
  });

  await suite.test("Update rejects if location not found", () => {
    const { updateLocation } = require("../server/runtime-store.cjs");
    
    assert.throws(() => {
      updateLocation(db, "test-gm-id", "test-campaign-id", "nonexistent-id", {
        name: "Test"
      });
    }, /not found/i);
  });

  await suite.test("Update enforces campaign ownership", () => {
    const { createLocation, updateLocation } = require("../server/runtime-store.cjs");
    
    const created = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Sälen",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    assert.throws(() => {
      updateLocation(db, "other-gm-id", "test-campaign-id", created.id, {
        name: "Hacked"
      });
    }, /access denied|not found/i);
  });

  await suite.test("Delete location removes from database", () => {
    const { createLocation, deleteLocation, listLocationsForCampaign } = require("../server/runtime-store.cjs");
    
    const created = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Sälen",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    let locations = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(locations.length, 1);
    
    deleteLocation(db, "test-gm-id", "test-campaign-id", created.id);
    
    locations = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(locations.length, 0);
  });

  await suite.test("Delete location rejects if in route", () => {
    const { createLocation, deleteLocation } = require("../server/runtime-store.cjs");
    
    const location = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Sälen",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    // Add location to route
    db.prepare(`
      INSERT INTO route_stops (campaign_id, ordinal, location_id, detail, km_from_previous)
      VALUES (?, ?, ?, ?, ?)
    `).run("test-campaign-id", 0, location.id, "Starting point", 0);
    
    assert.throws(() => {
      deleteLocation(db, "test-gm-id", "test-campaign-id", location.id);
    }, /used in the campaign route/i);
  });

  await suite.test("Delete location enforces campaign ownership", () => {
    const { createLocation, deleteLocation } = require("../server/runtime-store.cjs");
    
    const created = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Sälen",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    assert.throws(() => {
      deleteLocation(db, "other-gm-id", "test-campaign-id", created.id);
    }, /access denied|not found/i);
  });

  await suite.test("Delete location not found throws error", () => {
    const { deleteLocation } = require("../server/runtime-store.cjs");
    
    assert.throws(() => {
      deleteLocation(db, "test-gm-id", "test-campaign-id", "nonexistent-id");
    }, /not found/i);
  });

  await suite.test("Full lifecycle: create, update, list, delete", () => {
    const { createLocation, updateLocation, deleteLocation, listLocationsForCampaign } = require("../server/runtime-store.cjs");
    
    // Create
    const loc1 = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Sälen",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    const loc2 = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Mora",
      kind: "Checkpoint",
      mapPosition: { lat: 61.5, lng: 14.8 }
    });
    
    // List
    let all = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(all.length, 2);
    
    // Update
    updateLocation(db, "test-gm-id", "test-campaign-id", loc1.id, {
      name: "Sälen Updated"
    });
    
    all = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.ok(all.find(l => l.name === "Sälen Updated"));
    
    // Delete
    deleteLocation(db, "test-gm-id", "test-campaign-id", loc1.id);
    
    all = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(all.length, 1);
    assert.equal(all[0].id, loc2.id);
  });

  await suite.test("Multiple locations persist correctly", () => {
    const { createLocation, listLocationsForCampaign } = require("../server/runtime-store.cjs");
    
    const names = ["Sälen", "Mora", "Orsa", "Gävle"];
    for (const name of names) {
      createLocation(db, "test-gm-id", "test-campaign-id", {
        name,
        kind: "Settlement",
        mapPosition: { lat: 61 + Math.random(), lng: 14 + Math.random() }
      });
    }
    
    const locations = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(locations.length, 4);
    assert.deepEqual(
      locations.map(l => l.name).sort(),
      names.sort()
    );
  });

  await suite.test("Locations isolated by campaign", () => {
    const { createLocation, listLocationsForCampaign } = require("../server/runtime-store.cjs");
    
    // Create second campaign
    db.prepare(`
      INSERT INTO campaigns (runtime_id, setup_campaign_id, schema_version, name, setting, premise, era, revision, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "test-campaign-2",
      "setup-campaign-2",
      1,
      "Campaign 2",
      "Setting 2",
      "Premise 2",
      "2000",
      0,
      1,
      new Date().toISOString(),
      new Date().toISOString()
    );
    
    db.prepare(`
      INSERT INTO campaign_memberships (campaign_id, account_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `).run("test-campaign-2", "test-gm-id", "gm", new Date().toISOString());
    
    db.prepare(`
      INSERT INTO maps (runtime_campaign_id, source_map_id, name, bounds_json, center_json, zoom, atlas_json, annotations_json, attribution)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "test-campaign-2",
      null,
      "Test Map 2",
      JSON.stringify({ south: 60, north: 62, west: 14, east: 16 }),
      JSON.stringify({ lat: 61, lng: 15 }),
      10,
      null,
      JSON.stringify([]),
      "Test Attribution"
    );
    
    // Create locations in both campaigns
    createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Location A",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    createLocation(db, "test-gm-id", "test-campaign-2", {
      name: "Location B",
      kind: "Settlement",
      mapPosition: { lat: 61.5, lng: 14.8 }
    });
    
    // Verify isolation
    const campaign1Locs = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    const campaign2Locs = listLocationsForCampaign(db, "test-gm-id", "test-campaign-2");
    
    assert.equal(campaign1Locs.length, 1);
    assert.equal(campaign1Locs[0].name, "Location A");
    assert.equal(campaign2Locs.length, 1);
    assert.equal(campaign2Locs[0].name, "Location B");
  });

  await suite.test("Location visibility settings persist correctly", () => {
    const { createLocation, listLocationsForCampaign } = require("../server/runtime-store.cjs");
    
    createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "GM Secret",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 },
      visibilityEligibility: "gm-only"
    });
    
    createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Public Location",
      kind: "Settlement",
      mapPosition: { lat: 61.5, lng: 14.8 },
      visibilityEligibility: "players"
    });
    
    const locations = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    
    const gmSecret = locations.find(l => l.name === "GM Secret");
    assert.equal(gmSecret.visibilityEligibility, "gm-only");
    
    const publicLoc = locations.find(l => l.name === "Public Location");
    assert.equal(publicLoc.visibilityEligibility, "players");
  });

  await suite.test("Location kind field allows various types", () => {
    const { createLocation, listLocationsForCampaign } = require("../server/runtime-store.cjs");
    
    const kinds = ["Settlement", "Checkpoint", "Supply Cache", "Base", "Ruin", "Point of Interest", "Other"];
    
    for (let i = 0; i < kinds.length; i++) {
      createLocation(db, "test-gm-id", "test-campaign-id", {
        name: `Location ${i}`,
        kind: kinds[i],
        mapPosition: { lat: 61.0 + (i * 0.05), lng: 14.9 }
      });
    }
    
    const locations = listLocationsForCampaign(db, "test-gm-id", "test-campaign-id");
    assert.equal(locations.length, kinds.length);
    
    for (const kind of kinds) {
      assert.ok(locations.some(l => l.kind === kind), `Kind ${kind} should be in locations`);
    }
  });

  await suite.test("Campaign revision incremented on location changes", () => {
    const { createLocation, updateLocation, deleteLocation } = require("../server/runtime-store.cjs");
    
    let campaign = db.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get("test-campaign-id");
    const initialRevision = campaign.revision;
    
    const loc = createLocation(db, "test-gm-id", "test-campaign-id", {
      name: "Test",
      kind: "Settlement",
      mapPosition: { lat: 61.4, lng: 14.9 }
    });
    
    campaign = db.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get("test-campaign-id");
    assert.equal(campaign.revision, initialRevision + 1);
    
    updateLocation(db, "test-gm-id", "test-campaign-id", loc.id, { name: "Updated" });
    
    campaign = db.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get("test-campaign-id");
    assert.equal(campaign.revision, initialRevision + 2);
    
    deleteLocation(db, "test-gm-id", "test-campaign-id", loc.id);
    
    campaign = db.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get("test-campaign-id");
    assert.equal(campaign.revision, initialRevision + 3);
  });
});
