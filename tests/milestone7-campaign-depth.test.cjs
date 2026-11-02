/**
 * Milestone 7: Campaign Depth Service Tests
 *
 * Comprehensive test suite for:
 * - Faction management and relationships
 * - Settlement resources
 * - Campaign events/rumors
 * - Threat tracker
 */

const test = require("node:test");
const assert = require("node:assert");
const { DatabaseSync } = require("node:sqlite");
const service = require("../server/campaign-depth-service.cjs");
const store = require("../server/runtime-store.cjs");

// Helper: Create isolated test database
function createTestDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  // Initialize schema via runtime-store initialization
  const initialized = store.openRuntimeDatabase(":memory:");
  const schema = `
    PRAGMA foreign_keys = ON;
    
    CREATE TABLE campaigns (
      runtime_id TEXT PRIMARY KEY,
      setup_campaign_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL CHECK (schema_version = 1),
      name TEXT NOT NULL,
      setting TEXT NOT NULL,
      premise TEXT NOT NULL,
      era TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE factions (
      runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      color TEXT,
      PRIMARY KEY (runtime_campaign_id, id)
    ) STRICT;

    CREATE TABLE settlements (
      runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      source_location_id TEXT,
      name TEXT NOT NULL,
      scale TEXT,
      population_estimate INTEGER,
      security TEXT,
      attitude TEXT,
      leadership TEXT,
      situation TEXT NOT NULL,
      PRIMARY KEY (runtime_campaign_id, id)
    ) STRICT;

    CREATE TABLE faction_relationships (
      runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
      from_faction_id TEXT NOT NULL,
      to_faction_id TEXT NOT NULL,
      attitude TEXT NOT NULL CHECK (attitude IN ('allied', 'neutral', 'hostile', 'unknown')),
      notes TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (runtime_campaign_id, from_faction_id, to_faction_id),
      FOREIGN KEY (runtime_campaign_id, from_faction_id) REFERENCES factions(runtime_campaign_id, id) ON DELETE CASCADE,
      FOREIGN KEY (runtime_campaign_id, to_faction_id) REFERENCES factions(runtime_campaign_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE settlement_resources (
      runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
      settlement_id TEXT NOT NULL,
      resource_type TEXT NOT NULL CHECK (resource_type IN ('food', 'water', 'fuel', 'ammunition', 'medical', 'shelter', 'intel', 'other')),
      status TEXT NOT NULL CHECK (status IN ('available', 'scarce', 'needed', 'unknown')),
      notes TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (runtime_campaign_id, settlement_id, resource_type),
      FOREIGN KEY (runtime_campaign_id, settlement_id) REFERENCES settlements(runtime_campaign_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE campaign_events (
      runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('rumor', 'event', 'discovery', 'faction-action', 'settlement-change', 'threat', 'other')),
      event_date TEXT NOT NULL,
      linked_faction_id TEXT,
      linked_settlement_id TEXT,
      is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
      gm_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (runtime_campaign_id, id),
      FOREIGN KEY (runtime_campaign_id, linked_faction_id) REFERENCES factions(runtime_campaign_id, id) ON DELETE SET NULL,
      FOREIGN KEY (runtime_campaign_id, linked_settlement_id) REFERENCES settlements(runtime_campaign_id, id) ON DELETE SET NULL
    ) STRICT;

    CREATE TABLE threat_entries (
      runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      threat_level TEXT NOT NULL CHECK (threat_level IN ('low', 'medium', 'high', 'critical')),
      status TEXT NOT NULL CHECK (status IN ('emerging', 'active', 'contained', 'resolved')),
      antagonist_type TEXT NOT NULL CHECK (antagonist_type IN ('faction', 'individual', 'force', 'event', 'other')),
      linked_faction_id TEXT,
      linked_settlement_id TEXT,
      goal TEXT DEFAULT '',
      resources_json TEXT DEFAULT '[]',
      gm_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (runtime_campaign_id, id),
      FOREIGN KEY (runtime_campaign_id, linked_faction_id) REFERENCES factions(runtime_campaign_id, id) ON DELETE SET NULL,
      FOREIGN KEY (runtime_campaign_id, linked_settlement_id) REFERENCES settlements(runtime_campaign_id, id) ON DELETE SET NULL
    ) STRICT;
  `;

  db.exec(schema);
  initialized.close();
  return db;
}

// Helper: Create test campaign
function createTestCampaign(db) {
  const campaignId = "test-campaign-" + Math.random().toString(36).substr(2, 9);
  db.prepare(`
    INSERT INTO campaigns (runtime_id, setup_campaign_id, schema_version, name, setting, premise, era, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
  `).run(campaignId, "setup-" + campaignId, "Test Campaign", "Twilight: 2000", "Cold War", "Fourth Edition", new Date().toISOString(), new Date().toISOString());

  return campaignId;
}

// Helper: Create test faction
function createTestFaction(db, campaignId, name = "Test Faction") {
  return service.createFaction(db, campaignId, {
    name,
    description: "Test description",
    color: "#FF0000",
    leader: "Test Leader",
    goal: "Test goal",
    strength: "medium",
    notes: "Test notes"
  });
}

// Helper: Create test settlement
function createTestSettlement(db, campaignId, name = "Test Settlement") {
  const id = "settlement-" + Math.random().toString(36).substr(2, 9);
  db.prepare(`
    INSERT INTO settlements (runtime_campaign_id, id, name, situation)
    VALUES (?, ?, ?, ?)
  `).run(campaignId, id, name, "Peaceful");
  return id;
}

// Tests: Faction Management
test("Faction: Create faction with full data", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  const faction = createTestFaction(db, campaignId, "NATO Command");
  
  assert.ok(faction.id);
  assert.equal(faction.name, "NATO Command");
  assert.equal(faction.description, "Test description");
  assert.equal(faction.leader, "Test Leader");
  assert.equal(faction.goal, "Test goal");
  assert.equal(faction.strength, "medium");
  assert.equal(faction.notes, "Test notes");
});

test("Faction: Get existing faction", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const created = createTestFaction(db, campaignId);

  const retrieved = service.getFaction(db, campaignId, created.id);
  
  assert.ok(retrieved);
  assert.equal(retrieved.name, created.name);
  assert.equal(retrieved.leader, created.leader);
});

test("Faction: List factions sorted by name", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  service.createFaction(db, campaignId, { name: "Zebras", description: "Last" });
  service.createFaction(db, campaignId, { name: "Alphas", description: "First" });
  service.createFaction(db, campaignId, { name: "Betas", description: "Middle" });

  const factions = service.listFactions(db, campaignId);
  
  assert.equal(factions.length, 3);
  assert.equal(factions[0].name, "Alphas");
  assert.equal(factions[1].name, "Betas");
  assert.equal(factions[2].name, "Zebras");
});

test("Faction: Update faction", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const faction = createTestFaction(db, campaignId);

  const updated = service.updateFaction(db, campaignId, faction.id, {
    name: "Updated Name",
    leader: "New Leader",
    goal: "New goal"
  });

  assert.equal(updated.name, "Updated Name");
  assert.equal(updated.leader, "New Leader");
  assert.equal(updated.goal, "New goal");
});

test("Faction: Delete faction", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const faction = createTestFaction(db, campaignId);

  service.deleteFaction(db, campaignId, faction.id);
  const retrieved = service.getFaction(db, campaignId, faction.id);

  assert.equal(retrieved, null);
});

// Tests: Faction Relationships
test("Relationships: Set faction attitude", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const faction1 = createTestFaction(db, campaignId, "Faction A");
  const faction2 = createTestFaction(db, campaignId, "Faction B");

  const rel = service.setFactionRelationship(db, campaignId, faction1.id, faction2.id, "allied", "Working together");

  assert.equal(rel.attitude, "allied");
  assert.equal(rel.notes, "Working together");
});

test("Relationships: Get faction relationship", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const f1 = createTestFaction(db, campaignId, "F1");
  const f2 = createTestFaction(db, campaignId, "F2");

  service.setFactionRelationship(db, campaignId, f1.id, f2.id, "hostile");
  const rel = service.getFactionRelationship(db, campaignId, f1.id, f2.id);

  assert.ok(rel);
  assert.equal(rel.attitude, "hostile");
});

test("Relationships: List all relationships for faction", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const f1 = createTestFaction(db, campaignId, "F1");
  const f2 = createTestFaction(db, campaignId, "F2");
  const f3 = createTestFaction(db, campaignId, "F3");

  service.setFactionRelationship(db, campaignId, f1.id, f2.id, "allied");
  service.setFactionRelationship(db, campaignId, f1.id, f3.id, "hostile");

  const rels = service.getFactionRelationships(db, campaignId, f1.id);

  assert.equal(rels.length, 2);
});

// Tests: Settlement Resources
test("Resources: Set settlement resource status", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const settlementId = createTestSettlement(db, campaignId);

  const res = service.setSettlementResource(db, campaignId, settlementId, "food", "scarce", "Low on rations");

  assert.equal(res.resourceType, "food");
  assert.equal(res.status, "scarce");
  assert.equal(res.notes, "Low on rations");
});

test("Resources: Get settlement resource", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const sid = createTestSettlement(db, campaignId);

  service.setSettlementResource(db, campaignId, sid, "fuel", "available");
  const res = service.getSettlementResource(db, campaignId, sid, "fuel");

  assert.ok(res);
  assert.equal(res.status, "available");
});

test("Resources: List all settlement resources", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const sid = createTestSettlement(db, campaignId);

  service.setSettlementResource(db, campaignId, sid, "food", "scarce");
  service.setSettlementResource(db, campaignId, sid, "water", "needed");
  service.setSettlementResource(db, campaignId, sid, "fuel", "available");

  const resources = service.getSettlementResources(db, campaignId, sid);

  assert.equal(resources.length, 3);
  assert.equal(resources[0].resource_type, "food");
});

// Tests: Campaign Events
test("Events: Create event with full data", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  const event = service.createEvent(db, campaignId, {
    title: "Ambush Report",
    description: "Intel suggests enemy patrol nearby",
    eventType: "rumor",
    eventDate: "2026-11-02",
    isPublic: true,
    gmNotes: "Unconfirmed"
  });

  assert.ok(event.id);
  assert.equal(event.title, "Ambush Report");
  assert.equal(event.eventType, "rumor");
  assert.equal(event.isPublic, true);
});

test("Events: Get event", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  const created = service.createEvent(db, campaignId, {
    title: "Test Event",
    description: "Description",
    eventType: "event"
  });

  const retrieved = service.getEvent(db, campaignId, created.id);

  assert.ok(retrieved);
  assert.equal(retrieved.title, "Test Event");
});

test("Events: List events chronologically", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  service.createEvent(db, campaignId, { title: "Old", eventDate: "2026-11-01", eventType: "event" });
  service.createEvent(db, campaignId, { title: "New", eventDate: "2026-11-03", eventType: "event" });
  service.createEvent(db, campaignId, { title: "Middle", eventDate: "2026-11-02", eventType: "event" });

  const events = service.listEvents(db, campaignId);

  assert.equal(events.length, 3);
  assert.equal(events[0].title, "New");
  assert.equal(events[1].title, "Middle");
  assert.equal(events[2].title, "Old");
});

test("Events: Filter events by type", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  service.createEvent(db, campaignId, { title: "Rumor", eventType: "rumor" });
  service.createEvent(db, campaignId, { title: "Event", eventType: "event" });
  service.createEvent(db, campaignId, { title: "Discovery", eventType: "discovery" });

  const rumors = service.listEvents(db, campaignId, { eventType: "rumor" });

  assert.equal(rumors.length, 1);
  assert.equal(rumors[0].title, "Rumor");
});

test("Events: Update event", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  const event = service.createEvent(db, campaignId, { title: "Original", eventType: "event" });
  const updated = service.updateEvent(db, campaignId, event.id, {
    title: "Updated",
    description: "New description",
    isPublic: true
  });

  assert.equal(updated.title, "Updated");
  assert.equal(updated.description, "New description");
  assert.equal(updated.isPublic, true);
});

test("Events: Delete event", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  const event = service.createEvent(db, campaignId, { title: "To Delete", eventType: "event" });
  service.deleteEvent(db, campaignId, event.id);

  const retrieved = service.getEvent(db, campaignId, event.id);

  assert.equal(retrieved, null);
});

// Tests: Threat Tracker
test("Threats: Create threat with full data", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  const threat = service.createThreat(db, campaignId, {
    name: "Soviet Patrol",
    description: "Armed patrol 5km north",
    threatLevel: "high",
    status: "active",
    antagonistType: "force",
    goal: "Intercept supply convoy",
    resources: ["10 soldiers", "1 truck", "2 GPMGs"],
    gmNotes: "Last spotted yesterday"
  });

  assert.ok(threat.id);
  assert.equal(threat.name, "Soviet Patrol");
  assert.equal(threat.threatLevel, "high");
  assert.equal(threat.resources.length, 3);
});

test("Threats: Get threat", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  const created = service.createThreat(db, campaignId, {
    name: "Test Threat",
    description: "Description",
    threatLevel: "medium",
    status: "emerging",
    antagonistType: "individual"
  });

  const retrieved = service.getThreat(db, campaignId, created.id);

  assert.ok(retrieved);
  assert.equal(retrieved.name, "Test Threat");
  assert.equal(retrieved.threatLevel, "medium");
});

test("Threats: List threats filtered by status", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  service.createThreat(db, campaignId, { name: "T1", status: "active", threatLevel: "high", antagonistType: "force" });
  service.createThreat(db, campaignId, { name: "T2", status: "contained", threatLevel: "low", antagonistType: "force" });
  service.createThreat(db, campaignId, { name: "T3", status: "active", threatLevel: "medium", antagonistType: "force" });

  const activeThreats = service.listThreats(db, campaignId, { status: "active" });

  assert.equal(activeThreats.length, 2);
  assert.equal(activeThreats[0].name, "T1");
});

test("Threats: List threats ordered by level then status", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  service.createThreat(db, campaignId, { name: "Low", threatLevel: "low", status: "active", antagonistType: "force" });
  service.createThreat(db, campaignId, { name: "Critical", threatLevel: "critical", status: "active", antagonistType: "force" });
  service.createThreat(db, campaignId, { name: "High", threatLevel: "high", status: "active", antagonistType: "force" });

  const threats = service.listThreats(db, campaignId);

  assert.equal(threats[0].name, "Critical");
  assert.equal(threats[1].name, "High");
  assert.equal(threats[2].name, "Low");
});

test("Threats: Update threat", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  const threat = service.createThreat(db, campaignId, {
    name: "Emerging Threat",
    status: "emerging",
    threatLevel: "medium",
    antagonistType: "faction"
  });

  const updated = service.updateThreat(db, campaignId, threat.id, {
    status: "active",
    threatLevel: "high",
    goal: "Capture supply depot"
  });

  assert.equal(updated.status, "active");
  assert.equal(updated.threatLevel, "high");
  assert.equal(updated.goal, "Capture supply depot");
});

test("Threats: Delete threat", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  const threat = service.createThreat(db, campaignId, {
    name: "To Delete",
    description: "Delete me",
    threatLevel: "low",
    status: "emerging",
    antagonistType: "other"
  });

  service.deleteThreat(db, campaignId, threat.id);
  const retrieved = service.getThreat(db, campaignId, threat.id);

  assert.equal(retrieved, null);
});

// Tests: Campaign Isolation
test("Campaign Isolation: Factions isolated by campaign", (t) => {
  const db = createTestDatabase();
  const campaign1 = createTestCampaign(db);
  const campaign2 = createTestCampaign(db);

  const f1 = service.createFaction(db, campaign1, { name: "Campaign 1 Faction" });
  const f2 = service.createFaction(db, campaign2, { name: "Campaign 2 Faction" });

  const list1 = service.listFactions(db, campaign1);
  const list2 = service.listFactions(db, campaign2);

  assert.equal(list1.length, 1);
  assert.equal(list2.length, 1);
  assert.equal(list1[0].id, f1.id);
  assert.equal(list2[0].id, f2.id);
});

test("Campaign Isolation: Events isolated by campaign", (t) => {
  const db = createTestDatabase();
  const campaign1 = createTestCampaign(db);
  const campaign2 = createTestCampaign(db);

  const e1 = service.createEvent(db, campaign1, { title: "Event 1", eventType: "event" });
  const e2 = service.createEvent(db, campaign2, { title: "Event 2", eventType: "event" });

  const list1 = service.listEvents(db, campaign1);
  const list2 = service.listEvents(db, campaign2);

  assert.equal(list1.length, 1);
  assert.equal(list2.length, 1);
  assert.equal(list1[0].id, e1.id);
  assert.equal(list2[0].id, e2.id);
});

test("Campaign Isolation: Threats isolated by campaign", (t) => {
  const db = createTestDatabase();
  const campaign1 = createTestCampaign(db);
  const campaign2 = createTestCampaign(db);

  const t1 = service.createThreat(db, campaign1, {
    name: "Threat 1",
    threatLevel: "high",
    status: "active",
    antagonistType: "force"
  });
  const t2 = service.createThreat(db, campaign2, {
    name: "Threat 2",
    threatLevel: "high",
    status: "active",
    antagonistType: "force"
  });

  const list1 = service.listThreats(db, campaign1);
  const list2 = service.listThreats(db, campaign2);

  assert.equal(list1.length, 1);
  assert.equal(list2.length, 1);
  assert.equal(list1[0].id, t1.id);
  assert.equal(list2[0].id, t2.id);
});

// Tests: Validation
test("Validation: Reject invalid faction name", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  assert.throws(() => {
    service.createFaction(db, campaignId, { name: "" });
  }, /name is required/);
});

test("Validation: Reject invalid threat level", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  assert.throws(() => {
    service.createThreat(db, campaignId, {
      name: "Bad Threat",
      threatLevel: "extreme",
      status: "active",
      antagonistType: "force"
    });
  }, /Threat level must be/);
});

test("Validation: Reject invalid event type", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);

  assert.throws(() => {
    service.createEvent(db, campaignId, {
      title: "Bad Event",
      eventType: "invalid-type"
    });
  }, /Event type must be/);
});

test("Validation: Reject invalid relationship attitude", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const f1 = createTestFaction(db, campaignId);
  const f2 = createTestFaction(db, campaignId);

  assert.throws(() => {
    service.setFactionRelationship(db, campaignId, f1.id, f2.id, "best-friends");
  }, /Attitude must be/);
});

test("Validation: Reject invalid resource type", (t) => {
  const db = createTestDatabase();
  const campaignId = createTestCampaign(db);
  const sid = createTestSettlement(db, campaignId);

  assert.throws(() => {
    service.setSettlementResource(db, campaignId, sid, "unicorns", "available");
  }, /Resource type must be/);
});

console.log("Milestone 7 service tests complete");
