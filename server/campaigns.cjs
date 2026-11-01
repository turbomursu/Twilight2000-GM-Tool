const { getAuthenticatedAccount, parseCookies } = require("./auth.cjs");
const { createPlayerSeed, exportRuntimeSave, getRuntimeCampaign, getRuntimeDashboard, importSetupPackage, listCampaignPlayerSeeds, listCharacterChangeRequests, listRuntimeCampaigns, restoreRuntimeSave, reviewCharacterChangeRequest, updateRuntimeDashboard } = require("./runtime-store.cjs");

const MAX_SETUP_PACKAGE_BYTES = 50 * 1024 * 1024;
const MAX_RUNTIME_BACKUP_BYTES = 100 * 1024 * 1024;
const { getRuntimeFactionLayers, updateRuntimeFactionLayers } = require("./runtime-store.cjs");
const { getGMReport, updateGMReport } = require("./situation-reports.cjs");
const { getGMMap, updateGMMap } = require("./map-publications.cjs");
const { listComms, sendComms } = require("./comms.cjs");
const { getGMInventory, reviewInventoryProposal, manageGMInventory } = require("./inventory.cjs");
const { getGMConditions, updateGMConditions } = require("./conditions.cjs");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function enforceSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" || parsed.host !== request.headers.host) throw new HttpError(403, "Cross-origin requests are not allowed.");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, "Cross-origin requests are not allowed.");
  }
}

async function readSetupPackage(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_SETUP_PACKAGE_BYTES) throw new HttpError(413, "Setup packages must be no larger than 50 MiB.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request, maximumBytes = 32 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) throw new HttpError(415, "Content-Type must be application/json.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw new HttpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
}

async function readRuntimeRestoreBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) throw new HttpError(415, "Content-Type must be application/json.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_RUNTIME_BACKUP_BYTES) throw new HttpError(413, "Runtime restore request must be no larger than 100 MiB.");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "Runtime restore body must be a JSON object.");
  }
}

function createCampaignHandler({ database }) {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const url = new URL(request.url, "http://fieldbook.invalid");
    if (request.method === "POST" || request.method === "PUT") {
      try {
        enforceSameOrigin(request);
      } catch (error) {
        return sendJson(response, error.status, { error: error.message });
      }
    }
    const account = getAuthenticatedAccount(database, parseCookies(request.headers.cookie)["fieldbook_session"]);
    if (!account) return sendJson(response, 401, { error: "Authentication required." });
    if (account.role !== "gm") return sendJson(response, 403, { error: "GM access required." });

    if (request.method === "GET" && url.pathname === "/api/campaigns") {
      return sendJson(response, 200, { campaigns: listRuntimeCampaigns(database, account.id) });
    }
    const conditionMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/conditions$/);
    if (conditionMatch) {
      if (!["GET", "PUT"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(conditionMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const result = request.method === "GET" ? { conditions: getGMConditions(database, account.id, campaignId) }
          : updateGMConditions(database, account.id, campaignId, await readJsonBody(request, 64 * 1024));
        return result.conditions ? sendJson(response, 200, result) : sendJson(response, 404, { error: "Runtime campaign not found." });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : /not found/.test(error.message) ? 404
          : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const inventoryMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/inventory(?:\/proposals\/([^/]+)\/review)?$/);
    if (inventoryMatch) {
      if (!(request.method === "GET" && !inventoryMatch[2]) && request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId; let proposalId;
        try { campaignId = decodeURIComponent(inventoryMatch[1]); proposalId = inventoryMatch[2] ? decodeURIComponent(inventoryMatch[2]) : null; }
        catch { throw new HttpError(400, "Invalid inventory ID."); }
        const result = request.method === "GET" ? { inventory: getGMInventory(database, account.id, campaignId) }
          : proposalId ? reviewInventoryProposal(database, account.id, campaignId, proposalId, await readJsonBody(request))
            : manageGMInventory(database, account.id, campaignId, await readJsonBody(request));
        return result.inventory ? sendJson(response, 200, result) : sendJson(response, 404, { error: "Runtime campaign not found." });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : /not found/.test(error.message) ? 404
          : /revision changed|already reviewed|assignment changed|limit reached/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const commsMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/comms$/);
    if (commsMatch) {
      if (!["GET", "POST"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(commsMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const result = request.method === "GET" ? listComms(database, account.id, campaignId, "gm")
          : sendComms(database, account.id, campaignId, "gm", await readJsonBody(request));
        return result ? sendJson(response, request.method === "POST" ? 201 : 200, result)
          : sendJson(response, 404, { error: "Campaign not found." });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : /Campaign not found/.test(error.message) ? 404
          : /archive is full/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const mapMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/map-publication$/);
    if (mapMatch && ["GET", "PUT"].includes(request.method)) {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(mapMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const result = request.method === "GET" ? { map: getGMMap(database, account.id, campaignId) }
          : updateGMMap(database, account.id, campaignId, await readJsonBody(request, 256 * 1024));
        return result.map === null ? sendJson(response, 404, { error: "Runtime campaign not found." }) : sendJson(response, 200, result);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : /Runtime campaign not found/.test(error.message) ? 404
          : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const reportMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/situation-report$/);
    if (reportMatch && ["GET", "PUT"].includes(request.method)) {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(reportMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const result = request.method === "GET"
          ? { report: getGMReport(database, account.id, campaignId) }
          : updateGMReport(database, account.id, campaignId, await readJsonBody(request, 64 * 1024));
        return result.report === null ? sendJson(response, 404, { error: "Runtime campaign not found." })
          : sendJson(response, 200, result);
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Runtime campaign not found/.test(error.message) ? 404
            : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const layerMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/faction-layers$/);
    if (layerMatch && ["GET", "PUT"].includes(request.method)) {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(layerMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const layers = request.method === "GET"
          ? getRuntimeFactionLayers(database, account.id, campaignId)
          : updateRuntimeFactionLayers(database, account.id, campaignId, await readJsonBody(request, 256 * 1024));
        return layers ? sendJson(response, 200, { layers }) : sendJson(response, 404, { error: "Runtime campaign not found." });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Runtime campaign not found/.test(error.message) ? 404
            : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const backupMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/backup$/);
    if (backupMatch && request.method === "GET") {
      let campaignId;
      try {
        campaignId = decodeURIComponent(backupMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      const backup = exportRuntimeSave(database, account.id, campaignId);
      return backup ? sendJson(response, 200, { backup }) : sendJson(response, 404, { error: "Campaign not found." });
    }
    const restoreMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/restore$/);
    if (restoreMatch && request.method === "POST") {
      let campaignId;
      try {
        campaignId = decodeURIComponent(restoreMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      try {
        const body = await readRuntimeRestoreBody(request);
        const result = restoreRuntimeSave(database, account.id, campaignId, body.backup, {
          confirmReplace: body.confirmReplace,
          confirmOlderBackup: body.confirmOlderBackup,
          expectedRevision: body.expectedRevision
        });
        return sendJson(response, 200, { restore: result });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Runtime campaign not found|GM owner|does not preserve the current GM owner/.test(error.message) ? 404
            : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/campaigns/import-setup") {
      try {
        const sourceJson = await readSetupPackage(request);
        const result = importSetupPackage(database, sourceJson, { ownerAccountId: account.id });
        const campaign = getRuntimeCampaign(database, account.id, result.runtimeCampaignId);
        return sendJson(response, 201, { campaign });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : error.code?.startsWith("ERR_SQLITE") ? 500 : 422;
        return sendJson(response, status, { error: status === 500 ? "The campaign could not be stored." : error.message });
      }
    }

    const runtimeMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/runtime$/);
    if (request.method === "GET" && runtimeMatch) {
      let campaignId;
      try {
        campaignId = decodeURIComponent(runtimeMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      const runtime = getRuntimeDashboard(database, account.id, campaignId);
      return runtime
        ? sendJson(response, 200, { runtime })
        : sendJson(response, 404, { error: "Runtime campaign data not found." });
    }
    if (request.method === "PUT" && runtimeMatch) {
      let campaignId;
      try {
        campaignId = decodeURIComponent(runtimeMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      try {
        const updates = await readJsonBody(request);
        const runtime = updateRuntimeDashboard(database, account.id, campaignId, updates);
        return sendJson(response, 200, { runtime });
      } catch (error) {
        const status = /Runtime campaign not found/.test(error.message) ? 404 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    const changeListMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/character-changes$/);
    if (request.method === "GET" && changeListMatch) {
      let campaignId;
      try {
        campaignId = decodeURIComponent(changeListMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      const requests = listCharacterChangeRequests(database, account.id, campaignId);
      return requests ? sendJson(response, 200, { requests }) : sendJson(response, 404, { error: "Campaign not found." });
    }

    const changeReviewMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/character-changes\/([^/]+)\/review$/);
    if (request.method === "POST" && changeReviewMatch) {
      let campaignId;
      let requestId;
      try {
        campaignId = decodeURIComponent(changeReviewMatch[1]);
        requestId = decodeURIComponent(changeReviewMatch[2]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign or request ID." });
      }
      try {
        const body = await readJsonBody(request);
        const result = reviewCharacterChangeRequest(database, account.id, campaignId, requestId, body.decision, body.reviewNote || "");
        return sendJson(response, 200, { request: result });
      } catch (error) {
        const status = /GM ownership|Pending character change request not found/.test(error.message) ? 404 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    const seedMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/player-seeds$/);
    if (seedMatch && ["GET", "POST"].includes(request.method)) {
      let campaignId;
      try {
        campaignId = decodeURIComponent(seedMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      if (request.method === "GET") {
        const seeds = listCampaignPlayerSeeds(database, account.id, campaignId);
        return seeds ? sendJson(response, 200, { seeds }) : sendJson(response, 404, { error: "Campaign not found." });
      }
      try {
        const body = await readJsonBody(request);
        const seed = createPlayerSeed(database, account.id, campaignId, body);
        return sendJson(response, 201, { seed });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : error.code?.startsWith("ERR_SQLITE_CONSTRAINT") || /constraint failed/i.test(error.message) || /already|no more than four|cannot also/.test(error.message) ? 409
            : /GM ownership|Campaign not found/.test(error.message) ? 404 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    const match = url.pathname.match(/^\/api\/campaigns\/([^/]+)$/);
    if (request.method === "GET" && match) {
      let runtimeId;
      try {
        runtimeId = decodeURIComponent(match[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      const campaign = getRuntimeCampaign(database, account.id, runtimeId);
      return campaign
        ? sendJson(response, 200, { campaign })
        : sendJson(response, 404, { error: "Campaign not found." });
    }
    if (url.pathname.startsWith("/api/campaigns/")) return sendJson(response, 405, { error: "Method not allowed." });
    return sendJson(response, 404, { error: "Not found." });
  };
}

module.exports = { createCampaignHandler };