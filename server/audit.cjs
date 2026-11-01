const { randomUUID } = require("node:crypto");

const actions = new Set([
  "conditions.save", "conditions.clear", "inventory.add", "inventory.update", "inventory.remove",
  "inventory.approve.add", "inventory.approve.update", "inventory.approve.remove", "inventory.reject",
  "report.draft", "report.publish", "report.withdraw", "map.draft", "map.publish", "map.withdraw", "campaign.restore", "clock.advance", "supplies.midday"
]);
const targetTypes = new Set(["conditions", "inventory_item", "inventory_proposal", "situation_report", "map_publication", "campaign"]);
const auditColumns = ["id", "campaign_id", "actor_account_id", "actor_label", "action", "target_type", "target_id", "target_label", "character_id", "related_id",
  "before_revision", "after_revision", "campaign_revision_before", "campaign_revision_after", "created_at", "game_date", "day_number", "game_time"];

function expectedTarget(action) {
  if (action.startsWith("conditions.")) return "conditions";
  if (action === "inventory.reject") return "inventory_proposal";
  if (action.startsWith("inventory.")) return "inventory_item";
  if (action.startsWith("report.")) return "situation_report";
  if (action.startsWith("map.")) return "map_publication";
  return "campaign";
}

function targetLabel(database, campaignId, input) {
  if (input.targetType === "inventory_item") {
    const row = database.prepare("SELECT item_json FROM inventory_items WHERE id = ? AND campaign_id = ?").get(input.targetId, campaignId);
    if (row) return JSON.parse(row.item_json).name;
  }
  if (input.characterId) {
    const seat = database.prepare("SELECT display_label FROM player_seats WHERE campaign_id = ? AND character_id = ?").get(campaignId, input.characterId);
    if (seat) return seat.display_label;
  }
  return database.prepare("SELECT name FROM campaigns WHERE runtime_id = ?").get(campaignId).name;
}

function appendAuditEvent(database, accountId, campaignId, input) {
  if (!database.isTransaction) throw new Error("Audit events must be stored inside the mutation transaction.");
  const actor = database.prepare(`SELECT accounts.login_identifier, campaigns.revision FROM campaigns
    JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    JOIN accounts ON accounts.id = campaign_memberships.account_id
    WHERE campaigns.runtime_id = ? AND accounts.id = ? AND accounts.global_role = 'gm'
      AND accounts.disabled = 0 AND campaign_memberships.role = 'gm'`).get(campaignId, accountId);
  if (!actor) throw new Error("Audit GM owner not found.");
  if (!actions.has(input.action) || input.targetType !== expectedTarget(input.action) || typeof input.targetId !== "string" || !input.targetId
    || !Number.isSafeInteger(actor.revision) || actor.revision < 1) throw new Error("Invalid audit event.");
  const before = input.campaignRevisionBefore ?? actor.revision - 1;
  if (!Number.isSafeInteger(before) || before < 0 || before >= actor.revision) throw new Error("Invalid audit campaign revisions.");
  if (database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE campaign_id = ?").get(campaignId).count >= 100000) throw new Error("Campaign audit limit reached.");
  const clock = database.prepare("SELECT game_date, game_time, day_number FROM runtime_dashboard_state WHERE campaign_id = ?").get(campaignId);
  database.prepare(`INSERT INTO audit_events
    (id, campaign_id, actor_account_id, actor_label, action, target_type, target_id, target_label, character_id, related_id,
      before_revision, after_revision, campaign_revision_before, campaign_revision_after, created_at, game_date, day_number, game_time, origin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live')`).run(
    randomUUID(), campaignId, accountId, actor.login_identifier, input.action, input.targetType, input.targetId,
    targetLabel(database, campaignId, input).slice(0, 160), input.characterId ?? null, input.relatedId ?? null,
    input.beforeRevision ?? null, input.afterRevision ?? null, before, actor.revision, new Date().toISOString(), clock?.game_date ?? null, clock?.day_number ?? null, clock?.game_time ?? null);
}

function listAuditEvents(database, accountId, campaignId, options = {}) {
  const owner = database.prepare(`SELECT 1 FROM campaigns JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.runtime_id
    WHERE campaigns.runtime_id = ? AND campaigns.active = 1 AND campaign_memberships.account_id = ? AND campaign_memberships.role = 'gm'`).get(campaignId, accountId);
  if (!owner) return null;
  const limit = options.limit ?? 50; const before = options.before ?? null;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (before !== null && (!Number.isSafeInteger(before) || before < 1))) throw new Error("Invalid audit pagination.");
  const rows = database.prepare("SELECT * FROM audit_events WHERE campaign_id = ? AND (? IS NULL OR sequence < ?) ORDER BY sequence DESC LIMIT ?")
    .all(campaignId, before, before, limit + 1);
  const events = rows.slice(0, limit).map((row) => ({ sequence: row.sequence, id: row.id,
    actor: { id: row.actor_account_id, label: row.actor_label }, action: row.action,
    target: { type: row.target_type, id: row.target_id, label: row.target_label, characterId: row.character_id, relatedId: row.related_id },
    revision: { before: row.before_revision, after: row.after_revision },
    campaignRevision: { before: row.campaign_revision_before, after: row.campaign_revision_after },
    recordedAt: row.created_at, gameTime: row.game_date === null ? null : { gameDate: row.game_date, dayNumber: row.day_number, ...(row.game_time ? { timeOfDay: row.game_time } : {}) }, origin: row.origin }));
  return { events, nextBefore: rows.length > limit ? events.at(-1).sequence : null };
}

function validateAuditBackup(data) {
  const ids = new Set(); const sequences = new Set();
  const text = (value, maximum) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
  const optionalId = (value) => value === null || text(value, 120);
  const optionalRevision = (value) => value === null || (Number.isSafeInteger(value) && value >= 0);
  for (const row of data.auditEvents) {
    if (!row || Object.keys(row).length !== auditColumns.length + 2
      || Object.keys(row).some((key) => ![...auditColumns, "sequence", "origin"].includes(key))
      || !text(row.id, 120) || ids.has(row.id) || !Number.isSafeInteger(row.sequence) || row.sequence < 1 || sequences.has(row.sequence)
      || !text(row.actor_account_id, 120) || !text(row.actor_label, 80) || !text(row.target_id, 120) || !text(row.target_label, 160)
      || !actions.has(row.action) || !targetTypes.has(row.target_type) || row.target_type !== expectedTarget(row.action)
      || !optionalId(row.character_id) || !optionalId(row.related_id)
      || !optionalRevision(row.before_revision) || !optionalRevision(row.after_revision)
      || (row.before_revision !== null && (row.after_revision === null || row.after_revision <= row.before_revision))
      || !Number.isSafeInteger(row.campaign_revision_before) || row.campaign_revision_before < 0
      || !Number.isSafeInteger(row.campaign_revision_after) || row.campaign_revision_after <= row.campaign_revision_before
      || row.campaign_revision_after > data.campaign.revision
      || typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at)) || !["live", "backup"].includes(row.origin)) throw new Error("Invalid audit event in runtime backup.");
    if (row.game_time !== null && (!require("../campaign-clock.js").validTime(row.game_time) || row.game_date === null)) throw new Error("Invalid audit time of day.");
    if (row.game_date === null ? row.day_number !== null
      : typeof row.game_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.game_date)
        || !Number.isSafeInteger(row.day_number) || row.day_number < 0
        || new Date(`${row.game_date}T00:00:00Z`).toISOString().slice(0, 10) !== row.game_date) throw new Error("Invalid audit game time in runtime backup.");
    ids.add(row.id); sequences.add(row.sequence);
  }
}

function mergeAuditBackup(database, campaignId, rows) {
  if (!database.isTransaction) throw new Error("Audit recovery requires the restore transaction.");
  let count = database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE campaign_id = ?").get(campaignId).count;
  const insert = database.prepare(`INSERT INTO audit_events (${auditColumns.join(", ")}, origin)
    VALUES (${auditColumns.map(() => "?").join(", ")}, 'backup')`);
  for (const row of [...rows].sort((first, second) => first.sequence - second.sequence)) {
    const existing = database.prepare("SELECT * FROM audit_events WHERE id = ?").get(row.id);
    if (existing) {
      if (auditColumns.some((column) => existing[column] !== row[column])) throw new Error("Audit backup conflicts with existing history.");
      continue;
    }
    const actor = database.prepare("SELECT global_role FROM accounts WHERE id = ?").get(row.actor_account_id);
    if (actor?.global_role !== "gm") throw new Error("Audit backup references an unavailable GM account.");
    if (row.campaign_id !== campaignId || count >= 99999) throw new Error("Campaign audit limit reached during restore.");
    insert.run(...auditColumns.map((column) => row[column])); count += 1;
  }
}

module.exports = { appendAuditEvent, listAuditEvents, validateAuditBackup, mergeAuditBackup };