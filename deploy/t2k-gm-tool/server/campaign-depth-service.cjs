/**
 * Milestone 7: Campaign Depth Service
 *
 * Provides CRUD operations for:
 * - Factions and faction relationships (attitude matrix)
 * - Settlements and settlement resources
 * - Campaign events/rumors (chronological log)
 * - Threat entries (active antagonists, goals, resources)
 *
 * All data is campaign-scoped and GM-managed (no automation).
 * No random generation; all records are GM-entered or edited.
 */

const { randomUUID } = require("node:crypto");

// ============================================================================
// Faction Management
// ============================================================================

function createFaction(database, campaignId, factionData) {
  if (!campaignId || typeof campaignId !== "string") {
    throw new Error("Campaign ID is required");
  }
  if (!factionData || typeof factionData !== "object") {
    throw new Error("Faction data is required");
  }

  const id = randomUUID();
  const name = (factionData.name || "").trim();
  const description = (factionData.description || "").trim();
  const color = (factionData.color || "#808080").trim();
  const leader = (factionData.leader || "").trim();
  const goal = (factionData.goal || "").trim();
  const strength = (factionData.strength || "unknown").trim();
  const notes = (factionData.notes || "").trim();

  if (!name || name.length > 255) {
    throw new Error("Faction name is required and must be under 255 characters");
  }

  const stmt = database.prepare(`
    INSERT INTO factions (runtime_campaign_id, id, name, description, color)
    VALUES (?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN IMMEDIATE");
  try {
    stmt.run(campaignId, id, name, description, color);

    if (leader || goal || strength || notes) {
      const updateStmt = database.prepare(`
        UPDATE factions
        SET description = ?
        WHERE runtime_campaign_id = ? AND id = ?
      `);
      const updatedDescription = JSON.stringify({
        summary: description,
        leader,
        goal,
        strength,
        notes
      });
      updateStmt.run(updatedDescription, campaignId, id);
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { id, name, description, color, leader, goal, strength, notes };
}

function getFaction(database, campaignId, factionId) {
  const stmt = database.prepare(`
    SELECT * FROM factions
    WHERE runtime_campaign_id = ? AND id = ?
  `);
  const row = stmt.get(campaignId, factionId);
  if (!row) return null;

  return parseFactionRow(row);
}

function listFactions(database, campaignId) {
  const stmt = database.prepare(`
    SELECT * FROM factions
    WHERE runtime_campaign_id = ?
    ORDER BY name
  `);
  return stmt.all(campaignId).map(parseFactionRow);
}

function updateFaction(database, campaignId, factionId, updates) {
  const faction = getFaction(database, campaignId, factionId);
  if (!faction) {
    throw new Error("Faction not found");
  }

  const name = (updates.name || faction.name).trim();
  const description = (updates.description || faction.description).trim();
  const color = (updates.color || faction.color).trim();
  const leader = (updates.leader || faction.leader).trim();
  const goal = (updates.goal || faction.goal).trim();
  const strength = (updates.strength || faction.strength).trim();
  const notes = (updates.notes || faction.notes).trim();

  if (!name || name.length > 255) {
    throw new Error("Faction name is required and must be under 255 characters");
  }

  const stmt = database.prepare(`
    UPDATE factions
    SET name = ?, description = ?, color = ?
    WHERE runtime_campaign_id = ? AND id = ?
  `);

  const fullDescription = JSON.stringify({
    summary: description,
    leader,
    goal,
    strength,
    notes
  });

  database.exec("BEGIN IMMEDIATE");
  try {
    stmt.run(name, fullDescription, color, campaignId, factionId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { id: factionId, name, description, color, leader, goal, strength, notes };
}

function deleteFaction(database, campaignId, factionId) {
  const stmt = database.prepare(`
    DELETE FROM factions
    WHERE runtime_campaign_id = ? AND id = ?
  `);

  database.exec("BEGIN IMMEDIATE");
  try {
    stmt.run(campaignId, factionId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function parseFactionRow(row) {
  let leader = "", goal = "", strength = "unknown", notes = "";
  let description = row.description || "";

  try {
    const parsed = JSON.parse(row.description || "{}");
    description = parsed.summary || "";
    leader = parsed.leader || "";
    goal = parsed.goal || "";
    strength = parsed.strength || "unknown";
    notes = parsed.notes || "";
  } catch {
    // If not JSON, treat as plain description
  }

  return {
    id: row.id,
    name: row.name,
    description,
    color: row.color,
    leader,
    goal,
    strength,
    notes
  };
}

// ============================================================================
// Faction Relationships (Attitude Matrix)
// ============================================================================

function setFactionRelationship(database, campaignId, fromFactionId, toFactionId, attitude, notes = "") {
  if (!["allied", "neutral", "hostile", "unknown"].includes(attitude)) {
    throw new Error("Attitude must be: allied, neutral, hostile, or unknown");
  }

  const now = new Date().toISOString();

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT OR REPLACE INTO faction_relationships
      (runtime_campaign_id, from_faction_id, to_faction_id, attitude, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(campaignId, fromFactionId, toFactionId, attitude, notes.trim(), now);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { fromFactionId, toFactionId, attitude, notes: notes.trim(), updated_at: now };
}

function getFactionRelationship(database, campaignId, fromFactionId, toFactionId) {
  return database.prepare(`
    SELECT * FROM faction_relationships
    WHERE runtime_campaign_id = ? AND from_faction_id = ? AND to_faction_id = ?
  `).get(campaignId, fromFactionId, toFactionId) || null;
}

function getFactionRelationships(database, campaignId, fromFactionId) {
  return database.prepare(`
    SELECT * FROM faction_relationships
    WHERE runtime_campaign_id = ? AND from_faction_id = ?
    ORDER BY to_faction_id
  `).all(campaignId, fromFactionId);
}

function getAllFactionRelationships(database, campaignId) {
  return database.prepare(`
    SELECT * FROM faction_relationships
    WHERE runtime_campaign_id = ?
    ORDER BY from_faction_id, to_faction_id
  `).all(campaignId);
}

// ============================================================================
// Settlement Resources
// ============================================================================

function setSettlementResource(database, campaignId, settlementId, resourceType, status, notes = "") {
  const validTypes = ["food", "water", "fuel", "ammunition", "medical", "shelter", "intel", "other"];
  const validStatus = ["available", "scarce", "needed", "unknown"];

  if (!validTypes.includes(resourceType)) {
    throw new Error(`Resource type must be one of: ${validTypes.join(", ")}`);
  }
  if (!validStatus.includes(status)) {
    throw new Error(`Status must be one of: ${validStatus.join(", ")}`);
  }

  const now = new Date().toISOString();

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT OR REPLACE INTO settlement_resources
      (runtime_campaign_id, settlement_id, resource_type, status, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(campaignId, settlementId, resourceType, status, notes.trim(), now);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { settlementId, resourceType, status, notes: notes.trim(), updated_at: now };
}

function getSettlementResource(database, campaignId, settlementId, resourceType) {
  return database.prepare(`
    SELECT * FROM settlement_resources
    WHERE runtime_campaign_id = ? AND settlement_id = ? AND resource_type = ?
  `).get(campaignId, settlementId, resourceType) || null;
}

function getSettlementResources(database, campaignId, settlementId) {
  return database.prepare(`
    SELECT * FROM settlement_resources
    WHERE runtime_campaign_id = ? AND settlement_id = ?
    ORDER BY resource_type
  `).all(campaignId, settlementId);
}

// ============================================================================
// Campaign Events / Rumors Log
// ============================================================================

function createEvent(database, campaignId, eventData) {
  if (!campaignId || typeof campaignId !== "string") {
    throw new Error("Campaign ID is required");
  }
  if (!eventData || typeof eventData !== "object") {
    throw new Error("Event data is required");
  }

  const id = randomUUID();
  const title = (eventData.title || "").trim();
  const description = (eventData.description || "").trim();
  const eventType = eventData.eventType || "other";
  const eventDate = eventData.eventDate || new Date().toISOString().split("T")[0];
  const linkedFactionId = eventData.linkedFactionId || null;
  const linkedSettlementId = eventData.linkedSettlementId || null;
  const isPublic = eventData.isPublic ? 1 : 0;
  const gmNotes = (eventData.gmNotes || "").trim();
  const now = new Date().toISOString();

  const validTypes = ["rumor", "event", "discovery", "faction-action", "settlement-change", "threat", "other"];
  if (!validTypes.includes(eventType)) {
    throw new Error(`Event type must be one of: ${validTypes.join(", ")}`);
  }

  if (!title || title.length > 255) {
    throw new Error("Event title is required and must be under 255 characters");
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO campaign_events
      (runtime_campaign_id, id, title, description, event_type, event_date, linked_faction_id, linked_settlement_id, is_public, gm_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(campaignId, id, title, description, eventType, eventDate, linkedFactionId, linkedSettlementId, isPublic, gmNotes, now, now);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { id, title, description, eventType, eventDate, linkedFactionId, linkedSettlementId, isPublic: isPublic === 1, gmNotes, created_at: now, updated_at: now };
}

function getEvent(database, campaignId, eventId) {
  const row = database.prepare(`
    SELECT * FROM campaign_events
    WHERE runtime_campaign_id = ? AND id = ?
  `).get(campaignId, eventId);

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    eventType: row.event_type,
    eventDate: row.event_date,
    linkedFactionId: row.linked_faction_id,
    linkedSettlementId: row.linked_settlement_id,
    isPublic: row.is_public === 1,
    gmNotes: row.gm_notes,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function listEvents(database, campaignId, filters = {}) {
  let query = `
    SELECT * FROM campaign_events
    WHERE runtime_campaign_id = ?
  `;
  const params = [campaignId];

  if (filters.eventType) {
    query += ` AND event_type = ?`;
    params.push(filters.eventType);
  }

  if (filters.linkedFactionId) {
    query += ` AND linked_faction_id = ?`;
    params.push(filters.linkedFactionId);
  }

  if (filters.linkedSettlementId) {
    query += ` AND linked_settlement_id = ?`;
    params.push(filters.linkedSettlementId);
  }

  if (filters.isPublic !== undefined) {
    query += ` AND is_public = ?`;
    params.push(filters.isPublic ? 1 : 0);
  }

  query += ` ORDER BY event_date DESC, created_at DESC`;

  return database.prepare(query).all(...params).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    eventType: row.event_type,
    eventDate: row.event_date,
    linkedFactionId: row.linked_faction_id,
    linkedSettlementId: row.linked_settlement_id,
    isPublic: row.is_public === 1,
    gmNotes: row.gm_notes,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

function updateEvent(database, campaignId, eventId, updates) {
  const event = getEvent(database, campaignId, eventId);
  if (!event) {
    throw new Error("Event not found");
  }

  const title = (updates.title || event.title).trim();
  const description = (updates.description || event.description).trim();
  const eventType = updates.eventType || event.eventType;
  const eventDate = updates.eventDate || event.eventDate;
  const linkedFactionId = updates.linkedFactionId || event.linkedFactionId;
  const linkedSettlementId = updates.linkedSettlementId || event.linkedSettlementId;
  const isPublic = updates.isPublic !== undefined ? (updates.isPublic ? 1 : 0) : (event.isPublic ? 1 : 0);
  const gmNotes = (updates.gmNotes || event.gmNotes).trim();
  const now = new Date().toISOString();

  const validTypes = ["rumor", "event", "discovery", "faction-action", "settlement-change", "threat", "other"];
  if (!validTypes.includes(eventType)) {
    throw new Error(`Event type must be one of: ${validTypes.join(", ")}`);
  }

  if (!title || title.length > 255) {
    throw new Error("Event title is required and must be under 255 characters");
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      UPDATE campaign_events
      SET title = ?, description = ?, event_type = ?, event_date = ?, linked_faction_id = ?, linked_settlement_id = ?, is_public = ?, gm_notes = ?, updated_at = ?
      WHERE runtime_campaign_id = ? AND id = ?
    `).run(title, description, eventType, eventDate, linkedFactionId, linkedSettlementId, isPublic, gmNotes, now, campaignId, eventId);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { id: eventId, title, description, eventType, eventDate, linkedFactionId, linkedSettlementId, isPublic: isPublic === 1, gmNotes, updated_at: now };
}

function deleteEvent(database, campaignId, eventId) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      DELETE FROM campaign_events
      WHERE runtime_campaign_id = ? AND id = ?
    `).run(campaignId, eventId);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

// ============================================================================
// Threat Tracker
// ============================================================================

function createThreat(database, campaignId, threatData) {
  if (!campaignId || typeof campaignId !== "string") {
    throw new Error("Campaign ID is required");
  }
  if (!threatData || typeof threatData !== "object") {
    throw new Error("Threat data is required");
  }

  const id = randomUUID();
  const name = (threatData.name || "").trim();
  const description = (threatData.description || "").trim();
  const threatLevel = threatData.threatLevel || "medium";
  const status = threatData.status || "emerging";
  const antagonistType = threatData.antagonistType || "other";
  const linkedFactionId = threatData.linkedFactionId || null;
  const linkedSettlementId = threatData.linkedSettlementId || null;
  const goal = (threatData.goal || "").trim();
  const resources = threatData.resources || [];
  const gmNotes = (threatData.gmNotes || "").trim();
  const now = new Date().toISOString();

  const validLevels = ["low", "medium", "high", "critical"];
  const validStatus = ["emerging", "active", "contained", "resolved"];
  const validAntagonists = ["faction", "individual", "force", "event", "other"];

  if (!validLevels.includes(threatLevel)) {
    throw new Error(`Threat level must be one of: ${validLevels.join(", ")}`);
  }
  if (!validStatus.includes(status)) {
    throw new Error(`Status must be one of: ${validStatus.join(", ")}`);
  }
  if (!validAntagonists.includes(antagonistType)) {
    throw new Error(`Antagonist type must be one of: ${validAntagonists.join(", ")}`);
  }

  if (!name || name.length > 255) {
    throw new Error("Threat name is required and must be under 255 characters");
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO threat_entries
      (runtime_campaign_id, id, name, description, threat_level, status, antagonist_type, linked_faction_id, linked_settlement_id, goal, resources_json, gm_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(campaignId, id, name, description, threatLevel, status, antagonistType, linkedFactionId, linkedSettlementId, goal, JSON.stringify(resources), gmNotes, now, now);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { id, name, description, threatLevel, status, antagonistType, linkedFactionId, linkedSettlementId, goal, resources, gmNotes, created_at: now, updated_at: now };
}

function getThreat(database, campaignId, threatId) {
  const row = database.prepare(`
    SELECT * FROM threat_entries
    WHERE runtime_campaign_id = ? AND id = ?
  `).get(campaignId, threatId);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    threatLevel: row.threat_level,
    status: row.status,
    antagonistType: row.antagonist_type,
    linkedFactionId: row.linked_faction_id,
    linkedSettlementId: row.linked_settlement_id,
    goal: row.goal,
    resources: JSON.parse(row.resources_json || "[]"),
    gmNotes: row.gm_notes,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function listThreats(database, campaignId, filters = {}) {
  let query = `
    SELECT * FROM threat_entries
    WHERE runtime_campaign_id = ?
  `;
  const params = [campaignId];

  if (filters.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }

  if (filters.threatLevel) {
    query += ` AND threat_level = ?`;
    params.push(filters.threatLevel);
  }

  if (filters.antagonistType) {
    query += ` AND antagonist_type = ?`;
    params.push(filters.antagonistType);
  }

  if (filters.linkedFactionId) {
    query += ` AND linked_faction_id = ?`;
    params.push(filters.linkedFactionId);
  }

  if (filters.linkedSettlementId) {
    query += ` AND linked_settlement_id = ?`;
    params.push(filters.linkedSettlementId);
  }

  query += ` ORDER BY CASE threat_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, status, created_at DESC`;

  return database.prepare(query).all(...params).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    threatLevel: row.threat_level,
    status: row.status,
    antagonistType: row.antagonist_type,
    linkedFactionId: row.linked_faction_id,
    linkedSettlementId: row.linked_settlement_id,
    goal: row.goal,
    resources: JSON.parse(row.resources_json || "[]"),
    gmNotes: row.gm_notes,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

function updateThreat(database, campaignId, threatId, updates) {
  const threat = getThreat(database, campaignId, threatId);
  if (!threat) {
    throw new Error("Threat not found");
  }

  const name = (updates.name || threat.name).trim();
  const description = (updates.description || threat.description).trim();
  const threatLevel = updates.threatLevel || threat.threatLevel;
  const status = updates.status || threat.status;
  const antagonistType = updates.antagonistType || threat.antagonistType;
  const linkedFactionId = updates.linkedFactionId || threat.linkedFactionId;
  const linkedSettlementId = updates.linkedSettlementId || threat.linkedSettlementId;
  const goal = (updates.goal || threat.goal).trim();
  const resources = updates.resources || threat.resources;
  const gmNotes = (updates.gmNotes || threat.gmNotes).trim();
  const now = new Date().toISOString();

  const validLevels = ["low", "medium", "high", "critical"];
  const validStatus = ["emerging", "active", "contained", "resolved"];
  const validAntagonists = ["faction", "individual", "force", "event", "other"];

  if (!validLevels.includes(threatLevel)) {
    throw new Error(`Threat level must be one of: ${validLevels.join(", ")}`);
  }
  if (!validStatus.includes(status)) {
    throw new Error(`Status must be one of: ${validStatus.join(", ")}`);
  }
  if (!validAntagonists.includes(antagonistType)) {
    throw new Error(`Antagonist type must be one of: ${validAntagonists.join(", ")}`);
  }

  if (!name || name.length > 255) {
    throw new Error("Threat name is required and must be under 255 characters");
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      UPDATE threat_entries
      SET name = ?, description = ?, threat_level = ?, status = ?, antagonist_type = ?, linked_faction_id = ?, linked_settlement_id = ?, goal = ?, resources_json = ?, gm_notes = ?, updated_at = ?
      WHERE runtime_campaign_id = ? AND id = ?
    `).run(name, description, threatLevel, status, antagonistType, linkedFactionId, linkedSettlementId, goal, JSON.stringify(resources), gmNotes, now, campaignId, threatId);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { id: threatId, name, description, threatLevel, status, antagonistType, linkedFactionId, linkedSettlementId, goal, resources, gmNotes, updated_at: now };
}

function deleteThreat(database, campaignId, threatId) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      DELETE FROM threat_entries
      WHERE runtime_campaign_id = ? AND id = ?
    `).run(campaignId, threatId);

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // Factions
  createFaction,
  getFaction,
  listFactions,
  updateFaction,
  deleteFaction,
  
  // Faction Relationships
  setFactionRelationship,
  getFactionRelationship,
  getFactionRelationships,
  getAllFactionRelationships,
  
  // Settlement Resources
  setSettlementResource,
  getSettlementResource,
  getSettlementResources,
  
  // Events
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  deleteEvent,
  
  // Threats
  createThreat,
  getThreat,
  listThreats,
  updateThreat,
  deleteThreat
};
