const { createHash, randomBytes, randomUUID } = require("node:crypto");
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

const playerSchema = `
  CREATE TABLE account_invites (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE characters (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('seed', 'playable')),
    fields_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (campaign_id, id)
  ) STRICT;

  CREATE TABLE player_seats (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL,
    display_label TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    assigned_at TEXT NOT NULL,
    UNIQUE (campaign_id, account_id),
    UNIQUE (campaign_id, character_id),
    FOREIGN KEY (campaign_id, character_id) REFERENCES characters(campaign_id, id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX player_seats_by_account ON player_seats(account_id, active);
`;

const characterChangeSchema = `
  CREATE TABLE character_change_requests (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    seat_id TEXT NOT NULL REFERENCES player_seats(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL,
    requested_fields_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    submitted_at TEXT NOT NULL,
    reviewer_account_id TEXT REFERENCES accounts(id),
    reviewed_at TEXT,
    review_note TEXT,
    FOREIGN KEY (campaign_id, character_id) REFERENCES characters(campaign_id, id) ON DELETE CASCADE
  ) STRICT;

  CREATE UNIQUE INDEX one_pending_character_change_request
    ON character_change_requests(character_id) WHERE status = 'pending';

  CREATE INDEX character_change_requests_by_campaign
    ON character_change_requests(campaign_id, status, submitted_at);
`;

const runtimeDashboardSchema = `
  CREATE TABLE runtime_dashboard_state (
    campaign_id TEXT PRIMARY KEY REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    game_date TEXT NOT NULL,
    day_number INTEGER NOT NULL CHECK (day_number >= 0),
    distance_km INTEGER NOT NULL CHECK (distance_km >= 0),
    rations_days INTEGER NOT NULL CHECK (rations_days >= 0),
    fuel_units INTEGER NOT NULL CHECK (fuel_units >= 0),
    weather TEXT NOT NULL,
    weather_note TEXT NOT NULL,
    active_stop_index INTEGER NOT NULL DEFAULT 0 CHECK (active_stop_index >= 0),
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE route_stops (
    campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    location_id TEXT NOT NULL,
    detail TEXT NOT NULL,
    km_from_previous INTEGER NOT NULL CHECK (km_from_previous >= 0),
    PRIMARY KEY (campaign_id, ordinal),
    UNIQUE (campaign_id, location_id),
    FOREIGN KEY (campaign_id, location_id) REFERENCES locations(runtime_campaign_id, id)
  ) STRICT;

  CREATE TABLE personnel (
    campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    condition TEXT NOT NULL,
    readiness TEXT NOT NULL,
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    PRIMARY KEY (campaign_id, id),
    UNIQUE (campaign_id, sort_order)
  ) STRICT;

  CREATE TABLE journal_entries (
    campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (campaign_id, id)
  ) STRICT;
`;

function openRuntimeDatabase(path = ":memory:") {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  if (path !== ":memory:") database.exec("PRAGMA journal_mode = WAL");

  const version = database.prepare("PRAGMA user_version").get().user_version;
    if (version > 6) {
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
  if (version < 3) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(playerSchema);
      database.exec("PRAGMA user_version = 3");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }
  if (version < 4) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`ALTER TABLE accounts ADD COLUMN global_role TEXT NOT NULL DEFAULT 'player' CHECK (global_role IN ('gm', 'player'));
        ALTER TABLE accounts ADD COLUMN created_by_account_id TEXT REFERENCES accounts(id);
        UPDATE accounts SET global_role = 'gm'
          WHERE id IN (SELECT account_id FROM campaign_memberships WHERE role = 'gm')
            OR id = (SELECT id FROM accounts ORDER BY created_at, id LIMIT 1);
        PRAGMA user_version = 4;`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }
  if (version < 5) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(characterChangeSchema);
      database.exec("PRAGMA user_version = 5");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }
  if (version < 6) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(runtimeDashboardSchema);
      database.exec("PRAGMA user_version = 6");
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
    WHERE campaign_memberships.account_id = ? AND campaign_memberships.role = 'gm' AND campaigns.active = 1
    ORDER BY campaigns.created_at DESC, campaigns.runtime_id`).all(accountId);
}

function getRuntimeCampaign(database, accountId, runtimeId) {
  const campaign = database.prepare(`SELECT campaigns.runtime_id AS id, campaigns.setup_campaign_id AS sourceCampaignId,
      campaigns.schema_version AS schemaVersion, campaigns.name, campaigns.setting, campaigns.premise,
      campaigns.era, campaigns.revision, campaigns.created_at AS createdAt, campaign_memberships.role,
      setup_imports.sha256 AS sourceChecksum, setup_imports.source_json AS sourceJson
    FROM campaigns JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    JOIN setup_imports ON setup_imports.runtime_campaign_id = campaigns.runtime_id
    WHERE campaigns.runtime_id = ? AND campaign_memberships.account_id = ? AND campaign_memberships.role = 'gm' AND campaigns.active = 1`).get(runtimeId, accountId);
  if (!campaign) return null;
  const { sourceJson, ...summary } = campaign;
  return { ...summary, setupPackage: JSON.parse(sourceJson) };
}

function getRuntimeDashboard(database, accountId, runtimeId) {
  const campaign = database.prepare(`SELECT campaigns.runtime_id AS id, campaigns.name, campaigns.setting,
      campaigns.premise, campaigns.era, campaigns.revision, campaigns.created_at AS createdAt,
      campaign_memberships.role
    FROM campaigns JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    WHERE campaigns.runtime_id = ? AND campaign_memberships.account_id = ?
      AND campaign_memberships.role = 'gm' AND campaigns.active = 1`).get(runtimeId, accountId);
  if (!campaign) return null;

  const dashboard = database.prepare(`SELECT game_date AS gameDate, day_number AS dayNumber,
      distance_km AS distanceKm, rations_days AS rationsDays, fuel_units AS fuelUnits,
      weather, weather_note AS weatherNote, active_stop_index AS activeStopIndex, updated_at AS updatedAt
    FROM runtime_dashboard_state WHERE campaign_id = ?`).get(runtimeId);
  if (!dashboard) return null;

  const route = database.prepare(`SELECT route_stops.ordinal, route_stops.location_id AS locationId,
      locations.name, route_stops.detail, route_stops.km_from_previous AS kmFromPrevious,
      locations.grid_ref AS gridRef, locations.map_position_json AS mapPositionJson
    FROM route_stops JOIN locations ON locations.runtime_campaign_id = route_stops.campaign_id
      AND locations.id = route_stops.location_id
    WHERE route_stops.campaign_id = ? ORDER BY route_stops.ordinal`).all(runtimeId).map(({ mapPositionJson, ...stop }) => ({
      ...stop,
      mapPosition: JSON.parse(mapPositionJson)
    }));
  const personnel = database.prepare(`SELECT id, name, role, condition, readiness, sort_order AS sortOrder
    FROM personnel WHERE campaign_id = ? ORDER BY sort_order`).all(runtimeId);
  const journal = database.prepare(`SELECT id, title, body, entry_date AS entryDate, kind, created_at AS createdAt
    FROM journal_entries WHERE campaign_id = ? ORDER BY entry_date DESC, created_at DESC, id`).all(runtimeId);
  return { campaign, dashboard, route, personnel, journal };
}

function normalizePlayerSeedFields(fields) {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 100) throw new Error("A player seed needs between 1 and 100 fields.");
  const keys = new Set();
  return fields.map((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)
      || typeof field.key !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(field.key)
      || typeof field.label !== "string" || !field.label.trim() || field.label.length > 100
      || typeof field.value !== "string" || field.value.length > 2000
      || typeof field.required !== "boolean") {
      throw new Error("A player seed contains an invalid field definition.");
    }
    if (keys.has(field.key)) throw new Error(`The player seed contains a duplicate field key: ${field.key}.`);
    keys.add(field.key);
    const value = field.value.trim();
    return {
      key: field.key,
      label: field.label.trim(),
      value,
      required: field.required,
      playerEditable: value.length === 0
    };
  });
}

function createAssignedUser(database, gmAccountId, username, options = {}) {
  if (typeof username !== "string" || !/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Username must be 3-32 letters, numbers, dots, underscores, or hyphens.");
  }
  const gm = database.prepare("SELECT global_role FROM accounts WHERE id = ? AND disabled = 0").get(gmAccountId);
  if (gm?.global_role !== "gm") throw new Error("GM account required.");
  const normalizedUsername = username.toLowerCase();
  const timestampValue = (options.now || (() => Date.now()))();
  const timestamp = new Date(timestampValue).toISOString();
  const accountId = randomUUID();
  const activationToken = randomBytes(32).toString("base64url");
  const placeholderHash = `disabled$${randomBytes(32).toString("hex")}`;

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`INSERT INTO accounts
      (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role, created_by_account_id)
      VALUES (?, ?, ?, 1, ?, ?, 'player', ?)`)
      .run(accountId, normalizedUsername, placeholderHash, timestamp, timestamp, gmAccountId);
    database.prepare(`INSERT INTO account_invites (account_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?)`)
      .run(accountId, createHash("sha256").update(activationToken).digest("hex"),
        new Date(timestampValue + 7 * 24 * 60 * 60 * 1000).toISOString(), timestamp);
    database.exec("COMMIT");
    return { id: accountId, username: normalizedUsername, disabled: true, activationToken };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function listAssignedUsers(database, gmAccountId) {
  const gm = database.prepare("SELECT global_role FROM accounts WHERE id = ? AND disabled = 0").get(gmAccountId);
  if (gm?.global_role !== "gm") return null;
  return database.prepare(`SELECT accounts.id, accounts.login_identifier AS username, accounts.disabled,
      EXISTS (SELECT 1 FROM account_invites WHERE account_invites.account_id = accounts.id) AS activationPending,
      (SELECT COUNT(*) FROM player_seats WHERE player_seats.account_id = accounts.id AND player_seats.active = 1) AS campaignAssignments
    FROM accounts WHERE accounts.global_role = 'player' AND accounts.created_by_account_id = ?
    ORDER BY accounts.login_identifier`).all(gmAccountId).map((user) => ({
      ...user,
      disabled: Boolean(user.disabled),
      activationPending: Boolean(user.activationPending)
    }));
}

function createPlayerSeed(database, gmAccountId, campaignId, input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Player seed details are required.");
  if (typeof input.username !== "string" || !/^[A-Za-z0-9._-]{3,32}$/.test(input.username)) {
    throw new Error("Choose a username created by the GM.");
  }
  if (typeof input.displayLabel !== "string" || !input.displayLabel.trim() || input.displayLabel.length > 80) {
    throw new Error("Player display label is missing or too long.");
  }
  const fields = normalizePlayerSeedFields(input.fields);
  const username = input.username.toLowerCase();
  const campaign = database.prepare("SELECT runtime_id FROM campaigns WHERE runtime_id = ? AND active = 1").get(campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  const gmMembership = database.prepare("SELECT 1 AS allowed FROM campaign_memberships WHERE campaign_id = ? AND account_id = ? AND role = 'gm'").get(campaignId, gmAccountId);
  if (!gmMembership) throw new Error("GM ownership is required to assign a player seed.");

  const nowValue = (options.now || (() => Date.now()))();
  const timestamp = new Date(nowValue).toISOString();
  const characterId = randomUUID();
  const seatId = randomUUID();

  database.exec("BEGIN IMMEDIATE");
  try {
    if (!database.prepare("SELECT 1 AS allowed FROM campaign_memberships WHERE campaign_id = ? AND account_id = ? AND role = 'gm'").get(campaignId, gmAccountId)) {
      throw new Error("GM ownership is required to assign a player seed.");
    }
    const activeSeats = database.prepare("SELECT COUNT(*) AS count FROM player_seats WHERE campaign_id = ? AND active = 1").get(campaignId).count;
    if (activeSeats >= 4) throw new Error("A campaign can have no more than four active player seats.");
    const existingAccount = database.prepare(`SELECT id, disabled, global_role, created_by_account_id
      FROM accounts WHERE login_identifier = ?`).get(username);
    if (!existingAccount || existingAccount.global_role !== "player" || existingAccount.created_by_account_id !== gmAccountId) {
      throw new Error("Choose a player username created by this GM.");
    }
    const accountId = existingAccount.id;

    database.prepare("INSERT INTO campaign_memberships (campaign_id, account_id, role, created_at) VALUES (?, ?, 'player', ?)")
      .run(campaignId, accountId, timestamp);
    database.prepare(`INSERT INTO characters (id, campaign_id, status, fields_json, created_at, updated_at)
      VALUES (?, ?, 'seed', ?, ?, ?)`).run(characterId, campaignId, JSON.stringify(fields), timestamp, timestamp);
    database.prepare(`INSERT INTO player_seats (id, campaign_id, account_id, character_id, display_label, active, assigned_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)`).run(seatId, campaignId, accountId, characterId, input.displayLabel.trim(), timestamp);
    database.exec("COMMIT");
    return {
      seatId,
      accountId,
      username,
      displayLabel: input.displayLabel.trim(),
      characterId,
      status: "seed"
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function listPlayerCampaigns(database, accountId) {
  return database.prepare(`SELECT campaigns.runtime_id AS id, campaigns.name, campaigns.setting,
      player_seats.id AS seatId, player_seats.display_label AS displayLabel,
      characters.id AS characterId, characters.status
    FROM player_seats
    JOIN campaigns ON campaigns.runtime_id = player_seats.campaign_id
    JOIN characters ON characters.id = player_seats.character_id AND characters.campaign_id = player_seats.campaign_id
    WHERE player_seats.account_id = ? AND player_seats.active = 1 AND campaigns.active = 1
    ORDER BY campaigns.created_at DESC, campaigns.runtime_id`).all(accountId);
}

function listCampaignPlayerSeeds(database, gmAccountId, campaignId) {
  const isOwner = database.prepare("SELECT 1 AS present FROM campaign_memberships WHERE campaign_id = ? AND account_id = ? AND role = 'gm'").get(campaignId, gmAccountId);
  if (!isOwner) return null;
  return database.prepare(`SELECT player_seats.id AS seatId, player_seats.display_label AS displayLabel,
      accounts.login_identifier AS username, characters.id AS characterId, characters.status,
      characters.fields_json AS fieldsJson, player_seats.assigned_at AS assignedAt
    FROM player_seats JOIN accounts ON accounts.id = player_seats.account_id
    JOIN characters ON characters.id = player_seats.character_id AND characters.campaign_id = player_seats.campaign_id
    WHERE player_seats.campaign_id = ? AND player_seats.active = 1
    ORDER BY player_seats.assigned_at, player_seats.id`).all(campaignId).map(({ fieldsJson, ...seed }) => ({ ...seed, fields: JSON.parse(fieldsJson) }));
}

function getPlayerCharacter(database, accountId, campaignId) {
  const row = database.prepare(`SELECT player_seats.id AS seatId, player_seats.display_label AS displayLabel,
      characters.id AS characterId, characters.status, characters.fields_json AS fieldsJson,
      campaigns.runtime_id AS campaignId, campaigns.name AS campaignName, campaigns.setting
    FROM player_seats
    JOIN campaigns ON campaigns.runtime_id = player_seats.campaign_id
    JOIN characters ON characters.id = player_seats.character_id AND characters.campaign_id = player_seats.campaign_id
    WHERE player_seats.account_id = ? AND player_seats.campaign_id = ? AND player_seats.active = 1 AND campaigns.active = 1`).get(accountId, campaignId);
  if (!row) return null;
  const { fieldsJson, ...character } = row;
  const pendingRequest = database.prepare(`SELECT id, requested_fields_json AS fieldsJson, submitted_at AS submittedAt
    FROM character_change_requests WHERE character_id = ? AND status = 'pending'`).get(row.characterId);
  return {
    ...character,
    fields: JSON.parse(fieldsJson),
    pendingChangeRequest: pendingRequest ? {
      id: pendingRequest.id,
      submittedAt: pendingRequest.submittedAt,
      fields: JSON.parse(pendingRequest.fieldsJson)
    } : null
  };
}

function createCharacterChangeRequest(database, accountId, campaignId, updates, options = {}) {
  if (!Array.isArray(updates) || updates.length < 1 || updates.length > 100) throw new Error("Submit between 1 and 100 character field changes.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const character = getPlayerCharacter(database, accountId, campaignId);
    if (!character) throw new Error("Assigned campaign not found.");
    if (character.status !== "playable") throw new Error("Finalize the character seed before requesting character changes.");
    if (character.pendingChangeRequest) throw new Error("A character change request is already awaiting GM review.");
    const changes = [];
    const seen = new Set();
    for (const update of updates) {
      if (!update || typeof update.key !== "string" || typeof update.value !== "string" || update.value.length > 2000 || seen.has(update.key)) {
        throw new Error("A character change is invalid or duplicated.");
      }
      seen.add(update.key);
      const field = character.fields.find((item) => item.key === update.key);
      if (!field) throw new Error(`Character field '${update.key}' does not exist.`);
      const value = update.value.trim();
      if (value !== field.value) changes.push({ key: field.key, label: field.label, oldValue: field.value, value });
    }
    if (!changes.length) throw new Error("No character field values changed.");
    const requestId = randomUUID();
    const submittedAt = new Date((options.now || (() => Date.now()))()).toISOString();
    database.prepare(`INSERT INTO character_change_requests
      (id, campaign_id, seat_id, character_id, requested_fields_json, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
      .run(requestId, campaignId, character.seatId, character.characterId, JSON.stringify(changes), submittedAt);
    database.exec("COMMIT");
    return { id: requestId, campaignId, seatId: character.seatId, characterId: character.characterId, status: "pending", submittedAt, fields: changes };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function listCharacterChangeRequests(database, gmAccountId, campaignId) {
  const isOwner = database.prepare("SELECT 1 AS present FROM campaign_memberships WHERE campaign_id = ? AND account_id = ? AND role = 'gm'").get(campaignId, gmAccountId);
  if (!isOwner) return null;
  return database.prepare(`SELECT requests.id, requests.campaign_id AS campaignId, requests.seat_id AS seatId,
      requests.character_id AS characterId, requests.requested_fields_json AS fieldsJson,
      requests.status, requests.submitted_at AS submittedAt,
      seats.display_label AS displayLabel, accounts.login_identifier AS username
    FROM character_change_requests AS requests
    JOIN player_seats AS seats ON seats.id = requests.seat_id
    JOIN accounts ON accounts.id = seats.account_id
    WHERE requests.campaign_id = ? AND requests.status = 'pending'
    ORDER BY requests.submitted_at, requests.id`).all(campaignId).map(({ fieldsJson, ...request }) => ({ ...request, fields: JSON.parse(fieldsJson) }));
}

function reviewCharacterChangeRequest(database, gmAccountId, campaignId, requestId, decision, reviewNote = "", options = {}) {
  if (!['approved', 'rejected'].includes(decision)) throw new Error("Review decision must be approved or rejected.");
  if (typeof reviewNote !== "string" || reviewNote.length > 500) throw new Error("Review note must be 500 characters or fewer.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const isOwner = database.prepare("SELECT 1 AS present FROM campaign_memberships WHERE campaign_id = ? AND account_id = ? AND role = 'gm'").get(campaignId, gmAccountId);
    if (!isOwner) throw new Error("GM ownership is required to review character changes.");
    const request = database.prepare(`SELECT id, character_id AS characterId, requested_fields_json AS fieldsJson
      FROM character_change_requests WHERE id = ? AND campaign_id = ? AND status = 'pending'`).get(requestId, campaignId);
    if (!request) throw new Error("Pending character change request not found.");
    const timestamp = new Date((options.now || (() => Date.now()))()).toISOString();
    if (decision === "approved") {
      const fields = database.prepare("SELECT fields_json AS fieldsJson FROM characters WHERE id = ? AND campaign_id = ? AND status = 'playable'").get(request.characterId, campaignId);
      if (!fields) throw new Error("Playable character record not found.");
      const characterFields = JSON.parse(fields.fieldsJson);
      const changes = JSON.parse(request.fieldsJson);
      changes.forEach((change) => {
        const field = characterFields.find((item) => item.key === change.key);
        if (!field) throw new Error(`Character field '${change.key}' no longer exists.`);
        field.value = change.value;
      });
      database.prepare("UPDATE characters SET fields_json = ?, updated_at = ? WHERE id = ? AND campaign_id = ?")
        .run(JSON.stringify(characterFields), timestamp, request.characterId, campaignId);
    }
    database.prepare(`UPDATE character_change_requests
      SET status = ?, reviewer_account_id = ?, reviewed_at = ?, review_note = ?
      WHERE id = ? AND campaign_id = ? AND status = 'pending'`)
      .run(decision, gmAccountId, timestamp, reviewNote.trim(), requestId, campaignId);
    database.exec("COMMIT");
    return { id: requestId, campaignId, characterId: request.characterId, status: decision, reviewedAt: timestamp, reviewNote: reviewNote.trim() };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function updatePlayerSeed(database, accountId, campaignId, updates, options = {}) {
  if (!Array.isArray(updates) || updates.length > 100) throw new Error("Seed updates must be a list of at most 100 fields.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const character = getPlayerCharacter(database, accountId, campaignId);
    if (!character) throw new Error("Assigned campaign not found.");
    if (character.status !== "seed") throw new Error("This character is finalized and can no longer be changed through seed completion.");
    const fields = character.fields.map((field) => ({ ...field }));
    const updateMap = new Map();
    updates.forEach((update) => {
      if (!update || typeof update.key !== "string" || typeof update.value !== "string" || update.value.length > 2000 || updateMap.has(update.key)) {
        throw new Error("A seed update is invalid or duplicated.");
      }
      updateMap.set(update.key, update.value.trim());
    });
    for (const [key, value] of updateMap) {
      const field = fields.find((candidate) => candidate.key === key);
      if (!field || !field.playerEditable) throw new Error(`Seed field '${key}' was not left open by the GM.`);
      field.value = value;
    }
    const timestamp = new Date((options.now || (() => Date.now()))()).toISOString();
    database.prepare("UPDATE characters SET fields_json = ?, updated_at = ? WHERE id = ? AND campaign_id = ? AND status = 'seed'")
      .run(JSON.stringify(fields), timestamp, character.characterId, campaignId);
    database.exec("COMMIT");
    return getPlayerCharacter(database, accountId, campaignId);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function finalizePlayerSeed(database, accountId, campaignId, options = {}) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const character = getPlayerCharacter(database, accountId, campaignId);
    if (!character) throw new Error("Assigned campaign not found.");
    if (character.status !== "seed") throw new Error("This character is already finalized.");
    const missing = character.fields.filter((field) => field.required && !field.value.trim()).map((field) => field.label);
    if (missing.length) throw new Error(`Complete the required fields: ${missing.join(", ")}.`);
    const timestamp = new Date((options.now || (() => Date.now()))()).toISOString();
    database.prepare("UPDATE characters SET status = 'playable', updated_at = ? WHERE id = ? AND campaign_id = ? AND status = 'seed'")
      .run(timestamp, character.characterId, campaignId);
    database.exec("COMMIT");
    return getPlayerCharacter(database, accountId, campaignId);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  openRuntimeDatabase,
  importSetupPackage,
  listRuntimeCampaigns,
  getRuntimeCampaign,
  getRuntimeDashboard,
  createAssignedUser,
  listAssignedUsers,
  createPlayerSeed,
  listPlayerCampaigns,
  listCampaignPlayerSeeds,
  getPlayerCharacter,
  updatePlayerSeed,
  finalizePlayerSeed,
  createCharacterChangeRequest,
  listCharacterChangeRequests,
  reviewCharacterChangeRequest
};