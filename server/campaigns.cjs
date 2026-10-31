const { getAuthenticatedAccount, parseCookies } = require("./auth.cjs");
const { createPlayerSeed, getRuntimeCampaign, importSetupPackage, listCampaignPlayerSeeds, listCharacterChangeRequests, listRuntimeCampaigns, reviewCharacterChangeRequest } = require("./runtime-store.cjs");

const MAX_SETUP_PACKAGE_BYTES = 50 * 1024 * 1024;

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

async function readJsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) throw new HttpError(415, "Content-Type must be application/json.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 32 * 1024) throw new HttpError(413, "Request body is too large.");
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

function createCampaignHandler({ database }) {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const url = new URL(request.url, "http://fieldbook.invalid");
    if (request.method === "POST") {
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