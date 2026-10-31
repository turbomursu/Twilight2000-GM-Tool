const { createHash, randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { assertCampaignSetupPackage } = require("../campaign-package-contract.js");

const schema = `
  CREATE TABLE IF NOT EXISTS campaigns (
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

  CREATE TABLE IF NOT EXISTS setup_imports (
    runtime_campaign_id TEXT PRIMARY KEY REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    source_campaign_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version = 2),
    imported_at TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    source_json TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS maps (
    runtime_campaign_id TEXT PRIMARY KEY REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    source_map_id TEXT,
    name TEXT NOT NULL,
    bounds_json TEXT NOT NULL,
    center_json TEXT NOT NULL,
    zoom REAL NOT NULL,
    atlas_json TEXT,
    annotations_json TEXT NOT NULL,
    attribution TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS terrain_cells (
    runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    q INTEGER NOT NULL,
    r INTEGER NOT NULL,
    terrain_type TEXT NOT NULL,
    PRIMARY KEY (runtime_campaign_id, q, r)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS locations (
    runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT NOT NULL,
    grid_ref TEXT,
    coordinates_json TEXT,
    map_position_json TEXT NOT NULL,
    visibility_eligibility TEXT NOT NULL CHECK (visibility_eligibility IN ('gm-only', 'players')),
    is_starting_location INTEGER NOT NULL CHECK (is_starting_location IN (0, 1)),
    PRIMARY KEY (runtime_campaign_id, id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS settlements (
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
    PRIMARY KEY (runtime_campaign_id, id),
    FOREIGN KEY (runtime_campaign_id, source_location_id) REFERENCES locations(runtime_campaign_id, id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS factions (
    runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    color TEXT,
    PRIMARY KEY (runtime_campaign_id, id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS faction_influence_cells (
    runtime_campaign_id TEXT NOT NULL,
    faction_id TEXT NOT NULL,
    q INTEGER NOT NULL,
    r INTEGER NOT NULL,
    PRIMARY KEY (runtime_campaign_id, faction_id, q, r),
    FOREIGN KEY (runtime_campaign_id, faction_id) REFERENCES factions(runtime_campaign_id, id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE IF NOT EXISTS settlement_factions (
    runtime_campaign_id TEXT NOT NULL,
    settlement_id TEXT NOT NULL,
    faction_id TEXT NOT NULL,
    prominence_rank INTEGER NOT NULL CHECK (prominence_rank >= 0),
    PRIMARY KEY (runtime_campaign_id, settlement_id, faction_id),
    UNIQUE (runtime_campaign_id, settlement_id, prominence_rank),
    FOREIGN KEY (runtime_campaign_id, settlement_id) REFERENCES settlements(runtime_campaign_id, id) ON DELETE CASCADE,
    FOREIGN KEY (runtime_campaign_id, faction_id) REFERENCES factions(runtime_campaign_id, id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE IF NOT EXISTS gm_notes (
    runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility = 'gm-only'),
    PRIMARY KEY (runtime_campaign_id, id)
  ) STRICT;
`;

const authSchema = `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    login_identifier TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE campaign_memberships (
    campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('gm', 'player')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (campaign_id, account_id)
  ) STRICT;

  CREATE UNIQUE INDEX one_gm_owner_per_campaign
    ON campaign_memberships(campaign_id) WHERE role = 'gm';

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX sessions_by_account ON sessions(account_id);

  CREATE TABLE server_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;
`;

function openRuntimeDatabase(path = ":memory:") {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  if (path !== ":memory:") database.exec("PRAGMA journal_mode = WAL");

  const version = database.prepare("PRAGMA user_version").get().user_version;
  if (version > 2) {
    database.close();
    throw new Error(`Database schema version ${version} is newer than this application supports.`);
  }
  if (version < 1) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(schema);
      database.exec("PRAGMA user_version = 1");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }
  if (version < 2) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(authSchema);
      database.exec("PRAGMA user_version = 2");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }
  return database;
}

function requireText(value, label, maximumLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maximumLength) {
    throw new Error(`${label} is missing or exceeds its allowed length.`);
  }
  return value.trim();
}

function parseInfluenceCell(value, factionName) {
  if (typeof value !== "string" || !/^-?\d+,-?\d+$/.test(value)) {
    throw new Error(`The influence layer for ${factionName} contains an invalid hex.`);
  }
  const [q, r] = value.split(",").map(Number);
  if (![q, r].every(Number.isSafeInteger) || Math.abs(q) > 10000 || Math.abs(r) > 10000) {
    throw new Error(`The influence layer for ${factionName} contains an invalid hex.`);
  }
  return [q, r];
}

function importSetupPackage(database, sourceJson, options = {}) {
  if (typeof sourceJson !== "string" || Buffer.byteLength(sourceJson, "utf8") > 50 * 1024 * 1024) {
    throw new Error("The setup package must be JSON text no larger than 50 MiB.");
  }

  let input;
  try {
    input = JSON.parse(sourceJson);
  } catch {
    throw new Error("The setup package is not valid JSON.");
  }
  assertCampaignSetupPackage(input);

  const campaignId = requireText(input.campaign.id, "Campaign ID", 120);
  const campaignName = requireText(input.campaign.name, "Campaign name", 80);
  const setting = requireText(input.campaign.setting, "Campaign setting", 100);
  const premise = requireText(input.campaign.premise, "Campaign premise", 1200);
  const era = typeof input.campaign.era === "string" ? input.campaign.era.slice(0, 60).trim() : "";
  const mapName = requireText(input.map.name || input.campaign.mapName, "Map name", 80);
  const runtimeId = requireText((options.idFactory || randomUUID)(), "Runtime campaign ID", 120);
  if (runtimeId === campaignId) throw new Error("The runtime campaign ID must differ from the setup campaign ID.");
  const timestamp = (options.now || (() => new Date().toISOString()))();
  const checksum = createHash("sha256").update(sourceJson, "utf8").digest("hex");

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`INSERT INTO campaigns
      (runtime_id, setup_campaign_id, schema_version, name, setting, premise, era, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`)
      .run(runtimeId, campaignId, campaignName, setting, premise, era, timestamp, timestamp);
    if (options.ownerAccountId) {
      database.prepare(`INSERT INTO campaign_memberships (campaign_id, account_id, role, created_at)
        VALUES (?, ?, 'gm', ?)`).run(runtimeId, options.ownerAccountId, timestamp);
    }

    database.prepare(`INSERT INTO setup_imports
      (runtime_campaign_id, source_campaign_id, schema_version, imported_at, sha256, source_json)
      VALUES (?, ?, 2, ?, ?, ?)`)
      .run(runtimeId, campaignId, timestamp, checksum, sourceJson);

    const center = input.map.center && Number.isFinite(input.map.center.lat) && Number.isFinite(input.map.center.lng)
      ? input.map.center
      : { lat: (input.map.bounds.south + input.map.bounds.north) / 2, lng: (input.map.bounds.west + input.map.bounds.east) / 2 };
    database.prepare(`INSERT INTO maps
      (runtime_campaign_id, source_map_id, name, bounds_json, center_json, zoom, atlas_json, annotations_json, attribution)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(runtimeId, typeof input.map.id === "string" ? input.map.id : null, mapName,
        JSON.stringify(input.map.bounds), JSON.stringify(center),
        Number.isFinite(input.map.zoom) ? input.map.zoom : 10,
        input.map.fieldPapersAtlas ? JSON.stringify(input.map.fieldPapersAtlas) : null,
        JSON.stringify(input.map.offlineAnnotations),
        typeof input.map.attribution === "string" ? input.map.attribution : "");

    const insertTerrain = database.prepare(`INSERT INTO terrain_cells
      (runtime_campaign_id, q, r, terrain_type) VALUES (?, ?, ?, ?)`);
    for (const cell of input.map.grid.terrainCells) {
      if (!Number.isSafeInteger(cell.q) || !Number.isSafeInteger(cell.r) || typeof cell.terrainType !== "string" || !cell.terrainType.trim()) {
        throw new Error("The setup package contains an invalid terrain-cell assignment.");
      }
      insertTerrain.run(runtimeId, cell.q, cell.r, cell.terrainType.trim());
    }

    const locationsById = new Map(input.map.locations.map((location) => [location.id, location]));
    const insertLocation = database.prepare(`INSERT INTO locations
      (runtime_campaign_id, id, name, kind, description, grid_ref, coordinates_json, map_position_json, visibility_eligibility, is_starting_location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const location of input.map.locations) {
      insertLocation.run(runtimeId, location.id,
        requireText(location.name, "Location name", 160),
        typeof location.kind === "string" ? location.kind.slice(0, 80) : "Location",
        typeof location.description === "string" ? location.description.slice(0, 600) : "",
        typeof location.gridRef === "string" ? location.gridRef.slice(0, 40) : null,
        location.coordinates ? JSON.stringify(location.coordinates) : null,
        JSON.stringify(location.mapPosition), location.visibility === "players" ? "players" : "gm-only",
        location.isStartingLocation ? 1 : 0);
    }

    const insertSettlement = database.prepare(`INSERT INTO settlements
      (runtime_campaign_id, id, source_location_id, name, scale, population_estimate, security, attitude, leadership, situation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const prominenceRows = [];
    for (const settlement of input.settlements) {
      const location = settlement.locationId ? locationsById.get(settlement.locationId) : null;
      insertSettlement.run(runtimeId, settlement.id, location?.id || null,
        requireText(location?.name || settlement.name, "Settlement name", 160),
        typeof settlement.scale === "string" ? settlement.scale.slice(0, 80) : null,
        settlement.populationEstimate ?? null,
        typeof settlement.security === "string" ? settlement.security.slice(0, 100) : null,
        typeof settlement.attitude === "string" ? settlement.attitude.slice(0, 100) : null,
        typeof settlement.leadership === "string" ? settlement.leadership.slice(0, 100) : null,
        typeof settlement.situation === "string" ? settlement.situation.slice(0, 500) : "");
      (settlement.prominentFactionIds || []).forEach((factionId, rank) => {
        prominenceRows.push([runtimeId, settlement.id, factionId, rank]);
      });
    }

    const insertFaction = database.prepare(`INSERT INTO factions
      (runtime_campaign_id, id, name, description, color) VALUES (?, ?, ?, ?, ?)`);
    const insertInfluence = database.prepare(`INSERT INTO faction_influence_cells
      (runtime_campaign_id, faction_id, q, r) VALUES (?, ?, ?, ?)`);
    for (const faction of input.factions) {
      const name = requireText(faction.name, "Faction name", 160);
      insertFaction.run(runtimeId, faction.id, name,
        typeof faction.description === "string" ? faction.description.slice(0, 600) : "",
        typeof faction.color === "string" ? faction.color.slice(0, 40) : null);
      (faction.influenceCells || []).forEach((cell) => {
        insertInfluence.run(runtimeId, faction.id, ...parseInfluenceCell(cell, name));
      });
    }

    const insertSettlementFaction = database.prepare(`INSERT INTO settlement_factions
      (runtime_campaign_id, settlement_id, faction_id, prominence_rank) VALUES (?, ?, ?, ?)`);
    prominenceRows.forEach((row) => insertSettlementFaction.run(...row));

    const insertNote = database.prepare(`INSERT INTO gm_notes
      (runtime_campaign_id, id, title, body, visibility) VALUES (?, ?, ?, ?, 'gm-only')`);
    for (const note of input.scenarioNotes) {
      insertNote.run(runtimeId, note.id, requireText(note.title, "Scenario-note title", 100),
        requireText(note.body, "Scenario-note body", 3000));
    }

    database.exec("COMMIT");
    return { runtimeCampaignId: runtimeId, sourceCampaignId: campaignId, schemaVersion: 1, checksum };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function listRuntimeCampaigns(database, accountId) {
  return database.prepare(`SELECT campaigns.runtime_id AS id, campaigns.name, campaigns.setting,
      campaigns.era, campaigns.revision, campaigns.created_at AS createdAt,
      campaign_memberships.role
    FROM campaigns JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    WHERE campaign_memberships.account_id = ? AND campaigns.active = 1
    ORDER BY campaigns.created_at DESC, campaigns.runtime_id`).all(accountId);
}

function getRuntimeCampaign(database, accountId, runtimeId) {
  const campaign = database.prepare(`SELECT campaigns.runtime_id AS id, campaigns.setup_campaign_id AS sourceCampaignId,
      campaigns.schema_version AS schemaVersion, campaigns.name, campaigns.setting, campaigns.premise,
      campaigns.era, campaigns.revision, campaigns.created_at AS createdAt, campaign_memberships.role,
      setup_imports.sha256 AS sourceChecksum, setup_imports.source_json AS sourceJson
    FROM campaigns JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    JOIN setup_imports ON setup_imports.runtime_campaign_id = campaigns.runtime_id
    WHERE campaigns.runtime_id = ? AND campaign_memberships.account_id = ? AND campaigns.active = 1`).get(runtimeId, accountId);
  if (!campaign) return null;
  const { sourceJson, ...summary } = campaign;
  return { ...summary, setupPackage: JSON.parse(sourceJson) };
}

module.exports = { openRuntimeDatabase, importSetupPackage, listRuntimeCampaigns, getRuntimeCampaign };