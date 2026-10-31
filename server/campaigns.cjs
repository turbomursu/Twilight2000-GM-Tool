const { getAuthenticatedAccount, parseCookies } = require("./auth.cjs");
const { getRuntimeCampaign, importSetupPackage, listRuntimeCampaigns } = require("./runtime-store.cjs");

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
    if (parsed.protocol !== "https:" || parsed.host !== request.headers.host) throw new HttpError(403, "Cross-origin requests are not allowed.");
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

function createCampaignHandler({ database }) {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const url = new URL(request.url, "https://fieldbook.invalid");
    if (request.method === "POST") {
      try {
        enforceSameOrigin(request);
      } catch (error) {
        return sendJson(response, error.status, { error: error.message });
      }
    }
    const account = getAuthenticatedAccount(database, parseCookies(request.headers.cookie)["fieldbook_session"]);
    if (!account) return sendJson(response, 401, { error: "Authentication required." });

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