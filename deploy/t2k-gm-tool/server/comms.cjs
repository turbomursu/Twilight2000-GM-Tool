const { randomUUID } = require("node:crypto");
const { getRuntimeCampaign, getPlayerCharacter } = require("./runtime-store.cjs");

function validateMessageText(text) {
  if (typeof text !== "string" || !text.trim() || text.length > 240
    || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(text)) throw new Error("Messages must be a single line of 1-240 characters without control characters.");
  return text.trim();
}

function access(database, accountId, campaignId, role) {
  if (role === "gm") {
    const campaign = getRuntimeCampaign(database, accountId, campaignId);
    return campaign ? { label: "GM", revision: campaign.revision } : null;
  }
  if (role === "player") {
    const character = getPlayerCharacter(database, accountId, campaignId);
    return character ? { label: character.displayLabel } : null;
  }
  return null;
}

function projectMessage(row) {
  return { id: row.id, sender: { label: row.sender_label, role: row.sender_role }, text: row.message_text,
    gameTime: row.game_date === null ? null : { gameDate: row.game_date, dayNumber: row.day_number, ...(row.game_time ? { timeOfDay: row.game_time } : {}) }, sentAt: row.created_at };
}

function listComms(database, accountId, campaignId, role) {
  const actor = access(database, accountId, campaignId, role);
  if (!actor) return null;
  const rows = database.prepare(`SELECT id, sender_label, sender_role, message_text, game_date, day_number, created_at
    , game_time FROM comms_messages WHERE campaign_id = ? ORDER BY sort_order DESC LIMIT 201`).all(campaignId);
  return { messages: rows.slice(0, 200).reverse().map(projectMessage), hasEarlier: rows.length > 200,
    ...(role === "gm" ? { campaignRevision: actor.revision } : {}) };
}

function sendComms(database, accountId, campaignId, role, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).length !== 1 || !Object.hasOwn(input, "text")) throw new Error("Only message text may be submitted.");
  const text = validateMessageText(input.text);
  database.exec("BEGIN IMMEDIATE");
  try {
    const actor = access(database, accountId, campaignId, role);
    if (!actor) throw new Error("Campaign not found.");
    const order = database.prepare(`SELECT COUNT(*) AS count, COALESCE(MAX(sort_order), -1) + 1 AS next
      FROM comms_messages WHERE campaign_id = ?`).get(campaignId);
    if (order.count >= 10000) throw new Error("Campaign COMMS archive is full.");
    const clock = database.prepare("SELECT game_date, game_time, day_number FROM runtime_dashboard_state WHERE campaign_id = ?").get(campaignId);
    const row = { id: randomUUID(), sender_label: actor.label, sender_role: role, message_text: text,
      game_date: clock?.game_date ?? null, game_time: clock?.game_time ?? null, day_number: clock?.day_number ?? null, created_at: new Date().toISOString() };
    database.prepare(`INSERT INTO comms_messages
      (id, campaign_id, sender_account_id, sender_role, sender_label, message_text, game_date, game_time, day_number, created_at, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(row.id, campaignId, accountId, role, actor.label, text,
      row.game_date, row.game_time, row.day_number, row.created_at, order.next);
    database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?").run(row.created_at, campaignId);
    database.exec("COMMIT");
    return { message: projectMessage(row), ...(role === "gm" ? { campaignRevision: actor.revision + 1 } : {}) };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { listComms, sendComms, validateMessageText };