const { getRuntimeCampaign, getPlayerCharacter } = require("./runtime-store.cjs");
const { appendAuditEvent } = require("./audit.cjs");

const numericFields = ["damage", "stress", "temporaryRadiation", "permanentRadiation"];
const flagFields = ["starving", "dehydrated", "sleepDeprived", "hypothermic"];
const textFields = ["coolnessUnderFire", "criticalInjuries", "diseases", "notes"];

function emptyConditions() {
  return Object.fromEntries([...numericFields, ...flagFields].map((key) => [key, null]).concat(textFields.map((key) => [key, ""])));
}

function validateConditions(value) {
  const keys = [...numericFields, ...flagFields, ...textFields];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some((key) => !Object.hasOwn(value, key))) throw new Error("Invalid condition fields.");
  for (const key of numericFields) if (value[key] !== null && (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 9999)) throw new Error("Condition numbers must be blank or integers from 0 to 9999; these are storage limits, not rules thresholds.");
  for (const key of flagFields) if (![null, true, false].includes(value[key])) throw new Error("Condition flags must be true, false, or not recorded.");
  for (const key of textFields) if (typeof value[key] !== "string" || value[key].length > (key === "coolnessUnderFire" ? 160 : 2000)) throw new Error("Condition text exceeds its allowed length.");
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function gmRecord(database, campaignId, characterId) {
  const row = database.prepare("SELECT * FROM character_conditions WHERE campaign_id = ? AND character_id = ?").get(campaignId, characterId);
  return { characterId, revision: row?.revision ?? 0, recorded: Boolean(row?.active),
    conditions: row ? validateConditions(JSON.parse(row.conditions_json)) : emptyConditions(),
    gmNotes: row?.gm_notes ?? "", updatedAt: row?.updated_at ?? null };
}

function getGMConditions(database, accountId, campaignId) {
  const campaign = getRuntimeCampaign(database, accountId, campaignId);
  if (!campaign) return null;
  const characters = database.prepare(`SELECT characters.id, player_seats.display_label FROM characters
    LEFT JOIN player_seats ON player_seats.character_id = characters.id AND player_seats.campaign_id = characters.campaign_id
    WHERE characters.campaign_id = ? ORDER BY player_seats.display_label, characters.id`).all(campaignId);
  return { campaignId, campaignRevision: campaign.revision, characters: characters.map((character) => ({
    ...gmRecord(database, campaignId, character.id), displayLabel: character.display_label || "Unassigned character"
  })) };
}

function updateGMConditions(database, accountId, campaignId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !["characterId", "expectedRevision", "conditions", "gmNotes", "clear"].includes(key))
    || typeof input.characterId !== "string" || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || (Object.hasOwn(input, "clear") && (input.clear !== true || Object.hasOwn(input, "conditions") || Object.hasOwn(input, "gmNotes")))) throw new Error("Invalid condition update or revision.");
  const conditions = input.clear === true ? emptyConditions() : validateConditions(input.conditions);
  const gmNotes = input.clear === true ? "" : input.gmNotes;
  if (typeof gmNotes !== "string" || gmNotes.length > 4000) throw new Error("Private GM notes must be text up to 4000 characters.");
  database.exec("BEGIN IMMEDIATE");
  try {
    if (!getRuntimeCampaign(database, accountId, campaignId)) throw new Error("Runtime campaign not found.");
    if (!database.prepare("SELECT 1 FROM characters WHERE id = ? AND campaign_id = ?").get(input.characterId, campaignId)) throw new Error("Condition character not found.");
    const current = gmRecord(database, campaignId, input.characterId);
    if (current.revision !== input.expectedRevision) throw new Error("Condition revision changed; reload before retrying.");
    const timestamp = new Date().toISOString();
    database.prepare(`INSERT INTO character_conditions (character_id, campaign_id, revision, active, conditions_json, gm_notes, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(character_id) DO UPDATE SET
      revision = excluded.revision, active = excluded.active, conditions_json = excluded.conditions_json,
      gm_notes = excluded.gm_notes, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).run(
      input.characterId, campaignId, current.revision + 1, input.clear ? 0 : 1, JSON.stringify(conditions), gmNotes, accountId, timestamp);
    database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?").run(timestamp, campaignId);
    appendAuditEvent(database, accountId, campaignId, { action: input.clear ? "conditions.clear" : "conditions.save",
      targetType: "conditions", targetId: input.characterId, characterId: input.characterId,
      beforeRevision: current.revision, afterRevision: current.revision + 1 });
    const result = getGMConditions(database, accountId, campaignId);
    database.exec("COMMIT"); return { conditions: result };
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

function getPlayerConditions(database, accountId, campaignId) {
  const character = getPlayerCharacter(database, accountId, campaignId);
  if (!character) return null;
  const row = database.prepare("SELECT revision, conditions_json, updated_at FROM character_conditions WHERE campaign_id = ? AND character_id = ? AND active = 1")
    .get(campaignId, character.characterId);
  return { record: row ? { schemaVersion: 1, revision: row.revision, updatedAt: row.updated_at,
    conditions: validateConditions(JSON.parse(row.conditions_json)) } : null };
}

function validateConditionBackup(data) {
  const ids = new Set();
  for (const row of data.characterConditions) {
    if (ids.has(row.character_id) || !data.characters.some((character) => character.id === row.character_id)
      || !Number.isSafeInteger(row.revision) || row.revision < 0 || ![0, 1].includes(row.active)
      || !data.campaignMemberships.some((member) => member.account_id === row.updated_by && member.role === "gm")
      || typeof row.gm_notes !== "string" || row.gm_notes.length > 4000
      || typeof row.updated_at !== "string" || !Number.isFinite(Date.parse(row.updated_at))) throw new Error("Invalid condition ownership or metadata in runtime backup.");
    if (typeof row.conditions_json !== "string") throw new Error("Invalid condition data in runtime backup.");
    const values = validateConditions(JSON.parse(row.conditions_json));
    if (row.active === 0 && (row.gm_notes !== "" || Object.entries(values).some(([key, value]) =>
      [...numericFields, ...flagFields].includes(key) ? value !== null : value !== ""))) throw new Error("Cleared condition records must contain no public or private values.");
    ids.add(row.character_id);
  }
}

module.exports = { emptyConditions, validateConditions, getGMConditions, updateGMConditions, getPlayerConditions, validateConditionBackup };