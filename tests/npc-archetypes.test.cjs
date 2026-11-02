const assert = require("node:assert/strict");
const test = require("node:test");
const { listNPCArchetypes, getNPCArchetype, createPersonnelFromArchetype, openRuntimeDatabase } = require("../server/runtime-store.cjs");
const { randomUUID } = require("node:crypto");

async function setupTestCampaign(t, database) {
  const gmId = randomUUID();
  const campaignId = randomUUID();
  const timestamp = new Date().toISOString();
  
  database.prepare("INSERT INTO accounts (id, login_identifier, password_hash, global_role, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(gmId, `gm-${randomUUID()}`, "hash", "gm", 0, timestamp, timestamp);
  
  database.prepare(`INSERT INTO campaigns
    (runtime_id, setup_campaign_id, schema_version, name, setting, premise, era, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(campaignId, randomUUID(), 1, "Test Campaign", "Twilight War", "After WWIII", "1990s", 1, timestamp, timestamp);
  
  database.prepare("INSERT INTO campaign_memberships (campaign_id, account_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(campaignId, gmId, "gm", timestamp);
  
  database.prepare("INSERT INTO runtime_dashboard_state (campaign_id, game_date, day_number, distance_km, rations_days, fuel_units, weather, weather_note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(campaignId, "1990-07-04", 1, 0, 0, 0, "clear", "", timestamp);
  
  return { gmId, campaignId, timestamp };
}

test("NPC Archetypes — Loading and listing", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const archetypes = listNPCArchetypes(database, null);
  
  assert(Array.isArray(archetypes));
  assert(archetypes.length > 0, "Should load default NPC archetypes");
  
  const archetypeIds = archetypes.map(a => a.id);
  assert(archetypeIds.includes("us-soldier"), "Should include US Soldier archetype");
  assert(archetypeIds.includes("soviet-soldier"), "Should include Soviet Soldier archetype");
  assert(archetypeIds.includes("civilian-refugee"), "Should include Refugee archetype");
});

test("NPC Archetypes — Archetype structure validation", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const usOfficer = getNPCArchetype(database, "us-officer");
  assert(usOfficer !== null, "Should retrieve US Officer archetype");
  
  assert.strictEqual(usOfficer.name, "US Officer");
  assert.strictEqual(usOfficer.category, "us-military");
  assert.strictEqual(usOfficer.attributes.strength, "C");
  assert.strictEqual(usOfficer.attributes.agility, "B");
  assert.strictEqual(usOfficer.attributes.intelligence, "B");
  assert.strictEqual(usOfficer.attributes.empathy, "B");
  assert.strictEqual(usOfficer.hitCap, 5);
  assert.strictEqual(usOfficer.cufRating, "C");
  assert(Array.isArray(usOfficer.skills), "Skills should be an array");
  assert(usOfficer.skills.length > 0, "Should have at least one skill");
  assert(Array.isArray(usOfficer.equipment), "Equipment should be an array");
  assert(usOfficer.equipment.length > 0, "Should have at least one equipment item");
});

test("NPC Archetypes — Get non-existent archetype returns null", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const nonexistent = getNPCArchetype(database, "non-existent-id");
  assert.strictEqual(nonexistent, null);
});

test("Personnel creation from archetype", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const { gmId, campaignId } = await setupTestCampaign(t, database);
  
  const personnel = createPersonnelFromArchetype(database, gmId, campaignId, "us-soldier", {
    name: "Pvt. Williams",
    role: "Rifleman",
    condition: "OK",
    readiness: "ready"
  });
  
  assert(personnel !== undefined, "Should create personnel");
  assert.strictEqual(personnel.name, "Pvt. Williams");
  assert.strictEqual(personnel.attribute_strength, "B");
  assert.strictEqual(personnel.attribute_agility, "B");
  assert.strictEqual(personnel.attribute_intelligence, "C");
  assert.strictEqual(personnel.attribute_empathy, "C");
  assert.strictEqual(personnel.hit_cap, 5);
  assert.strictEqual(personnel.cuf_rating, "C");
  assert.strictEqual(personnel.archetype_id, "us-soldier");
  assert.strictEqual(personnel.morale_state, "normal");
  assert.strictEqual(personnel.stress_damage, 0);
  
  const skills = JSON.parse(personnel.skills_json);
  assert(Array.isArray(skills), "Skills should be parsed from JSON");
  assert(skills.length > 0, "Should have inherited skills from archetype");
});

test("Personnel creation with default values", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const { gmId, campaignId } = await setupTestCampaign(t, database);
  
  const personnel = createPersonnelFromArchetype(database, gmId, campaignId, "civilian-hunter", {
    name: "Scout"
  });
  
  assert.strictEqual(personnel.name, "Scout");
  assert.strictEqual(personnel.condition, "OK");
  assert.strictEqual(personnel.readiness, "ready");
  assert.strictEqual(personnel.role, "civilian");
});

test("Personnel creation requires GM role", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const playerId = randomUUID();
  const campaignId = randomUUID();
  const timestamp = new Date().toISOString();
  
  database.prepare("INSERT INTO accounts (id, login_identifier, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(playerId, `player-${randomUUID()}`, "hash", timestamp, timestamp);
  
  database.prepare(`INSERT INTO campaigns
    (runtime_id, setup_campaign_id, schema_version, name, setting, premise, era, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(campaignId, randomUUID(), 1, "Test", "Setting", "Premise", "Era", 0, timestamp, timestamp);
  
  database.prepare("INSERT INTO campaign_memberships (campaign_id, account_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(campaignId, playerId, "player", timestamp);
  
  assert.throws(
    () => createPersonnelFromArchetype(database, playerId, campaignId, "us-soldier", { name: "Test" }),
    /Campaign not found or access denied/
  );
});

test("Personnel creation with non-existent archetype fails", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const { gmId, campaignId } = await setupTestCampaign(t, database);
  
  assert.throws(
    () => createPersonnelFromArchetype(database, gmId, campaignId, "invalid-id", { name: "Test" }),
    /NPC archetype not found/
  );
});

test("Personnel creation requires name", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const { gmId, campaignId } = await setupTestCampaign(t, database);
  
  assert.throws(
    () => createPersonnelFromArchetype(database, gmId, campaignId, "us-soldier", { name: "" }),
    /Personnel name is missing/
  );
});

test("Personnel inherit all archetype data correctly", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const { gmId, campaignId } = await setupTestCampaign(t, database);
  
  const sovietSpetsnaz = getNPCArchetype(database, "soviet-spetsnaz");
  const personnel = createPersonnelFromArchetype(database, gmId, campaignId, "soviet-spetsnaz", {
    name: "Sgt. Ivanov"
  });
  
  assert.deepStrictEqual(
    personnel.attribute_strength,
    sovietSpetsnaz.attributes.strength,
    "Should inherit correct strength attribute"
  );
  assert.deepStrictEqual(
    personnel.attribute_agility,
    sovietSpetsnaz.attributes.agility,
    "Should inherit correct agility attribute"
  );
  assert.strictEqual(
    JSON.stringify(JSON.parse(personnel.skills_json)),
    JSON.stringify(sovietSpetsnaz.skills),
    "Should inherit exact skills"
  );
  assert.strictEqual(
    JSON.stringify(JSON.parse(personnel.equipment_json)),
    JSON.stringify(sovietSpetsnaz.equipment),
    "Should inherit exact equipment"
  );
});

test("Multiple archetypes represent different military nationalities", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const archetypes = listNPCArchetypes(database, null);
  
  const categories = new Set(archetypes.map(a => a.category));
  assert(categories.has("us-military"), "Should have US military archetypes");
  assert(categories.has("soviet-military"), "Should have Soviet military archetypes");
  assert(categories.has("civilian"), "Should have civilian archetypes");
  assert(categories.has("other-military"), "Should have other military archetypes");
});

test("Archetype categories are consistent", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const archetypes = listNPCArchetypes(database, null);
  
  for (const archetype of archetypes) {
    assert(
      ["civilian", "us-military", "soviet-military", "other-military"].includes(archetype.category),
      `Archetype ${archetype.id} has invalid category: ${archetype.category}`
    );
  }
});

test("All archetypes have valid attribute ratings", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const archetypes = listNPCArchetypes(database, null);
  const validRatings = ["A", "B", "C", "D"];
  
  for (const archetype of archetypes) {
    for (const attr of ["strength", "agility", "intelligence", "empathy"]) {
      assert(
        validRatings.includes(archetype.attributes[attr]),
        `${archetype.name}: Invalid ${attr} rating ${archetype.attributes[attr]}`
      );
    }
  }
});

test("All archetypes have valid CUF ratings", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const archetypes = listNPCArchetypes(database, null);
  const validCUF = ["A", "B", "C", "D"];
  
  for (const archetype of archetypes) {
    assert(
      validCUF.includes(archetype.cufRating),
      `${archetype.name}: Invalid CUF rating ${archetype.cufRating}`
    );
  }
});

test("All archetypes have reasonable hit caps", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const archetypes = listNPCArchetypes(database, null);
  
  for (const archetype of archetypes) {
    assert(
      Number.isInteger(archetype.hitCap) && archetype.hitCap >= 3 && archetype.hitCap <= 12,
      `${archetype.name}: Invalid hit cap ${archetype.hitCap}`
    );
  }
});

test("Created personnel maintains sort order", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  
  const { gmId, campaignId } = await setupTestCampaign(t, database);
  
  const p1 = createPersonnelFromArchetype(database, gmId, campaignId, "us-soldier", { name: "First" });
  assert.strictEqual(p1.sort_order, 0, `First personnel should have sort_order 0, got ${p1.sort_order}`);
  
  const p2 = createPersonnelFromArchetype(database, gmId, campaignId, "us-soldier", { name: "Second" });
  assert.strictEqual(p2.sort_order, 1, `Second personnel should have sort_order 1, got ${p2.sort_order}`);
  
  const p3 = createPersonnelFromArchetype(database, gmId, campaignId, "us-soldier", { name: "Third" });
  assert.strictEqual(p3.sort_order, 2, `Third personnel should have sort_order 2, got ${p3.sort_order}`);
});
