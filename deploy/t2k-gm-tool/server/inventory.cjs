const { randomUUID } = require("node:crypto");
const { getRuntimeCampaign, getPlayerCharacter } = require("./runtime-store.cjs");
const { appendAuditEvent } = require("./audit.cjs");

function validateItem(item) {
  const keys = ["name", "quantity", "carryLocation", "sourceCategory", "sourceReference", "details"];
  if (!item || typeof item !== "object" || Array.isArray(item)
    || Object.keys(item).length !== keys.length || keys.some((key) => !Object.hasOwn(item, key))) throw new Error("Invalid inventory item fields.");
  if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 100
    || !Number.isSafeInteger(item.quantity) || item.quantity < 0 || item.quantity > 1000000
    || !["combat-gear", "backpack", "tiny-items", "unassigned"].includes(item.carryLocation)
    || !["RB", "GM", "UF"].includes(item.sourceCategory)
    || typeof item.sourceReference !== "string" || item.sourceReference.length > 240
    || typeof item.details !== "string" || item.details.length > 2000) throw new Error("Invalid inventory item values.");
  return { name: item.name.trim(), quantity: item.quantity, carryLocation: item.carryLocation,
    sourceCategory: item.sourceCategory, sourceReference: item.sourceReference.trim(), details: item.details };
}

function projectItem(row) {
  return { id: row.id, revision: row.revision, ...validateItem(JSON.parse(row.item_json)), reviewedAt: row.reviewed_at };
}

function projectProposal(row) {
  return { id: row.id, kind: row.kind, itemId: row.item_id, expectedItemRevision: row.expected_item_revision,
    item: row.proposed_json ? validateItem(JSON.parse(row.proposed_json)) : null, status: row.status,
    submittedAt: row.submitted_at, reviewedAt: row.reviewed_at, reviewNote: row.review_note };
}

function characterInventory(database, campaignId, characterId, submitterAccountId = null) {
  return {
    characterId,
    items: database.prepare("SELECT * FROM inventory_items WHERE campaign_id = ? AND character_id = ? AND active = 1 ORDER BY reviewed_at, id")
      .all(campaignId, characterId).map(projectItem),
    proposals: database.prepare("SELECT * FROM inventory_proposals WHERE campaign_id = ? AND character_id = ? AND (? IS NULL OR submitter_account_id = ?) ORDER BY (status = 'pending') DESC, submitted_at DESC, id DESC LIMIT 100")
      .all(campaignId, characterId, submitterAccountId, submitterAccountId).map(projectProposal)
  };
}

function getPlayerInventory(database, accountId, campaignId) {
  const character = getPlayerCharacter(database, accountId, campaignId);
  return character ? { ...characterInventory(database, campaignId, character.characterId, accountId), displayLabel: character.displayLabel } : null;
}

function getGMInventory(database, accountId, campaignId) {
  const campaign = getRuntimeCampaign(database, accountId, campaignId);
  if (!campaign) return null;
  const characters = database.prepare(`SELECT characters.id, player_seats.display_label FROM characters
    LEFT JOIN player_seats ON player_seats.character_id = characters.id AND player_seats.campaign_id = characters.campaign_id
    WHERE characters.campaign_id = ? ORDER BY player_seats.display_label, characters.id`).all(campaignId);
  return { campaignId, campaignRevision: campaign.revision, characters: characters.map((character) => ({
    ...characterInventory(database, campaignId, character.id), displayLabel: character.display_label || "Unassigned character"
  })) };
}

function touchCampaign(database, campaignId, timestamp) {
  database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?").run(timestamp, campaignId);
}

function createInventoryProposal(database, accountId, campaignId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !["kind", "itemId", "expectedItemRevision", "item"].includes(key))
    || !["add", "update", "remove"].includes(input.kind)) throw new Error("Invalid inventory proposal.");
  if (input.kind === "add" && (Object.hasOwn(input, "itemId") || Object.hasOwn(input, "expectedItemRevision"))) throw new Error("New items cannot target an existing item.");
  if (input.kind === "remove" && Object.hasOwn(input, "item")) throw new Error("Removal proposals cannot edit item data.");
  const item = input.kind === "remove" ? null : validateItem(input.item);
  database.exec("BEGIN IMMEDIATE");
  try {
    const character = getPlayerCharacter(database, accountId, campaignId);
    if (!character) throw new Error("Assigned campaign not found.");
    if (database.prepare("SELECT COUNT(*) AS count FROM inventory_proposals WHERE campaign_id = ?").get(campaignId).count >= 10000
      || database.prepare("SELECT COUNT(*) AS count FROM inventory_proposals WHERE campaign_id = ? AND character_id = ? AND status = 'pending'")
        .get(campaignId, character.characterId).count >= 20) throw new Error("Inventory proposal limit reached.");
    if (input.kind !== "add") {
      const target = database.prepare("SELECT * FROM inventory_items WHERE id = ? AND campaign_id = ? AND character_id = ? AND active = 1")
        .get(typeof input.itemId === "string" ? input.itemId : "", campaignId, character.characterId);
      if (!target) throw new Error("Inventory item not found.");
      if (!Number.isSafeInteger(input.expectedItemRevision) || input.expectedItemRevision !== target.revision) throw new Error("Item revision changed; refresh inventory.");
      if (database.prepare("SELECT 1 FROM inventory_proposals WHERE item_id = ? AND status = 'pending'").get(target.id)) throw new Error("Item already has a pending proposal.");
    }
    const id = randomUUID(); const timestamp = new Date().toISOString();
    database.prepare(`INSERT INTO inventory_proposals
      (id, campaign_id, character_id, submitter_account_id, kind, item_id, expected_item_revision, proposed_json, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(id, campaignId, character.characterId, accountId, input.kind,
      input.itemId ?? null, input.expectedItemRevision ?? null, item ? JSON.stringify(item) : null, timestamp);
    touchCampaign(database, campaignId, timestamp);
    const proposal = projectProposal(database.prepare("SELECT * FROM inventory_proposals WHERE id = ?").get(id));
    database.exec("COMMIT"); return { proposal };
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

function reviewInventoryProposal(database, accountId, campaignId, proposalId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !["decision", "sourceCategory", "sourceReference", "confirmSource", "reviewNote"].includes(key))
    || !["approve", "reject"].includes(input.decision)
    || (input.reviewNote !== undefined && (typeof input.reviewNote !== "string" || input.reviewNote.length > 1000))) throw new Error("Invalid inventory review.");
  database.exec("BEGIN IMMEDIATE");
  try {
    if (!getRuntimeCampaign(database, accountId, campaignId)) throw new Error("Runtime campaign not found.");
    const proposal = database.prepare("SELECT * FROM inventory_proposals WHERE id = ? AND campaign_id = ?").get(proposalId, campaignId);
    if (!proposal) throw new Error("Inventory proposal not found.");
    if (proposal.status !== "pending") throw new Error("Inventory proposal already reviewed.");
    const timestamp = new Date().toISOString();
    const audit = { action: input.decision === "reject" ? "inventory.reject" : `inventory.approve.${proposal.kind}`,
      targetType: input.decision === "reject" ? "inventory_proposal" : "inventory_item", targetId: proposal.id,
      characterId: proposal.character_id, relatedId: input.decision === "approve" ? proposal.id : null };
    if (input.decision === "approve") {
      const seat = database.prepare("SELECT 1 FROM player_seats WHERE campaign_id = ? AND character_id = ? AND account_id = ? AND active = 1")
        .get(campaignId, proposal.character_id, proposal.submitter_account_id);
      if (!seat) throw new Error("Player assignment changed; reject this proposal.");
      let target = null;
      if (proposal.kind !== "add") {
        target = database.prepare("SELECT * FROM inventory_items WHERE id = ? AND campaign_id = ? AND character_id = ? AND active = 1")
          .get(proposal.item_id, campaignId, proposal.character_id);
        if (!target || target.revision !== proposal.expected_item_revision) throw new Error("Item revision changed; reject the stale proposal.");
        Object.assign(audit, { targetId: target.id, beforeRevision: target.revision, afterRevision: target.revision + 1 });
      }
      if (proposal.kind === "remove") {
        database.prepare("UPDATE inventory_items SET active = 0, revision = revision + 1, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
          .run(accountId, timestamp, target.id);
      } else {
        if (input.confirmSource !== true || !["RB", "GM", "UF"].includes(input.sourceCategory)
          || typeof input.sourceReference !== "string" || input.sourceReference.length > 240
          || (input.sourceCategory === "RB" && !input.sourceReference.trim())) throw new Error("Confirm the reviewed source category; RB items require a reference.");
        const item = validateItem({ ...JSON.parse(proposal.proposed_json), sourceCategory: input.sourceCategory, sourceReference: input.sourceReference });
        if (proposal.kind === "add") {
          if (database.prepare("SELECT COUNT(*) AS count FROM inventory_items WHERE campaign_id = ?").get(campaignId).count >= 5000
            || database.prepare("SELECT COUNT(*) AS count FROM inventory_items WHERE campaign_id = ? AND character_id = ? AND active = 1")
              .get(campaignId, proposal.character_id).count >= 200) throw new Error("Inventory item limit reached.");
          const itemId = randomUUID();
          database.prepare("INSERT INTO inventory_items (id, campaign_id, character_id, revision, active, item_json, reviewed_by, reviewed_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?)")
            .run(itemId, campaignId, proposal.character_id, JSON.stringify(item), accountId, timestamp);
          database.prepare("UPDATE inventory_proposals SET item_id = ? WHERE id = ?").run(itemId, proposal.id);
          Object.assign(audit, { targetId: itemId, afterRevision: 0 });
        } else {
          database.prepare("UPDATE inventory_items SET item_json = ?, revision = revision + 1, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
            .run(JSON.stringify(item), accountId, timestamp, target.id);
        }
      }
    }
    database.prepare("UPDATE inventory_proposals SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?")
      .run(input.decision === "approve" ? "approved" : "rejected", accountId, timestamp, input.reviewNote || "", proposal.id);
    touchCampaign(database, campaignId, timestamp);
    const inventory = getGMInventory(database, accountId, campaignId);
    appendAuditEvent(database, accountId, campaignId, audit);
    database.exec("COMMIT"); return { inventory };
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

function manageGMInventory(database, accountId, campaignId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !["kind", "characterId", "itemId", "expectedItemRevision", "item", "confirmSource"].includes(key))
    || !["add", "update", "remove"].includes(input.kind) || typeof input.characterId !== "string") throw new Error("Invalid GM inventory change.");
  if (input.kind === "add" && (Object.hasOwn(input, "itemId") || Object.hasOwn(input, "expectedItemRevision"))) throw new Error("New items cannot target existing records.");
  if (input.kind === "remove" && Object.hasOwn(input, "item")) throw new Error("Removal cannot edit item fields.");
  const item = input.kind === "remove" ? null : validateItem(input.item);
  if (item && (input.confirmSource !== true || (item.sourceCategory === "RB" && !item.sourceReference))) throw new Error("Confirm source review; RB requires a reference.");
  database.exec("BEGIN IMMEDIATE");
  try {
    if (!getRuntimeCampaign(database, accountId, campaignId)) throw new Error("Runtime campaign not found.");
    if (!database.prepare("SELECT 1 FROM characters WHERE id = ? AND campaign_id = ?").get(input.characterId, campaignId)) throw new Error("Inventory character not found.");
    const timestamp = new Date().toISOString();
    const audit = { action: `inventory.${input.kind}`, targetType: "inventory_item", targetId: input.itemId ?? "",
      characterId: input.characterId };
    if (input.kind === "add") {
      if (database.prepare("SELECT COUNT(*) AS count FROM inventory_items WHERE campaign_id = ?").get(campaignId).count >= 5000
        || database.prepare("SELECT COUNT(*) AS count FROM inventory_items WHERE campaign_id = ? AND character_id = ? AND active = 1")
          .get(campaignId, input.characterId).count >= 200) throw new Error("Inventory item limit reached.");
      const itemId = randomUUID();
      database.prepare("INSERT INTO inventory_items (id, campaign_id, character_id, revision, active, item_json, reviewed_by, reviewed_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?)")
        .run(itemId, campaignId, input.characterId, JSON.stringify(item), accountId, timestamp);
      Object.assign(audit, { targetId: itemId, afterRevision: 0 });
    } else {
      const target = database.prepare("SELECT * FROM inventory_items WHERE id = ? AND campaign_id = ? AND character_id = ? AND active = 1")
        .get(typeof input.itemId === "string" ? input.itemId : "", campaignId, input.characterId);
      if (!target) throw new Error("Inventory item not found.");
      if (!Number.isSafeInteger(input.expectedItemRevision) || input.expectedItemRevision !== target.revision) throw new Error("Item revision changed; refresh inventory.");
      Object.assign(audit, { targetId: target.id, beforeRevision: target.revision, afterRevision: target.revision + 1 });
      database.prepare("UPDATE inventory_items SET item_json = ?, active = ?, revision = revision + 1, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
        .run(item ? JSON.stringify(item) : target.item_json, input.kind === "remove" ? 0 : 1, accountId, timestamp, target.id);
    }
    touchCampaign(database, campaignId, timestamp);
    const inventory = getGMInventory(database, accountId, campaignId);
    appendAuditEvent(database, accountId, campaignId, audit);
    database.exec("COMMIT"); return { inventory };
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

function validateInventoryBackup(data) {
  const fail = () => { throw new Error("Invalid inventory data or ownership in runtime backup."); };
  const characters = new Set(data.characters.map((character) => character.id));
  const memberships = new Map(data.campaignMemberships.map((member) => [member.account_id, member.role]));
  const items = new Map(); const activeCounts = new Map(); const proposalIds = new Set(); const pending = new Set();
  const date = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  const id = (value) => typeof value === "string" && value.length > 0 && value.length <= 120;
  for (const item of data.inventoryItems) {
    if (!id(item.id) || items.has(item.id) || !characters.has(item.character_id)
      || !Number.isSafeInteger(item.revision) || item.revision < 0 || ![0, 1].includes(item.active)
      || memberships.get(item.reviewed_by) !== "gm" || !date(item.reviewed_at)) fail();
    let value; try { value = validateItem(JSON.parse(item.item_json)); } catch { fail(); }
    if (typeof item.item_json !== "string" || (value.sourceCategory === "RB" && !value.sourceReference)) fail();
    items.set(item.id, item);
    if (item.active) activeCounts.set(item.character_id, (activeCounts.get(item.character_id) || 0) + 1);
  }
  if ([...activeCounts.values()].some((count) => count > 200)) fail();
  const pendingCounts = new Map();
  for (const proposal of data.inventoryProposals) {
    if (!id(proposal.id) || proposalIds.has(proposal.id) || !characters.has(proposal.character_id)
      || memberships.get(proposal.submitter_account_id) !== "player"
      || !data.playerSeats.some((seat) => seat.character_id === proposal.character_id && seat.account_id === proposal.submitter_account_id)
      || !["add", "update", "remove"].includes(proposal.kind) || !["pending", "approved", "rejected"].includes(proposal.status)
      || !date(proposal.submitted_at) || typeof proposal.review_note !== "string" || proposal.review_note.length > 1000) fail();
    if (proposal.status === "pending") {
      if (proposal.reviewed_by !== null || proposal.reviewed_at !== null) fail();
      pendingCounts.set(proposal.character_id, (pendingCounts.get(proposal.character_id) || 0) + 1);
    } else if (memberships.get(proposal.reviewed_by) !== "gm" || !date(proposal.reviewed_at)) fail();
    if (proposal.kind === "add") {
      if (proposal.expected_item_revision !== null
        || (proposal.status !== "approved" && proposal.item_id !== null)
        || (proposal.status === "approved" && !proposal.item_id)) fail();
    } else if (!proposal.item_id || !Number.isSafeInteger(proposal.expected_item_revision) || proposal.expected_item_revision < 0) fail();
    if (proposal.item_id) {
      const item = items.get(proposal.item_id);
      if (!item || item.character_id !== proposal.character_id) fail();
      if (proposal.kind !== "add" && proposal.expected_item_revision > item.revision) fail();
      if (proposal.status === "pending") { if (pending.has(proposal.item_id)) fail(); pending.add(proposal.item_id); }
    }
    if (proposal.kind === "remove") { if (proposal.proposed_json !== null) fail(); }
    else { try { if (typeof proposal.proposed_json !== "string") fail(); validateItem(JSON.parse(proposal.proposed_json)); } catch { fail(); } }
    proposalIds.add(proposal.id);
  }
  if ([...pendingCounts.values()].some((count) => count > 20)) fail();
}

module.exports = { validateItem, getPlayerInventory, getGMInventory, createInventoryProposal, reviewInventoryProposal, manageGMInventory, validateInventoryBackup };