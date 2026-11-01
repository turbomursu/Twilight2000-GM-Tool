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
    if (version > 16) {
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
  if (version < 7) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`CREATE TABLE situation_reports (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        draft_json TEXT NOT NULL,
        published_json TEXT,
        published_at TEXT
      ) STRICT;
      PRAGMA user_version = 7;`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }
  if (version < 8) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`CREATE TABLE map_publications (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        draft_json TEXT NOT NULL,
        published_json TEXT,
        published_at TEXT
      ) STRICT;
      PRAGMA user_version = 8;`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }
  if (version < 9) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`CREATE TABLE comms_messages (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
        sender_account_id TEXT NOT NULL REFERENCES accounts(id),
        sender_role TEXT NOT NULL CHECK (sender_role IN ('gm', 'player')),
        sender_label TEXT NOT NULL,
        message_text TEXT NOT NULL CHECK (length(message_text) BETWEEN 1 AND 240),
        game_date TEXT,
        day_number INTEGER CHECK (day_number >= 0),
        created_at TEXT NOT NULL,
        sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
        UNIQUE (campaign_id, sort_order),
        CHECK ((game_date IS NULL AND day_number IS NULL) OR (game_date IS NOT NULL AND day_number IS NOT NULL))
      ) STRICT;
      PRAGMA user_version = 9;`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }
  if (version < 10) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`CREATE TABLE inventory_items (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
        character_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        item_json TEXT NOT NULL,
        reviewed_by TEXT NOT NULL REFERENCES accounts(id),
        reviewed_at TEXT NOT NULL,
        FOREIGN KEY (campaign_id, character_id) REFERENCES characters(campaign_id, id),
        UNIQUE (campaign_id, character_id, id)
      ) STRICT;
      CREATE TABLE inventory_proposals (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
        character_id TEXT NOT NULL,
        submitter_account_id TEXT NOT NULL REFERENCES accounts(id),
        kind TEXT NOT NULL CHECK (kind IN ('add', 'update', 'remove')),
        item_id TEXT,
        expected_item_revision INTEGER,
        proposed_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        submitted_at TEXT NOT NULL,
        reviewed_by TEXT REFERENCES accounts(id),
        reviewed_at TEXT,
        review_note TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (campaign_id, character_id) REFERENCES characters(campaign_id, id),
        FOREIGN KEY (campaign_id, character_id, item_id) REFERENCES inventory_items(campaign_id, character_id, id)
      ) STRICT;
      CREATE UNIQUE INDEX one_pending_inventory_target ON inventory_proposals(item_id)
        WHERE status = 'pending' AND item_id IS NOT NULL;
      CREATE INDEX inventory_by_character ON inventory_items(campaign_id, character_id, active);
      CREATE INDEX inventory_proposals_by_campaign ON inventory_proposals(campaign_id, status, submitted_at);
      PRAGMA user_version = 10;`);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); database.close(); throw error; }
  }
  if (version < 11) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`CREATE TABLE character_conditions (
        character_id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        conditions_json TEXT NOT NULL,
        gm_notes TEXT NOT NULL,
        updated_by TEXT NOT NULL REFERENCES accounts(id),
        updated_at TEXT NOT NULL,
        FOREIGN KEY (campaign_id, character_id) REFERENCES characters(campaign_id, id)
      ) STRICT;
      PRAGMA user_version = 11;`);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); database.close(); throw error; }
  }
  if (version < 12) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`CREATE TABLE audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id),
        actor_account_id TEXT NOT NULL REFERENCES accounts(id),
        actor_label TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_label TEXT NOT NULL,
        character_id TEXT,
        related_id TEXT,
        before_revision INTEGER,
        after_revision INTEGER,
        campaign_revision_before INTEGER NOT NULL,
        campaign_revision_after INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        game_date TEXT,
        day_number INTEGER,
        origin TEXT NOT NULL CHECK (origin IN ('live', 'backup'))
      ) STRICT;
      CREATE INDEX audit_by_campaign ON audit_events(campaign_id, sequence DESC);
      CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events
        BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;
      CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events
        BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;
      PRAGMA user_version = 12;`);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); database.close(); throw error; }
  }
  if (version < 13) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec("ALTER TABLE runtime_dashboard_state ADD COLUMN game_time TEXT NOT NULL DEFAULT '00:00'; PRAGMA user_version = 13;");
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); database.close(); throw error; }
  }
  if (version < 14) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`CREATE TABLE daily_supply_usage (
        campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
        game_date TEXT NOT NULL,
        ration_days_used INTEGER NOT NULL CHECK (ration_days_used IN (0, 1)),
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, game_date)
      ) STRICT;
      ALTER TABLE comms_messages ADD COLUMN game_time TEXT;
      ALTER TABLE audit_events ADD COLUMN game_time TEXT;
      PRAGMA user_version = 14;`);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); database.close(); throw error; }
  }
  if (version < 15) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`ALTER TABLE factions ADD COLUMN faction_type TEXT NOT NULL DEFAULT 'npc' CHECK (faction_type IN ('player-party', 'npc'));
      ALTER TABLE factions ADD COLUMN is_player_controlled INTEGER NOT NULL DEFAULT 0 CHECK (is_player_controlled IN (0, 1));
      ALTER TABLE factions ADD COLUMN current_location_id TEXT;
      ALTER TABLE factions ADD COLUMN morale_rating TEXT CHECK (morale_rating IN ('A', 'B', 'C', 'D'));
      ALTER TABLE factions ADD COLUMN resources_json TEXT;
      CREATE UNIQUE INDEX unique_player_party_per_campaign
        ON factions(runtime_campaign_id) WHERE faction_type = 'player-party';
      CREATE TABLE party_members (
        runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
        faction_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        joined_at TEXT NOT NULL,
        PRIMARY KEY (runtime_campaign_id, faction_id, character_id),
        FOREIGN KEY (runtime_campaign_id, faction_id) REFERENCES factions(runtime_campaign_id, id) ON DELETE CASCADE,
        FOREIGN KEY (runtime_campaign_id, character_id) REFERENCES characters(campaign_id, id) ON DELETE CASCADE
      ) STRICT;
      CREATE INDEX idx_party_members_faction
        ON party_members(runtime_campaign_id, faction_id) WHERE is_active = 1;
      PRAGMA user_version = 15;`);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); database.close(); throw error; }
  }
  if (version < 16) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`CREATE TABLE player_seed_templates (
        id TEXT PRIMARY KEY,
        owner_gm_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
        display_label TEXT NOT NULL,
        character_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX player_seed_templates_by_owner ON player_seed_templates(owner_gm_id, created_at);
      PRAGMA user_version = 16;`);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); database.close(); throw error; }
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function runtimeBackupChecksum(payload) {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

function exportRuntimeSave(database, gmAccountId, runtimeId, options = {}) {
  database.exec("BEGIN");
  try {
    const backup = collectRuntimeSave(database, gmAccountId, runtimeId, options);
    database.exec("COMMIT");
    return backup;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function collectRuntimeSave(database, gmAccountId, runtimeId, options = {}) {
  const campaign = database.prepare(`SELECT campaigns.* FROM campaigns
    JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    WHERE campaigns.runtime_id = ? AND campaign_memberships.account_id = ?
      AND campaign_memberships.role = 'gm' AND campaigns.active = 1`).get(runtimeId, gmAccountId);
  if (!campaign) return null;

  const queryRows = (sql, ...parameters) => database.prepare(sql).all(...parameters);
  const data = {
    campaign,
    campaignMemberships: queryRows(`SELECT campaign_id, account_id, role, created_at
      FROM campaign_memberships WHERE campaign_id = ? ORDER BY role, account_id`, runtimeId),
    setupImport: database.prepare("SELECT * FROM setup_imports WHERE runtime_campaign_id = ?").get(runtimeId) || null,
    maps: queryRows("SELECT * FROM maps WHERE runtime_campaign_id = ?", runtimeId),
    terrainCells: queryRows("SELECT * FROM terrain_cells WHERE runtime_campaign_id = ? ORDER BY q, r", runtimeId),
    locations: queryRows("SELECT * FROM locations WHERE runtime_campaign_id = ? ORDER BY id", runtimeId),
    settlements: queryRows("SELECT * FROM settlements WHERE runtime_campaign_id = ? ORDER BY id", runtimeId),
    factions: queryRows("SELECT * FROM factions WHERE runtime_campaign_id = ? ORDER BY id", runtimeId),
    factionInfluenceCells: queryRows("SELECT * FROM faction_influence_cells WHERE runtime_campaign_id = ? ORDER BY faction_id, q, r", runtimeId),
    settlementFactions: queryRows("SELECT * FROM settlement_factions WHERE runtime_campaign_id = ? ORDER BY settlement_id, prominence_rank", runtimeId),
    gmNotes: queryRows("SELECT * FROM gm_notes WHERE runtime_campaign_id = ? ORDER BY id", runtimeId),
    dashboardState: database.prepare("SELECT * FROM runtime_dashboard_state WHERE campaign_id = ?").get(runtimeId) || null,
    situationReport: database.prepare("SELECT campaign_id, revision, draft_json FROM situation_reports WHERE campaign_id = ?").get(runtimeId) || null,
    mapPublication: database.prepare("SELECT campaign_id, revision, draft_json FROM map_publications WHERE campaign_id = ?").get(runtimeId) || null,
    commsMessages: queryRows("SELECT * FROM comms_messages WHERE campaign_id = ? ORDER BY sort_order", runtimeId),
    inventoryItems: queryRows("SELECT * FROM inventory_items WHERE campaign_id = ? ORDER BY id", runtimeId),
    inventoryProposals: queryRows("SELECT * FROM inventory_proposals WHERE campaign_id = ? ORDER BY id", runtimeId),
    characterConditions: queryRows("SELECT * FROM character_conditions WHERE campaign_id = ? ORDER BY character_id", runtimeId),
    auditEvents: queryRows("SELECT * FROM audit_events WHERE campaign_id = ? ORDER BY sequence", runtimeId),
    dailySupplyUsage: queryRows("SELECT * FROM daily_supply_usage WHERE campaign_id = ? ORDER BY game_date", runtimeId),
    routeStops: queryRows("SELECT * FROM route_stops WHERE campaign_id = ? ORDER BY ordinal", runtimeId),
    personnel: queryRows("SELECT * FROM personnel WHERE campaign_id = ? ORDER BY sort_order", runtimeId),
    journalEntries: queryRows("SELECT * FROM journal_entries WHERE campaign_id = ? ORDER BY id", runtimeId),
    characters: queryRows("SELECT * FROM characters WHERE campaign_id = ? ORDER BY id", runtimeId),
    playerSeats: queryRows("SELECT * FROM player_seats WHERE campaign_id = ? ORDER BY id", runtimeId),
    characterChangeRequests: queryRows("SELECT * FROM character_change_requests WHERE campaign_id = ? ORDER BY id", runtimeId)
  };
  const payload = {
    backupType: "fieldbook.campaign-runtime",
    schemaVersion: 1,
    exportedAt: (options.now || (() => new Date().toISOString()))(),
    campaignId: runtimeId,
    sourceRevision: campaign.revision,
    data
  };
  return { ...payload, checksum: runtimeBackupChecksum(payload) };
}

function validateRuntimeSave(backup, targetRuntimeId) {
  const fail = (message) => { throw new Error(message); };
  if (!backup || typeof backup !== "object" || Array.isArray(backup)
    || backup.backupType !== "fieldbook.campaign-runtime" || backup.schemaVersion !== 1) {
    fail("Choose a Fieldbook runtime backup using schema version 1.");
  }
  if (backup.campaignId !== targetRuntimeId || !Number.isSafeInteger(backup.sourceRevision) || backup.sourceRevision < 0
    || typeof backup.exportedAt !== "string" || !backup.data || typeof backup.data !== "object" || Array.isArray(backup.data)) {
    fail("The runtime backup does not match the selected campaign or has invalid metadata.");
  }
  const { checksum, ...payload } = backup;
  if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/.test(checksum)
    || runtimeBackupChecksum(payload) !== checksum) {
    fail("The runtime backup checksum is invalid; no data was restored.");
  }
  const data = { ...backup.data,
    commsMessages: Object.hasOwn(backup.data, "commsMessages") ? backup.data.commsMessages : [],
    inventoryItems: Object.hasOwn(backup.data, "inventoryItems") ? backup.data.inventoryItems : [],
    inventoryProposals: Object.hasOwn(backup.data, "inventoryProposals") ? backup.data.inventoryProposals : [],
    characterConditions: Object.hasOwn(backup.data, "characterConditions") ? backup.data.characterConditions : [],
    auditEvents: Object.hasOwn(backup.data, "auditEvents") ? backup.data.auditEvents.map((row) => ({ ...row, game_time: Object.hasOwn(row, "game_time") ? row.game_time : null })) : [],
    dailySupplyUsage: Object.hasOwn(backup.data, "dailySupplyUsage") ? backup.data.dailySupplyUsage : [],
    dashboardState: backup.data.dashboardState ? { ...backup.data.dashboardState,
      game_time: Object.hasOwn(backup.data.dashboardState, "game_time") ? backup.data.dashboardState.game_time : "00:00" } : null };
  if (!data.campaign || data.campaign.runtime_id !== targetRuntimeId
    || data.campaign.schema_version !== 1 || data.campaign.revision !== backup.sourceRevision
    || !data.setupImport || data.setupImport.runtime_campaign_id !== targetRuntimeId
    || data.setupImport.schema_version !== 2 || typeof data.setupImport.source_json !== "string") {
    fail("The runtime backup has an invalid campaign or setup snapshot.");
  }
  const limits = {
    campaignMemberships: 5,
    maps: 1,
    terrainCells: 10000,
    locations: 500,
    settlements: 500,
    factions: 200,
    factionInfluenceCells: 2000000,
    settlementFactions: 100000,
    gmNotes: 500,
    routeStops: 500,
    personnel: 200,
    journalEntries: 10000,
    characters: 1000,
    playerSeats: 4,
    characterChangeRequests: 10000,
    commsMessages: 10000,
    inventoryItems: 5000,
    inventoryProposals: 10000,
    characterConditions: 1000,
    auditEvents: 100000,
    dailySupplyUsage: 100000
  };
  for (const [key, maximum] of Object.entries(limits)) {
    if (!Array.isArray(data[key]) || data[key].length > maximum) fail(`The runtime backup has an invalid ${key} list.`);
    if (!data[key].every((row) => row && typeof row === "object" && !Array.isArray(row))) fail(`The runtime backup contains an invalid ${key} row.`);
  }
  if (data.maps.length !== 1 || !data.dashboardState || typeof data.dashboardState !== "object") {
    fail("The runtime backup needs one map and dashboard state.");
  }
  if (data.campaignMemberships.filter((membership) => membership.role === "gm").length !== 1
    || data.campaignMemberships.some((membership) => membership.campaign_id !== targetRuntimeId || !["gm", "player"].includes(membership.role))) {
    fail("The runtime backup has invalid campaign memberships.");
  }
  const seats = data.playerSeats;
  if (seats.filter((seat) => seat.active === 1).length > 4
    || new Set(seats.map((seat) => seat.account_id)).size !== seats.length
    || new Set(seats.map((seat) => seat.character_id)).size !== seats.length) {
    fail("The runtime backup has invalid or duplicate player seats.");
  }
  const campaignKeys = {
    terrainCells: "runtime_campaign_id",
    locations: "runtime_campaign_id",
    settlements: "runtime_campaign_id",
    factions: "runtime_campaign_id",
    factionInfluenceCells: "runtime_campaign_id",
    settlementFactions: "runtime_campaign_id",
    gmNotes: "runtime_campaign_id",
    routeStops: "campaign_id",
    personnel: "campaign_id",
    journalEntries: "campaign_id",
    characters: "campaign_id",
    playerSeats: "campaign_id",
    characterChangeRequests: "campaign_id",
    commsMessages: "campaign_id",
    inventoryItems: "campaign_id",
    inventoryProposals: "campaign_id",
    characterConditions: "campaign_id",
    auditEvents: "campaign_id",
    dailySupplyUsage: "campaign_id"
  };
  for (const [tableKey, campaignKey] of Object.entries(campaignKeys)) {
    if (data[tableKey].some((row) => row[campaignKey] !== targetRuntimeId)) fail(`The runtime backup contains a ${tableKey} row for another campaign.`);
  }
  if (data.dashboardState.campaign_id !== targetRuntimeId || data.routeStops.some((stop, index) => stop.ordinal !== index)) {
    fail("The runtime backup has invalid dashboard or route ordering data.");
  }
  const parseJson = (value, label, predicate) => {
    let parsed;
    try { parsed = JSON.parse(value); } catch { fail(`Invalid ${label} JSON in runtime backup.`); }
    if (typeof value !== "string" || !predicate(parsed)) fail(`Invalid ${label} data in runtime backup.`);
    return parsed;
  };
  const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (data.situationReport != null) {
    const report = data.situationReport;
    if (!isRecord(report) || report.campaign_id !== targetRuntimeId
      || !Number.isSafeInteger(report.revision) || report.revision < 0) fail("Invalid situation report in runtime backup.");
    parseJson(report.draft_json, "situation report draft", (draft) => isRecord(draft)
      && Object.keys(draft).length === 3
      && [["title", 160], ["body", 12000], ["gameTime", 120]].every(([key, maximum]) =>
        typeof draft[key] === "string" && draft[key].length <= maximum));
  }
  const coordinate = (value) => isRecord(value) && Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
  const source = parseJson(data.setupImport.source_json, "setup snapshot", isRecord);
  assertCampaignSetupPackage(source);
  if (createHash("sha256").update(data.setupImport.source_json, "utf8").digest("hex") !== data.setupImport.sha256
    || source.campaign.id !== data.setupImport.source_campaign_id
    || data.campaign.setup_campaign_id !== source.campaign.id) fail("Invalid setup snapshot provenance in runtime backup.");
  const map = data.maps[0];
  if (map.runtime_campaign_id !== targetRuntimeId) fail("The backup map belongs to another campaign.");
  parseJson(map.bounds_json, "map bounds", (bounds) => isRecord(bounds)
    && [bounds.south, bounds.west, bounds.north, bounds.east].every(Number.isFinite)
    && bounds.south >= -90 && bounds.north <= 90 && bounds.west >= -180 && bounds.east <= 180
    && bounds.south < bounds.north && bounds.west < bounds.east);
  parseJson(map.center_json, "map center", coordinate);
  parseJson(map.annotations_json, "map annotations", Array.isArray);
  if (map.atlas_json !== null) parseJson(map.atlas_json, "atlas", isRecord);
  data.locations.forEach((location) => parseJson(location.map_position_json, "location position", coordinate));
  if (data.mapPublication != null) {
    const publication = data.mapPublication;
    if (!isRecord(publication) || publication.campaign_id !== targetRuntimeId
      || !Number.isSafeInteger(publication.revision) || publication.revision < 0) fail("Invalid map publication in runtime backup.");
    const draft = parseJson(publication.draft_json, "map publication draft", isRecord);
    require("./map-publications.cjs").validateMapDraft(draft, JSON.parse(map.bounds_json),
      data.locations.map((location) => ({ id: location.id, position: JSON.parse(location.map_position_json) })));
  }
  data.characters.forEach((character) => {
    const fields = parseJson(character.fields_json, "character fields", Array.isArray);
    normalizePlayerSeedFields(fields);
    if (fields.some((field) => typeof field.playerEditable !== "boolean")) fail("Invalid character edit permissions in backup.");
  });
  const characters = new Map(data.characters.map((character) => [character.id, character]));
  const memberships = new Map(data.campaignMemberships.map((membership) => [membership.account_id, membership.role]));
  require("./inventory.cjs").validateInventoryBackup(data);
  require("./conditions.cjs").validateConditionBackup(data);
  require("./audit.cjs").validateAuditBackup(data);
  const messageIds = new Set();
  const messageOrders = new Set();
  data.commsMessages.forEach((message) => {
    if (message.game_time !== undefined && message.game_time !== null
      && (!require("../campaign-clock.js").validTime(message.game_time) || message.game_date === null)) fail("Invalid COMMS time of day in runtime backup.");
    if (typeof message.id !== "string" || !message.id || message.id.length > 120 || messageIds.has(message.id)
      || !Number.isSafeInteger(message.sort_order) || message.sort_order < 0 || messageOrders.has(message.sort_order)
      || !["gm", "player"].includes(message.sender_role) || memberships.get(message.sender_account_id) !== message.sender_role
      || typeof message.sender_label !== "string" || !message.sender_label.trim() || message.sender_label.length > 80
      || typeof message.created_at !== "string" || !Number.isFinite(Date.parse(message.created_at))) fail("Invalid COMMS message metadata in runtime backup.");
    if (require("./comms.cjs").validateMessageText(message.message_text) !== message.message_text) fail("Invalid COMMS message text in runtime backup.");
    if (message.game_date === null ? message.day_number !== null
      : typeof message.game_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(message.game_date)
        || !Number.isSafeInteger(message.day_number) || message.day_number < 0
        || new Date(`${message.game_date}T00:00:00Z`).toISOString().slice(0, 10) !== message.game_date) fail("Invalid COMMS game time in runtime backup.");
    messageIds.add(message.id); messageOrders.add(message.sort_order);
  });
  seats.forEach((seat) => {
    if (!characters.has(seat.character_id) || memberships.get(seat.account_id) !== "player") {
      fail("Invalid player seat ownership in runtime backup.");
    }
  });
  data.campaignMemberships.forEach((membership) => {
    if (membership.role === "player" && !seats.some((seat) => seat.account_id === membership.account_id)) {
      fail("A player membership has no seat in runtime backup.");
    }
  });
  data.characterChangeRequests.forEach((request) => {
    const seat = seats.find((candidate) => candidate.id === request.seat_id);
    if (!seat || seat.character_id !== request.character_id) fail("Invalid change request ownership in runtime backup.");
    const changes = parseJson(request.requested_fields_json, "character changes", Array.isArray);
    const fields = JSON.parse(characters.get(request.character_id).fields_json);
    if (!changes.length || changes.length > 100 || new Set(changes.map((change) => change?.key)).size !== changes.length
      || changes.some((change) => !isRecord(change) || typeof change.value !== "string" || change.value.length > 2000
        || !fields.some((field) => field.key === change.key))) fail("Invalid proposed character changes in runtime backup.");
  });
  const dashboard = data.dashboardState;
  if (!require("../campaign-clock.js").validTime(dashboard.game_time)) fail("Invalid campaign time in runtime backup.");
  const supplyDates = new Set();
  data.dailySupplyUsage.forEach((row) => {
    if (typeof row.game_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.game_date) || supplyDates.has(row.game_date)
      || new Date(`${row.game_date}T00:00:00Z`).toISOString().slice(0, 10) !== row.game_date
      || ![0, 1].includes(row.ration_days_used) || typeof row.recorded_at !== "string" || !Number.isFinite(Date.parse(row.recorded_at))) fail("Invalid daily supply usage in runtime backup.");
    supplyDates.add(row.game_date);
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dashboard.game_date)
    || new Date(`${dashboard.game_date}T00:00:00Z`).toISOString().slice(0, 10) !== dashboard.game_date
    || [dashboard.day_number, dashboard.distance_km, dashboard.rations_days, dashboard.fuel_units, dashboard.active_stop_index]
      .some((value) => !Number.isSafeInteger(value) || value < 0)
    || dashboard.active_stop_index >= data.routeStops.length
    || typeof dashboard.weather !== "string" || !dashboard.weather.trim()
    || typeof dashboard.weather_note !== "string") fail("Invalid dashboard state in runtime backup.");
  return data;
}

function restoreRuntimeSave(database, gmAccountId, targetRuntimeId, backup, options = {}) {
  const data = validateRuntimeSave(backup, targetRuntimeId);
  if (options.confirmReplace !== true) throw new Error("Confirm replacing the selected runtime campaign before restoring.");
  if (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0) {
    throw new Error("The current campaign revision is required for restore.");
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    const current = database.prepare(`SELECT campaigns.revision FROM campaigns
      JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
      WHERE campaigns.runtime_id = ? AND campaign_memberships.account_id = ?
        AND campaign_memberships.role = 'gm' AND campaigns.active = 1`).get(targetRuntimeId, gmAccountId);
    if (!current) throw new Error("Runtime campaign not found.");
    if (current.revision !== options.expectedRevision) throw new Error("Campaign revision changed. Reload the campaign before restoring.");
    if (backup.sourceRevision < current.revision && options.confirmOlderBackup !== true) {
      throw new Error("This backup is older than the active campaign. Explicit confirmation is required.");
    }
    const ownerInBackup = data.campaignMemberships.some((membership) => membership.account_id === gmAccountId && membership.role === "gm");
    if (!ownerInBackup) throw new Error("The runtime backup does not preserve the current GM owner.");
    const currentSource = database.prepare("SELECT sha256, source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(targetRuntimeId);
    if (!currentSource || currentSource.sha256 !== data.setupImport.sha256 || currentSource.source_json !== data.setupImport.source_json) {
      throw new Error("Restore cannot change the immutable setup source snapshot.");
    }
    for (const membership of data.campaignMemberships) {
      const account = database.prepare("SELECT global_role FROM accounts WHERE id = ?").get(membership.account_id);
      if (!account || account.global_role !== membership.role) throw new Error("The runtime backup references an unavailable or mismatched account role.");
    }

    const deleteTables = [
      ["daily_supply_usage", "campaign_id"],
      ["character_conditions", "campaign_id"],
      ["inventory_proposals", "campaign_id"], ["inventory_items", "campaign_id"],
      ["comms_messages", "campaign_id"],
      ["character_change_requests", "campaign_id"], ["player_seats", "campaign_id"], ["characters", "campaign_id"],
      ["route_stops", "campaign_id"], ["personnel", "campaign_id"], ["journal_entries", "campaign_id"],
      ["runtime_dashboard_state", "campaign_id"], ["settlement_factions", "runtime_campaign_id"],
      ["faction_influence_cells", "runtime_campaign_id"], ["settlements", "runtime_campaign_id"],
      ["factions", "runtime_campaign_id"], ["terrain_cells", "runtime_campaign_id"], ["gm_notes", "runtime_campaign_id"],
      ["locations", "runtime_campaign_id"], ["maps", "runtime_campaign_id"], ["setup_imports", "runtime_campaign_id"],
      ["campaign_memberships", "campaign_id"]
    ];
    const inventoryRevisions = new Map(database.prepare("SELECT id, revision FROM inventory_items WHERE campaign_id = ?")
      .all(targetRuntimeId).map((item) => [item.id, item.revision]));
    const currentConditions = new Map(database.prepare("SELECT character_id, revision FROM character_conditions WHERE campaign_id = ?")
      .all(targetRuntimeId).map((row) => [row.character_id, row.revision]));
    deleteTables.forEach(([table, column]) => database.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(targetRuntimeId));

    const timestamp = new Date((options.now || (() => Date.now()))()).toISOString();
    const currentReport = database.prepare("SELECT revision FROM situation_reports WHERE campaign_id = ?").get(targetRuntimeId);
    if (currentReport || data.situationReport) {
      database.prepare(`INSERT INTO situation_reports (campaign_id, revision, draft_json, published_json, published_at)
        VALUES (?, ?, ?, NULL, NULL) ON CONFLICT(campaign_id) DO UPDATE SET
        revision = excluded.revision, draft_json = excluded.draft_json, published_json = NULL, published_at = NULL`).run(
        targetRuntimeId, Math.max(currentReport?.revision ?? 0, data.situationReport?.revision ?? 0) + 1,
        data.situationReport?.draft_json ?? JSON.stringify({ title: "", body: "", gameTime: "" }));
    }
    const restoredRevision = Math.max(current.revision, backup.sourceRevision) + 1;
    const currentMap = database.prepare("SELECT revision FROM map_publications WHERE campaign_id = ?").get(targetRuntimeId);
    if (currentMap || data.mapPublication) {
      database.prepare(`INSERT INTO map_publications (campaign_id, revision, draft_json, published_json, published_at)
        VALUES (?, ?, ?, NULL, NULL) ON CONFLICT(campaign_id) DO UPDATE SET
        revision = excluded.revision, draft_json = excluded.draft_json, published_json = NULL, published_at = NULL`).run(
        targetRuntimeId, Math.max(currentMap?.revision ?? 0, data.mapPublication?.revision ?? 0) + 1,
        data.mapPublication?.draft_json ?? JSON.stringify({ locationIds: [], markings: [], routeLocationIds: [], playerPosition: null }));
    }
    const campaign = { ...data.campaign, revision: restoredRevision, updated_at: timestamp };
    database.prepare(`UPDATE campaigns SET setup_campaign_id = ?, schema_version = ?, name = ?, setting = ?, premise = ?, era = ?,
      revision = ?, active = ?, created_at = ?, updated_at = ? WHERE runtime_id = ?`)
      .run(campaign.setup_campaign_id, campaign.schema_version, campaign.name, campaign.setting, campaign.premise, campaign.era,
        campaign.revision, campaign.active, campaign.created_at, campaign.updated_at, targetRuntimeId);

    const insertRows = (table, columns, rows) => {
      if (!rows.length) return;
      const statement = database.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`);
      rows.forEach((row) => statement.run(...columns.map((column) => row[column])));
    };
    insertRows("campaign_memberships", ["campaign_id", "account_id", "role", "created_at"], data.campaignMemberships);
    insertRows("setup_imports", ["runtime_campaign_id", "source_campaign_id", "schema_version", "imported_at", "sha256", "source_json"], [data.setupImport]);
    insertRows("maps", ["runtime_campaign_id", "source_map_id", "name", "bounds_json", "center_json", "zoom", "atlas_json", "annotations_json", "attribution"], data.maps);
    insertRows("terrain_cells", ["runtime_campaign_id", "q", "r", "terrain_type"], data.terrainCells);
    insertRows("locations", ["runtime_campaign_id", "id", "name", "kind", "description", "grid_ref", "coordinates_json", "map_position_json", "visibility_eligibility", "is_starting_location"], data.locations);
    insertRows("settlements", ["runtime_campaign_id", "id", "source_location_id", "name", "scale", "population_estimate", "security", "attitude", "leadership", "situation"], data.settlements);
    insertRows("factions", ["runtime_campaign_id", "id", "name", "description", "color", "faction_type", "is_player_controlled", "current_location_id", "morale_rating", "resources_json"], data.factions);
    insertRows("faction_influence_cells", ["runtime_campaign_id", "faction_id", "q", "r"], data.factionInfluenceCells);
    insertRows("settlement_factions", ["runtime_campaign_id", "settlement_id", "faction_id", "prominence_rank"], data.settlementFactions);
    insertRows("gm_notes", ["runtime_campaign_id", "id", "title", "body", "visibility"], data.gmNotes);
    insertRows("runtime_dashboard_state", ["campaign_id", "game_date", "game_time", "day_number", "distance_km", "rations_days", "fuel_units", "weather", "weather_note", "active_stop_index", "updated_at"], [data.dashboardState]);
    insertRows("daily_supply_usage", ["campaign_id", "game_date", "ration_days_used", "recorded_at"], data.dailySupplyUsage);
    insertRows("route_stops", ["campaign_id", "ordinal", "location_id", "detail", "km_from_previous"], data.routeStops);
    insertRows("personnel", ["campaign_id", "id", "name", "role", "condition", "readiness", "sort_order"], data.personnel);
    insertRows("journal_entries", ["campaign_id", "id", "title", "body", "entry_date", "kind", "created_at"], data.journalEntries);
    insertRows("comms_messages", ["id", "campaign_id", "sender_account_id", "sender_role", "sender_label", "message_text", "game_date", "game_time", "day_number", "created_at", "sort_order"], data.commsMessages.map((row) => ({ ...row, game_time: row.game_time ?? null })));
    insertRows("characters", ["id", "campaign_id", "status", "fields_json", "created_at", "updated_at"], data.characters);
    const restoredConditions = data.characterConditions.map((row) => ({ ...row,
      revision: Math.max(row.revision, currentConditions.get(row.character_id) ?? 0) + 1 }));
    const savedConditionIds = new Set(data.characterConditions.map((row) => row.character_id));
    data.characters.forEach((character) => {
      if (currentConditions.has(character.id) && !savedConditionIds.has(character.id)) restoredConditions.push({
        character_id: character.id, campaign_id: targetRuntimeId, revision: currentConditions.get(character.id) + 1,
        active: 0, conditions_json: JSON.stringify(require("./conditions.cjs").emptyConditions()), gm_notes: "",
        updated_by: gmAccountId, updated_at: timestamp
      });
    });
    insertRows("character_conditions", ["character_id", "campaign_id", "revision", "active", "conditions_json", "gm_notes", "updated_by", "updated_at"], restoredConditions);
    const restoredItems = data.inventoryItems.map((item) => ({ ...item, revision: Math.max(item.revision, inventoryRevisions.get(item.id) ?? 0) + 1 }));
    const restoredItemRevisions = new Map(restoredItems.map((item) => [item.id, item.revision]));
    const savedItemRevisions = new Map(data.inventoryItems.map((item) => [item.id, item.revision]));
    const restoredProposals = data.inventoryProposals.map((proposal) => ({ ...proposal,
      expected_item_revision: proposal.status === "pending" && proposal.kind !== "add"
        && proposal.expected_item_revision === savedItemRevisions.get(proposal.item_id)
        ? restoredItemRevisions.get(proposal.item_id) : proposal.expected_item_revision }));
    insertRows("inventory_items", ["id", "campaign_id", "character_id", "revision", "active", "item_json", "reviewed_by", "reviewed_at"], restoredItems);
    insertRows("inventory_proposals", ["id", "campaign_id", "character_id", "submitter_account_id", "kind", "item_id", "expected_item_revision", "proposed_json", "status", "submitted_at", "reviewed_by", "reviewed_at", "review_note"], restoredProposals);
    insertRows("player_seats", ["id", "campaign_id", "account_id", "character_id", "display_label", "active", "assigned_at"], data.playerSeats);
    insertRows("character_change_requests", ["id", "campaign_id", "seat_id", "character_id", "requested_fields_json", "status", "submitted_at", "reviewer_account_id", "reviewed_at", "review_note"], data.characterChangeRequests);

    const audit = require("./audit.cjs");
    audit.mergeAuditBackup(database, targetRuntimeId, data.auditEvents);
    audit.appendAuditEvent(database, gmAccountId, targetRuntimeId, { action: "campaign.restore", targetType: "campaign",
      targetId: targetRuntimeId, beforeRevision: current.revision, afterRevision: restoredRevision, campaignRevisionBefore: current.revision });

    database.exec("COMMIT");
    return { campaignId: targetRuntimeId, restoredFromRevision: backup.sourceRevision, revision: restoredRevision };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
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

    // Create player party faction
    const partyId = `party-${runtimeId}`;
    const firstStartingLocation = database.prepare(
      `SELECT id FROM locations WHERE runtime_campaign_id = ? AND is_starting_location = 1 LIMIT 1`
    ).get(runtimeId);
    const firstLocation = firstStartingLocation?.id || input.map.locations[0]?.id || null;

    database.prepare(`INSERT INTO factions
      (runtime_campaign_id, id, name, description, color, faction_type, is_player_controlled,
       current_location_id, morale_rating)
      VALUES (?, ?, 'Player Party', 'The player character group', '#4A90E2', 'player-party', 1, ?, 'C')`)
      .run(runtimeId, partyId, firstLocation);

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

function syncPartyFactionMembers(database, runtimeId) {
  // Auto-sync party members from active player seats
  const party = database.prepare(
    `SELECT id FROM factions WHERE runtime_campaign_id = ? AND faction_type = 'player-party'`
  ).get(runtimeId);

  if (!party) return; // No party faction yet

  const partyId = party.id;
  const activeSeats = database.prepare(
    `SELECT character_id FROM player_seats WHERE campaign_id = ? AND active = 1`
  ).all(runtimeId);

  const timestamp = new Date().toISOString();

  // Remove stale members (characters no longer in active seats)
  database.prepare(
    `DELETE FROM party_members
     WHERE runtime_campaign_id = ? AND faction_id = ? AND character_id NOT IN (
       SELECT character_id FROM player_seats WHERE campaign_id = ? AND active = 1
     )`
  ).run(runtimeId, partyId, runtimeId);

  // Add new members
  for (const seat of activeSeats) {
    const existing = database.prepare(
      `SELECT 1 FROM party_members WHERE runtime_campaign_id = ? AND faction_id = ? AND character_id = ?`
    ).get(runtimeId, partyId, seat.character_id);

    if (!existing) {
      database.prepare(
        `INSERT INTO party_members (runtime_campaign_id, faction_id, character_id, is_active, joined_at)
         VALUES (?, ?, ?, 1, ?)`
      ).run(runtimeId, partyId, seat.character_id, timestamp);
    }
  }
}

function getRuntimeFactionLayers(database, accountId, runtimeId) {
  const campaign = database.prepare(`SELECT campaigns.revision FROM campaigns
    JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    WHERE campaigns.runtime_id = ? AND campaigns.active = 1
      AND campaign_memberships.account_id = ? AND campaign_memberships.role = 'gm'`).get(runtimeId, accountId);
  if (!campaign) return null;

  // Sync party members before reading faction layers
  syncPartyFactionMembers(database, runtimeId);

  const factions = database.prepare("SELECT id FROM factions WHERE runtime_campaign_id = ? ORDER BY id").all(runtimeId);
  const settlements = database.prepare("SELECT id FROM settlements WHERE runtime_campaign_id = ? ORDER BY id").all(runtimeId);
  const influence = database.prepare(`SELECT faction_id, q, r FROM faction_influence_cells
    WHERE runtime_campaign_id = ? ORDER BY faction_id, q, r`).all(runtimeId);
  const prominence = database.prepare(`SELECT settlement_id, faction_id FROM settlement_factions
    WHERE runtime_campaign_id = ? ORDER BY settlement_id, prominence_rank`).all(runtimeId);
  return {
    campaignId: runtimeId,
    revision: campaign.revision,
    influence: Object.fromEntries(factions.map(({ id }) => [id, influence.filter((cell) => cell.faction_id === id).map((cell) => `${cell.q},${cell.r}`)])),
    prominence: Object.fromEntries(settlements.map(({ id }) => [id, prominence.filter((link) => link.settlement_id === id).map((link) => link.faction_id)]))
  };
}

function updateRuntimeFactionLayers(database, accountId, runtimeId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new Error("A valid expected campaign revision is required.");
  }
  const isInfluence = Object.hasOwn(input, "factionId");
  const allowedKeys = isInfluence ? ["expectedRevision", "factionId", "cells"] : ["expectedRevision", "settlementId", "factionIds"];
  if (Object.keys(input).some((key) => !allowedKeys.includes(key))) throw new Error("Unsupported faction layer update fields.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const current = getRuntimeFactionLayers(database, accountId, runtimeId);
    if (!current) throw new Error("Runtime campaign not found.");
    if (current.revision !== input.expectedRevision) throw new Error("Campaign revision changed. Reload before saving faction edits.");
    if (isInfluence) {
      if (typeof input.factionId !== "string" || !Object.hasOwn(current.influence, input.factionId)) throw new Error("Faction not found in this campaign.");
      if (!Array.isArray(input.cells) || input.cells.length > 10000) throw new Error("Influence cells must be a list of at most 10000 hexes.");
      const cells = input.cells.map((cell) => parseInfluenceCell(cell, input.factionId));
      if (new Set(cells.map(([q, r]) => `${q},${r}`)).size !== cells.length) throw new Error("Influence cells contain duplicate hexes.");
      database.prepare("DELETE FROM faction_influence_cells WHERE runtime_campaign_id = ? AND faction_id = ?").run(runtimeId, input.factionId);
      const insert = database.prepare("INSERT INTO faction_influence_cells (runtime_campaign_id, faction_id, q, r) VALUES (?, ?, ?, ?)");
      cells.forEach(([q, r]) => insert.run(runtimeId, input.factionId, q, r));
    } else {
      if (typeof input.settlementId !== "string" || !Object.hasOwn(current.prominence, input.settlementId)) throw new Error("Settlement not found in this campaign.");
      if (!Array.isArray(input.factionIds) || input.factionIds.length > 200
        || input.factionIds.some((id) => typeof id !== "string" || !Object.hasOwn(current.influence, id))
        || new Set(input.factionIds).size !== input.factionIds.length) {
        throw new Error("Prominence must be a unique ordered list of factions in this campaign.");
      }
      database.prepare("DELETE FROM settlement_factions WHERE runtime_campaign_id = ? AND settlement_id = ?").run(runtimeId, input.settlementId);
      const insert = database.prepare("INSERT INTO settlement_factions (runtime_campaign_id, settlement_id, faction_id, prominence_rank) VALUES (?, ?, ?, ?)");
      input.factionIds.forEach((id, rank) => insert.run(runtimeId, input.settlementId, id, rank));
    }
    database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?")
      .run(new Date().toISOString(), runtimeId);
    const layers = getRuntimeFactionLayers(database, accountId, runtimeId);
    if (isInfluence) {
      require("./audit.cjs").appendAuditEvent(database, accountId, runtimeId, {
        action: "faction.influence.update", targetType: "faction_influence", targetId: input.factionId
      });
    } else {
      require("./audit.cjs").appendAuditEvent(database, accountId, runtimeId, {
        action: "faction.prominence.update", targetType: "faction_prominence", targetId: input.settlementId
      });
    }
    database.exec("COMMIT");
    return layers;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function getRuntimeDashboard(database, accountId, runtimeId) {
  const campaign = database.prepare(`SELECT campaigns.runtime_id AS id, campaigns.name, campaigns.setting,
      campaigns.premise, campaigns.era, campaigns.revision, campaigns.created_at AS createdAt,
      campaign_memberships.role
    FROM campaigns JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    WHERE campaigns.runtime_id = ? AND campaign_memberships.account_id = ?
      AND campaign_memberships.role = 'gm' AND campaigns.active = 1`).get(runtimeId, accountId);
  if (!campaign) return null;

  const dashboard = database.prepare(`SELECT game_date AS gameDate, day_number AS dayNumber, game_time AS gameTime,
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

function updateRuntimeDashboard(database, accountId, runtimeId, input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Runtime changes must be an object.");
  const allowedSections = new Set(["expectedRevision", "dashboard", "personnel", "journal"]);
  if (Object.keys(input).some((key) => !allowedSections.has(key))) throw new Error("The runtime update contains an unsupported section.");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("Expected campaign revision is required.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const current = getRuntimeDashboard(database, accountId, runtimeId);
    if (!current) throw new Error("Runtime campaign not found.");
    if (current.campaign.revision !== input.expectedRevision) throw new Error("Campaign revision changed; reload before saving.");
    const timestamp = new Date((options.now || (() => Date.now()))()).toISOString();

    if (Object.hasOwn(input, "dashboard")) {
      const update = input.dashboard;
      if (!update || typeof update !== "object" || Array.isArray(update)) throw new Error("Dashboard changes must be an object.");
      const supported = new Set(["gameDate", "gameTime", "dayNumber", "distanceKm", "rationsDays", "fuelUnits", "weather", "weatherNote", "activeStopIndex"]);
      if (Object.keys(update).some((key) => !supported.has(key))) throw new Error("The dashboard update contains an unsupported field.");
      const next = { ...current.dashboard, ...update };
      if (!require("../campaign-clock.js").validTime(next.gameTime)) throw new Error("Campaign time must be HH:MM using a 24-hour clock.");
      if (typeof next.gameDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(next.gameDate) || !Number.isFinite(Date.parse(`${next.gameDate}T00:00:00Z`))) {
        throw new Error("Campaign game date must be a valid ISO date.");
      }
      for (const key of ["dayNumber", "distanceKm", "rationsDays", "fuelUnits", "activeStopIndex"]) {
        if (!Number.isSafeInteger(next[key]) || next[key] < 0) throw new Error(`${key} must be a non-negative integer.`);
      }
      if (next.activeStopIndex >= current.route.length) throw new Error("Active route stop is outside the campaign route.");
      if (typeof next.weather !== "string" || !next.weather.trim() || next.weather.length > 80) throw new Error("Weather label is missing or too long.");
      if (typeof next.weatherNote !== "string" || next.weatherNote.length > 1000) throw new Error("Weather note is too long.");
      database.prepare(`UPDATE runtime_dashboard_state SET game_date = ?, game_time = ?, day_number = ?, distance_km = ?,
        rations_days = ?, fuel_units = ?, weather = ?, weather_note = ?, active_stop_index = ?, updated_at = ?
        WHERE campaign_id = ?`)
        .run(next.gameDate, next.gameTime, next.dayNumber, next.distanceKm, next.rationsDays, next.fuelUnits,
          next.weather.trim(), next.weatherNote, next.activeStopIndex, timestamp, runtimeId);
    }

    if (Object.hasOwn(input, "personnel")) {
      if (!Array.isArray(input.personnel) || input.personnel.length > 200) throw new Error("Personnel must be a list of at most 200 records.");
      const rows = input.personnel.map((person, sortOrder) => {
        if (!person || typeof person !== "object" || Array.isArray(person)
          || typeof person.id !== "string" && typeof person.id !== "number"
          || typeof person.name !== "string" || !person.name.trim() || person.name.length > 100
          || typeof person.role !== "string" || !person.role.trim() || person.role.length > 80
          || typeof person.condition !== "string" || !person.condition.trim() || person.condition.length > 80
          || typeof person.readiness !== "string" || !person.readiness.trim() || person.readiness.length > 40) {
          throw new Error("A personnel record is invalid.");
        }
        return { id: String(person.id), name: person.name.trim(), role: person.role.trim(), condition: person.condition.trim(), readiness: person.readiness.trim(), sortOrder };
      });
      if (new Set(rows.map((person) => person.id)).size !== rows.length) throw new Error("Personnel IDs must be unique within the campaign.");
      database.prepare("DELETE FROM personnel WHERE campaign_id = ?").run(runtimeId);
      const insert = database.prepare(`INSERT INTO personnel
        (campaign_id, id, name, role, condition, readiness, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      rows.forEach((person) => insert.run(runtimeId, person.id, person.name, person.role, person.condition, person.readiness, person.sortOrder));
    }

    if (Object.hasOwn(input, "journal")) {
      if (!Array.isArray(input.journal) || input.journal.length > 1000) throw new Error("Journal must be a list of at most 1000 entries.");
      const rows = input.journal.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)
          || typeof entry.id !== "string" && typeof entry.id !== "number"
          || typeof entry.title !== "string" || !entry.title.trim() || entry.title.length > 120
          || typeof entry.body !== "string" || entry.body.length > 4000
          || typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
          || typeof entry.kind !== "string" || !entry.kind.trim() || entry.kind.length > 80) {
          throw new Error("A journal entry is invalid.");
        }
        return { id: String(entry.id), title: entry.title.trim(), body: entry.body, date: entry.date, kind: entry.kind.trim() };
      });
      if (new Set(rows.map((entry) => entry.id)).size !== rows.length) throw new Error("Journal entry IDs must be unique within the campaign.");
      const existingJournal = new Set(current.journal.map((e) => e.id));
      database.prepare("DELETE FROM journal_entries WHERE campaign_id = ?").run(runtimeId);
      const insert = database.prepare(`INSERT INTO journal_entries
        (campaign_id, id, title, body, entry_date, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      rows.forEach((entry) => insert.run(runtimeId, entry.id, entry.title, entry.body, entry.date, entry.kind, timestamp));
      database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?")
        .run(timestamp, runtimeId);
      for (const row of rows) {
        const action = existingJournal.has(row.id) ? "journal.update" : "journal.create";
        require("./audit.cjs").appendAuditEvent(database, accountId, runtimeId, {
          action, targetType: "journal_entry", targetId: row.id
        });
      }
    }

    if (Object.hasOwn(input, "dashboard")) {
      database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?")
        .run(timestamp, runtimeId);
      require("./audit.cjs").appendAuditEvent(database, accountId, runtimeId, {
        action: "dashboard.update", targetType: "dashboard", targetId: runtimeId
      });
    }

    database.exec("COMMIT");
    return getRuntimeDashboard(database, accountId, runtimeId);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function normalizePlayerSeedFields(fields, maximumValueLength = 2000) {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 100) throw new Error("A player seed needs between 1 and 100 fields.");
  const keys = new Set();
  return fields.map((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)
      || typeof field.key !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(field.key)
      || typeof field.label !== "string" || !field.label.trim() || field.label.length > 100
      || typeof field.value !== "string" || field.value.length > maximumValueLength
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

const PLAYER_SEED_ATTRIBUTES = ["Strength", "Agility", "Intelligence", "Empathy"];
const PLAYER_SEED_SKILLS = ["Close Combat", "Heavy Weapons", "Stamina", "Driving", "Ranged Combat", "Mobility", "Recon", "Survival", "Tech", "Command", "Medical Aid", "Persuasion"];
const PLAYER_SEED_STEPS = ["step-nationality", "step-attributes", "step-careers", "step-war", "step-personal"];

function normalizePlayerCharacterTemplate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A character template is required.");
  const cleanText = (value, label, maximumLength) => {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string" || value.length > maximumLength) throw new Error(`${label} is invalid or too long.`);
    return value.trim();
  };
  const ratingMap = (value, names, allowed, label) => {
    if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error(`${label} ratings are invalid.`);
    return Object.fromEntries(names.map((name) => {
      const rating = value?.[name] ?? "";
      if (rating !== "" && !allowed.includes(rating)) throw new Error(`${name} has an invalid rating.`);
      return [name, rating];
    }));
  };
  const ageValue = input.age ?? "";
  const age = ageValue === "" ? "" : Number(ageValue);
  if (age !== "" && (!Number.isSafeInteger(age) || age < 18 || age > 99)) throw new Error("Character age must be a whole number from 18 to 99.");
  const lifePath = input.lifePath ?? {};
  if (!lifePath || typeof lifePath !== "object" || Array.isArray(lifePath)) throw new Error("The life-path record is invalid.");
  const careerTerms = lifePath.careerTerms ?? [];
  if (!Array.isArray(careerTerms) || careerTerms.length > 20) throw new Error("A character template can contain no more than 20 manual career terms.");
  const cleanLineList = (value, label) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 20) throw new Error(`${label} must be a list of no more than 20 entries.`);
    return value.map((item) => cleanText(item, label, 160)).filter(Boolean);
  };
  const normalizedTerms = careerTerms.map((term) => {
    if (!term || typeof term !== "object" || Array.isArray(term)) throw new Error("A career term is invalid.");
    const promotion = term.promotion ?? {};
    const aging = term.aging ?? {};
    const warCheck = term.warCheck ?? {};
    if (![promotion, aging, warCheck].every((item) => item && typeof item === "object" && !Array.isArray(item))) throw new Error("A career term outcome is invalid.");
    const yearsAged = aging.yearsAged === "" || aging.yearsAged === null || aging.yearsAged === undefined ? null : Number(aging.yearsAged);
    if (yearsAged !== null && (!Number.isSafeInteger(yearsAged) || yearsAged < 0 || yearsAged > 99)) throw new Error("Career-term aging must be a whole number from 0 to 99.");
    const promotionOutcome = cleanText(promotion.outcome, "Promotion outcome", 32);
    const warOutcome = cleanText(warCheck.outcome, "War-check outcome", 32);
    if (promotionOutcome && !["success", "failure", "not-applicable"].includes(promotionOutcome)) throw new Error("The promotion outcome is invalid.");
    if (warOutcome && !["no-outbreak", "war-broke-out", "not-applicable"].includes(warOutcome)) throw new Error("The war-check outcome is invalid.");
    return {
      career: cleanText(term.career, "Career", 120),
      skillAdvances: cleanLineList(term.skillAdvances, "Skill advance"),
      promotion: {
        skill: cleanText(promotion.skill, "Promotion skill", 100),
        roll: cleanText(promotion.roll, "Promotion roll", 120),
        outcome: promotionOutcome
      },
      specialties: cleanLineList(term.specialties, "Specialty"),
      aging: { yearsAged, effect: cleanText(aging.effect, "Aging effect", 500) },
      warCheck: { roll: cleanText(warCheck.roll, "War-check roll", 120), outcome: warOutcome },
      injuryOutcome: cleanText(term.injuryOutcome, "Injury outcome", 800),
      notes: cleanText(term.notes, "Career-term notes", 800)
    };
  });
  const creationSteps = input.creationSteps ?? {};
  if (!creationSteps || typeof creationSteps !== "object" || Array.isArray(creationSteps)) throw new Error("Character-creation progress is invalid.");
  const steps = Object.fromEntries(PLAYER_SEED_STEPS.map((key) => {
    const value = creationSteps[key] ?? false;
    if (typeof value !== "boolean") throw new Error("Character-creation progress must use boolean values.");
    return [key, value];
  }));
  const character = {
    characterName: cleanText(input.characterName, "Character name", 80),
    nationality: cleanText(input.nationality, "Nationality", 80),
    age,
    branch: cleanText(input.branch, "Branch or service", 100),
    militaryRank: cleanText(input.militaryRank, "Military rank", 60),
    attributes: ratingMap(input.attributes, PLAYER_SEED_ATTRIBUTES, ["A", "B", "C", "D"], "Attribute"),
    skills: ratingMap(input.skills, PLAYER_SEED_SKILLS, ["A", "B", "C", "D", "F"], "Skill"),
    specialties: cleanText(input.specialties, "Specialties", 1200),
    childhood: cleanText(input.childhood, "Childhood", 1600),
    lifePath: { careerTerms: normalizedTerms, legacyCareerNotes: cleanText(lifePath.legacyCareerNotes, "Earlier career notes", 3000) },
    atWarTerm: cleanText(input.atWarTerm, "At-war term", 1600),
    cuf: cleanText(input.cuf, "Coolness Under Fire", 1),
    startingGear: cleanText(input.startingGear, "Starting gear", 500),
    appearance: cleanText(input.appearance, "Appearance", 1000),
    moralCode: cleanText(input.moralCode, "Moral code", 700),
    bigDream: cleanText(input.bigDream, "Big dream", 700),
    buddy: cleanText(input.buddy, "Buddy", 100),
    howMetGroup: cleanText(input.howMetGroup, "How the character met the group", 700),
    gmNotes: cleanText(input.gmNotes, "GM notes", 1200),
    creationSteps: steps
  };
  if (character.cuf && !["A", "B", "C", "D"].includes(character.cuf)) throw new Error("Coolness Under Fire has an invalid rating.");
  if (Buffer.byteLength(JSON.stringify(character), "utf8") > 12000) throw new Error("The character template is too large.");
  return character;
}

function playerFieldsFromTemplate(character) {
  const fields = [];
  const add = (key, label, value, required = false) => fields.push({ key, label, value: String(value ?? ""), required });
  add("characterName", "Character name", character.characterName, true);
  add("nationality", "Nationality", character.nationality);
  add("age", "Age", character.age);
  add("branch", "Branch or service", character.branch);
  add("militaryRank", "Military rank", character.militaryRank);
  PLAYER_SEED_ATTRIBUTES.forEach((name) => add(`attribute${name}`, name, character.attributes[name]));
  PLAYER_SEED_SKILLS.forEach((name) => {
    const key = name.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part, index) => index === 0
      ? part[0].toLowerCase() + part.slice(1)
      : part[0].toUpperCase() + part.slice(1)).join("");
    add(`skill${key[0].toUpperCase()}${key.slice(1)}`, name, character.skills[name]);
  });
  add("specialties", "Specialties", character.specialties);
  add("childhood", "Childhood", character.childhood);
  const terms = character.lifePath.careerTerms.map((term, index) => [
    `Term ${index + 1}: ${term.career || "Career not recorded"}`,
    term.skillAdvances.length ? `Skill advances: ${term.skillAdvances.join(", ")}` : "",
    term.promotion.outcome ? `Promotion: ${term.promotion.outcome} (${term.promotion.skill || "skill not recorded"}; ${term.promotion.roll || "roll not recorded"})` : "",
    term.specialties.length ? `Specialties: ${term.specialties.join(", ")}` : "",
    term.aging.yearsAged !== null ? `Years aged: ${term.aging.yearsAged}; ${term.aging.effect}` : "",
    term.warCheck.outcome ? `War check: ${term.warCheck.outcome} (${term.warCheck.roll || "roll not recorded"})` : "",
    term.injuryOutcome,
    term.notes
  ].filter(Boolean).join(" / ")).join("\n");
  add("careerHistory", "Career terms", [terms, character.lifePath.legacyCareerNotes].filter(Boolean).join("\n"));
  add("atWarTerm", "At-war term", character.atWarTerm);
  add("cuf", "Coolness Under Fire", character.cuf);
  add("startingGear", "Starting gear", character.startingGear);
  add("appearance", "Appearance", character.appearance);
  add("moralCode", "Moral code", character.moralCode);
  add("bigDream", "Big dream", character.bigDream);
  add("buddy", "Buddy", character.buddy);
  add("howMetGroup", "How the character met the group", character.howMetGroup);
  return fields;
}

function listPlayerSeedTemplates(database, gmAccountId) {
  const gm = database.prepare("SELECT global_role FROM accounts WHERE id = ? AND disabled = 0").get(gmAccountId);
  if (gm?.global_role !== "gm") return null;
  return database.prepare(`SELECT templates.id, templates.account_id AS accountId, templates.display_label AS displayLabel,
      templates.character_json AS characterJson, templates.created_at AS createdAt, templates.updated_at AS updatedAt,
      accounts.login_identifier AS username
    FROM player_seed_templates AS templates JOIN accounts ON accounts.id = templates.account_id
    WHERE templates.owner_gm_id = ? ORDER BY templates.created_at, templates.id`).all(gmAccountId).map((row) => {
    const assignments = database.prepare(`SELECT campaigns.runtime_id AS campaignId, campaigns.name AS campaignName,
        player_seats.id AS seatId, characters.status
      FROM player_seats JOIN campaigns ON campaigns.runtime_id = player_seats.campaign_id
      JOIN characters ON characters.id = player_seats.character_id AND characters.campaign_id = player_seats.campaign_id
      WHERE player_seats.account_id = ? AND player_seats.active = 1 ORDER BY campaigns.created_at, campaigns.runtime_id`).all(row.accountId);
    const { characterJson, ...seed } = row;
    return { ...seed, character: JSON.parse(characterJson), assignments };
  });
}

function createPlayerSeedTemplate(database, gmAccountId, input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Player seed details are required.");
  if (typeof input.username !== "string" || !/^[A-Za-z0-9._-]{3,32}$/.test(input.username)) throw new Error("Choose a username using 3-32 letters, numbers, dots, underscores, or hyphens.");
  const username = input.username.toLowerCase();
  const displayLabel = requireText(input.displayLabel, "Player display label", 80);
  const character = normalizePlayerCharacterTemplate(input.character);
  const gm = database.prepare("SELECT global_role FROM accounts WHERE id = ? AND disabled = 0").get(gmAccountId);
  if (gm?.global_role !== "gm") throw new Error("GM account required.");
  const nowValue = (options.now || (() => Date.now()))();
  const timestamp = new Date(nowValue).toISOString();
  const templateId = randomUUID();
  let activationToken = null;
  database.exec("BEGIN IMMEDIATE");
  try {
    if (!database.prepare("SELECT 1 AS allowed FROM accounts WHERE id = ? AND global_role = 'gm' AND disabled = 0").get(gmAccountId)) throw new Error("GM account required.");
    let account = database.prepare("SELECT id, global_role, created_by_account_id FROM accounts WHERE login_identifier = ?").get(username);
    if (account && (account.global_role !== "player" || account.created_by_account_id !== gmAccountId)) throw new Error("Choose a player username created by this GM.");
    if (!account) {
      const accountId = randomUUID();
      activationToken = randomBytes(32).toString("base64url");
      const placeholderHash = `disabled$${randomBytes(32).toString("hex")}`;
      database.prepare(`INSERT INTO accounts
        (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role, created_by_account_id)
        VALUES (?, ?, ?, 1, ?, ?, 'player', ?)`)
        .run(accountId, username, placeholderHash, timestamp, timestamp, gmAccountId);
      database.prepare(`INSERT INTO account_invites (account_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)`)
        .run(accountId, createHash("sha256").update(activationToken).digest("hex"), new Date(nowValue + 7 * 24 * 60 * 60 * 1000).toISOString(), timestamp);
      account = { id: accountId, global_role: "player", created_by_account_id: gmAccountId };
    }
    if (database.prepare("SELECT 1 AS present FROM player_seed_templates WHERE account_id = ?").get(account.id)) throw new Error("This player already has a character template.");
    database.prepare(`INSERT INTO player_seed_templates
      (id, owner_gm_id, account_id, display_label, character_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(templateId, gmAccountId, account.id, displayLabel, JSON.stringify(character), timestamp, timestamp);
    database.exec("COMMIT");
    return { id: templateId, accountId: account.id, username, displayLabel, character, assignments: [], createdAt: timestamp, updatedAt: timestamp, activationToken };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function updatePlayerSeedTemplate(database, gmAccountId, templateId, input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Player seed details are required.");
  const displayLabel = requireText(input.displayLabel, "Player display label", 80);
  const character = normalizePlayerCharacterTemplate(input.character);
  const timestamp = new Date((options.now || (() => Date.now()))()).toISOString();
  const gm = database.prepare("SELECT global_role FROM accounts WHERE id = ? AND disabled = 0").get(gmAccountId);
  if (gm?.global_role !== "gm") throw new Error("GM account required.");
  const result = database.prepare(`UPDATE player_seed_templates SET display_label = ?, character_json = ?, updated_at = ?
    WHERE id = ? AND owner_gm_id = ?`).run(displayLabel, JSON.stringify(character), timestamp, templateId, gmAccountId);
  if (!result.changes) return null;
  return listPlayerSeedTemplates(database, gmAccountId).find((seed) => seed.id === templateId) || null;
}

function deletePlayerSeedTemplate(database, gmAccountId, templateId) {
  const gm = database.prepare("SELECT global_role FROM accounts WHERE id = ? AND disabled = 0").get(gmAccountId);
  if (gm?.global_role !== "gm") throw new Error("GM account required.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const template = database.prepare("SELECT account_id FROM player_seed_templates WHERE id = ? AND owner_gm_id = ?").get(templateId, gmAccountId);
    if (!template) {
      database.exec("COMMIT");
      return false;
    }
    if (database.prepare("SELECT 1 AS assigned FROM player_seats WHERE account_id = ? AND active = 1 LIMIT 1").get(template.account_id)) {
      throw new Error("Remove this player from all campaigns before deleting the template.");
    }
    database.prepare("DELETE FROM player_seed_templates WHERE id = ? AND owner_gm_id = ?").run(templateId, gmAccountId);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
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
  const templateId = typeof input.seedId === "string" ? input.seedId : null;
  let username = "";
  let displayLabel = "";
  let fields = [];
  if (!templateId) {
    if (typeof input.username !== "string" || !/^[A-Za-z0-9._-]{3,32}$/.test(input.username)) {
      throw new Error("Choose a username created by the GM.");
    }
    if (typeof input.displayLabel !== "string" || !input.displayLabel.trim() || input.displayLabel.length > 80) {
      throw new Error("Player display label is missing or too long.");
    }
    username = input.username.toLowerCase();
    displayLabel = input.displayLabel.trim();
    fields = normalizePlayerSeedFields(input.fields);
  } else if (input.displayLabel !== undefined) {
    displayLabel = requireText(input.displayLabel, "Player display label", 80);
  }
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
    let existingAccount;
    if (templateId) {
      const template = database.prepare(`SELECT templates.account_id AS accountId, templates.display_label AS displayLabel,
          templates.character_json AS characterJson, accounts.login_identifier AS username
        FROM player_seed_templates AS templates JOIN accounts ON accounts.id = templates.account_id
        WHERE templates.id = ? AND templates.owner_gm_id = ?`).get(templateId, gmAccountId);
      if (!template) throw new Error("Player seed template not found.");
      username = template.username;
      displayLabel ||= template.displayLabel;
      existingAccount = { id: template.accountId, global_role: "player", created_by_account_id: gmAccountId };
      fields = normalizePlayerSeedFields(playerFieldsFromTemplate(JSON.parse(template.characterJson)), 12000);
    } else {
      existingAccount = database.prepare(`SELECT id, disabled, global_role, created_by_account_id
        FROM accounts WHERE login_identifier = ?`).get(username);
    }
    if (!existingAccount || existingAccount.global_role !== "player" || existingAccount.created_by_account_id !== gmAccountId) {
      throw new Error("Choose a player username created by this GM.");
    }
    const accountId = existingAccount.id;

    database.prepare("INSERT INTO campaign_memberships (campaign_id, account_id, role, created_at) VALUES (?, ?, 'player', ?)")
      .run(campaignId, accountId, timestamp);
    database.prepare(`INSERT INTO characters (id, campaign_id, status, fields_json, created_at, updated_at)
      VALUES (?, ?, 'seed', ?, ?, ?)`).run(characterId, campaignId, JSON.stringify(fields), timestamp, timestamp);
    database.prepare(`INSERT INTO player_seats (id, campaign_id, account_id, character_id, display_label, active, assigned_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)`).run(seatId, campaignId, accountId, characterId, displayLabel, timestamp);
    database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?")
      .run(timestamp, campaignId);
    require("./audit.cjs").appendAuditEvent(database, gmAccountId, campaignId, {
      action: "seat.assign", targetType: "player_seat", targetId: seatId, characterId
    });
    database.exec("COMMIT");
    return {
      seatId,
      accountId,
      username,
      displayLabel,
      characterId,
      status: "seed",
      seedTemplateId: templateId
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
    const action = decision === "approved" ? "character.review.approve" : "character.review.reject";
    require("./audit.cjs").appendAuditEvent(database, gmAccountId, campaignId, {
      action, targetType: "character_review", targetId: request.characterId, characterId: request.characterId
    });
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

function advanceRuntimeTime(database, accountId, campaignId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("Current campaign revision is required to advance time.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const current = getRuntimeDashboard(database, accountId, campaignId);
    if (!current) throw new Error("Runtime campaign not found.");
    if (current.campaign.revision !== input.expectedRevision) throw new Error("Campaign revision changed; reload before advancing time.");
    if (database.prepare("SELECT COUNT(*) AS count FROM journal_entries WHERE campaign_id = ?").get(campaignId).count >= 10000) throw new Error("Campaign journal limit reached.");
    const clock = require("../campaign-clock.js").advanceSixHours(current.dashboard);
    const timestamp = new Date().toISOString();
    const midday = require("../campaign-clock.js").middayForAdvance(current.dashboard);
    let rationDaysUsed = 0;
    let suppliesProcessed = false;
    if (midday && !database.prepare("SELECT 1 FROM daily_supply_usage WHERE campaign_id = ? AND game_date = ?").get(campaignId, midday)) {
      if (database.prepare("SELECT COUNT(*) AS count FROM daily_supply_usage WHERE campaign_id = ?").get(campaignId).count >= 100000) throw new Error("Daily supply history limit reached.");
      rationDaysUsed = current.dashboard.rationsDays > 0 ? 1 : 0;
      database.prepare("INSERT INTO daily_supply_usage (campaign_id, game_date, ration_days_used, recorded_at) VALUES (?, ?, ?, ?)")
        .run(campaignId, midday, rationDaysUsed, timestamp);
      database.prepare("UPDATE runtime_dashboard_state SET rations_days = MAX(0, rations_days - ?) WHERE campaign_id = ?").run(rationDaysUsed, campaignId);
      suppliesProcessed = true;
    }
    database.prepare("UPDATE runtime_dashboard_state SET game_date = ?, game_time = ?, day_number = ?, updated_at = ? WHERE campaign_id = ?")
      .run(clock.gameDate, clock.gameTime, clock.dayNumber, timestamp, campaignId);
    database.prepare(`INSERT INTO journal_entries (campaign_id, id, title, body, entry_date, kind, created_at)
      VALUES (?, ?, ?, ?, ?, 'Clock', ?)`).run(campaignId, randomUUID(), `Time advanced to ${clock.gameDate} ${clock.gameTime}`,
      suppliesProcessed ? `GM advanced time by six hours. Midday ration schedule: ${rationDaysUsed ? "one ration-day consumed" : "no rations available"}. Fuel and item actions remain GM-managed.`
        : "GM advanced campaign time by six hours. No daily ration charge outside an unprocessed midday.", clock.gameDate, timestamp);
    database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?").run(timestamp, campaignId);
    require("./audit.cjs").appendAuditEvent(database, accountId, campaignId, { action: "clock.advance", targetType: "campaign",
      targetId: campaignId, beforeRevision: current.campaign.revision, afterRevision: current.campaign.revision + 1 });
    if (suppliesProcessed) require("./audit.cjs").appendAuditEvent(database, accountId, campaignId, { action: "supplies.midday", targetType: "campaign",
      targetId: campaignId });
    const runtime = getRuntimeDashboard(database, accountId, campaignId);
    database.exec("COMMIT"); return runtime;
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

function getPartyFaction(database, accountId, runtimeId) {
  const campaign = database.prepare(`SELECT campaigns.revision FROM campaigns
    JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    WHERE campaigns.runtime_id = ? AND campaigns.active = 1
      AND campaign_memberships.account_id = ? AND campaign_memberships.role = 'gm'`).get(runtimeId, accountId);
  if (!campaign) return null;

  const party = database.prepare(`
    SELECT f.id, f.name, f.description, f.color, f.faction_type, f.is_player_controlled,
           f.current_location_id, f.morale_rating, f.resources_json,
           l.name AS location_name
    FROM factions f
    LEFT JOIN locations l ON f.runtime_campaign_id = l.runtime_campaign_id AND f.current_location_id = l.id
    WHERE f.runtime_campaign_id = ? AND f.faction_type = 'player-party'
  `).get(runtimeId);

  if (!party) return null;

  const members = database.prepare(`
    SELECT pm.character_id, c.fields_json, ps.display_label
    FROM party_members pm
    JOIN characters c ON pm.character_id = c.id
    LEFT JOIN player_seats ps ON c.campaign_id = ps.campaign_id AND c.id = ps.character_id
    WHERE pm.runtime_campaign_id = ? AND pm.faction_id = ? AND pm.is_active = 1
    ORDER BY ps.display_label
  `).all(runtimeId, party.id);

  const resources = party.resources_json ? JSON.parse(party.resources_json) : null;

  return {
    id: party.id,
    name: party.name,
    description: party.description,
    color: party.color,
    type: party.faction_type,
    isPlayerControlled: party.is_player_controlled === 1,
    currentLocationId: party.current_location_id,
    currentLocationName: party.location_name,
    moraleRating: party.morale_rating,
    resources,
    members: members.map(member => {
      const fields = JSON.parse(member.fields_json);
      const nameField = fields.find(f => f.key === 'name');
      return {
        characterId: member.character_id,
        name: nameField?.value || member.display_label || 'Unknown',
        displayLabel: member.display_label
      };
    })
  };
}

module.exports = {
  advanceRuntimeTime,
  openRuntimeDatabase,
  importSetupPackage,
  listRuntimeCampaigns,
  getRuntimeCampaign,
  getRuntimeDashboard,
  getRuntimeFactionLayers,
  updateRuntimeFactionLayers,
  getPartyFaction,
  exportRuntimeSave,
  restoreRuntimeSave,
  updateRuntimeDashboard,
  createAssignedUser,
  listAssignedUsers,
  createPlayerSeedTemplate,
  listPlayerSeedTemplates,
  updatePlayerSeedTemplate,
  deletePlayerSeedTemplate,
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