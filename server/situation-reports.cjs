const { getRuntimeCampaign, getPlayerCharacter } = require("./runtime-store.cjs");

function projectReport(report) {
  return { title: report.title, body: report.body, gameTime: report.gameTime };
}

function validateDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)
    || Object.keys(draft).some((key) => !["title", "body", "gameTime"].includes(key))) {
    throw new Error("Only title, body, and gameTime may be published.");
  }
  for (const [key, maximum] of [["title", 160], ["body", 12000], ["gameTime", 120]]) {
    if (typeof draft[key] !== "string" || draft[key].length > maximum) throw new Error(`Invalid report ${key}.`);
  }
  return projectReport(draft);
}

function getGMReport(database, accountId, campaignId) {
  const campaign = getRuntimeCampaign(database, accountId, campaignId);
  if (!campaign) return null;
  const row = database.prepare("SELECT * FROM situation_reports WHERE campaign_id = ?").get(campaignId);
  return {
    campaignId, campaignRevision: campaign.revision, revision: row?.revision ?? 0,
    draft: row ? projectReport(JSON.parse(row.draft_json)) : { title: "", body: "", gameTime: "" },
    published: row?.published_json ? projectReport(JSON.parse(row.published_json)) : null,
    publishedAt: row?.published_at ?? null
  };
}

function updateGMReport(database, accountId, campaignId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !["action", "expectedRevision", "draft"].includes(key))
    || !["draft", "preview", "publish", "withdraw"].includes(input.action)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || (input.action !== "draft" && Object.hasOwn(input, "draft"))) throw new Error("Invalid report action or revision.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const report = getGMReport(database, accountId, campaignId);
    if (!report) throw new Error("Runtime campaign not found.");
    if (report.revision !== input.expectedRevision) throw new Error("Report revision changed; reload before retrying.");
    if (input.action === "preview") {
      database.exec("COMMIT");
      return { preview: projectReport(report.draft), revision: report.revision };
    }
    if (input.action === "draft") report.draft = validateDraft(input.draft);
    if (input.action === "publish") {
      if (!report.draft.title.trim() || !report.draft.body.trim()) throw new Error("A title and report body are required to publish.");
      report.published = projectReport(report.draft);
      report.publishedAt = new Date().toISOString();
    }
    if (input.action === "withdraw") {
      report.published = null;
      report.publishedAt = null;
    }
    database.prepare(`INSERT INTO situation_reports (campaign_id, revision, draft_json, published_json, published_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(campaign_id) DO UPDATE SET
      revision = excluded.revision, draft_json = excluded.draft_json,
      published_json = excluded.published_json, published_at = excluded.published_at`).run(
      campaignId, report.revision + 1, JSON.stringify(report.draft),
      report.published ? JSON.stringify(report.published) : null, report.publishedAt);
    database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?")
      .run(new Date().toISOString(), campaignId);
    const result = getGMReport(database, accountId, campaignId);
    database.exec("COMMIT");
    return { report: result };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function getPlayerReport(database, accountId, campaignId) {
  if (!getPlayerCharacter(database, accountId, campaignId)) return null;
  const row = database.prepare("SELECT published_json, published_at FROM situation_reports WHERE campaign_id = ?").get(campaignId);
  return {
    report: row?.published_json ? projectReport(JSON.parse(row.published_json)) : null,
    publishedAt: row?.published_json ? row.published_at : null
  };
}

module.exports = { getGMReport, updateGMReport, getPlayerReport };