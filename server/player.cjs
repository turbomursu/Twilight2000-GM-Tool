const { getAuthenticatedAccount, parseCookies } = require("./auth.cjs");
const { createCharacterChangeRequest, finalizePlayerSeed, getPlayerCharacter, listPlayerCampaigns, updatePlayerSeed } = require("./runtime-store.cjs");
const { getPlayerReport } = require("./situation-reports.cjs");
const { getPlayerMap } = require("./map-publications.cjs");

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

function createPlayerHandler({ database }) {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "POST" || request.method === "PUT") {
      try {
        enforceSameOrigin(request);
      } catch (error) {
        return sendJson(response, error.status, { error: error.message });
      }
    }
    const account = getAuthenticatedAccount(database, parseCookies(request.headers.cookie)["fieldbook_session"]);
    if (!account) return sendJson(response, 401, { error: "Authentication required." });
    if (account.role !== "player") return sendJson(response, 403, { error: "Player account required." });

    if (request.method === "GET" && request.url === "/api/player/campaigns") {
      return sendJson(response, 200, { campaigns: listPlayerCampaigns(database, account.id) });
    }

    const pathname = new URL(request.url, "http://fieldbook.invalid").pathname;
    const mapMatch = pathname.match(/^\/api\/player\/campaigns\/([^/]+)\/map$/);
    if (mapMatch) {
      if (request.method !== "GET") return sendJson(response, 405, { error: "Read-only player map." });
      let campaignId;
      try { campaignId = decodeURIComponent(mapMatch[1]); } catch { return sendJson(response, 400, { error: "Invalid campaign ID." }); }
      const result = getPlayerMap(database, account.id, campaignId);
      return result ? sendJson(response, 200, result) : sendJson(response, 404, { error: "Assigned campaign not found." });
    }
    const reportMatch = pathname.match(/^\/api\/player\/campaigns\/([^/]+)\/situation-report$/);
    if (reportMatch) {
      if (request.method !== "GET") return sendJson(response, 405, { error: "Read-only player report." });
      let campaignId;
      try { campaignId = decodeURIComponent(reportMatch[1]); } catch { return sendJson(response, 400, { error: "Invalid campaign ID." }); }
      const result = getPlayerReport(database, account.id, campaignId);
      return result ? sendJson(response, 200, result) : sendJson(response, 404, { error: "Assigned campaign not found." });
    }
    const match = pathname.match(/^\/api\/player\/campaigns\/([^/]+)\/character(?:\/(finalize))?$/);
    if (!match) return sendJson(response, 404, { error: "Not found." });
    let campaignId;
    try {
      campaignId = decodeURIComponent(match[1]);
    } catch {
      return sendJson(response, 400, { error: "Invalid campaign ID." });
    }

    if (request.method === "GET" && !match[2]) {
      const character = getPlayerCharacter(database, account.id, campaignId);
      return character ? sendJson(response, 200, { character }) : sendJson(response, 404, { error: "Assigned campaign not found." });
    }
    if (request.method === "PUT" && !match[2]) {
      try {
        const body = await readJsonBody(request);
        const character = getPlayerCharacter(database, account.id, campaignId);
        if (!character) return sendJson(response, 404, { error: "Assigned campaign not found." });
        if (character.status === "playable") {
          const changeRequest = createCharacterChangeRequest(database, account.id, campaignId, body.fields);
          return sendJson(response, 202, { changeRequest });
        }
        return sendJson(response, 200, { character: updatePlayerSeed(database, account.id, campaignId, body.fields) });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Assigned campaign not found/.test(error.message) ? 404
            : /already awaiting GM review/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    if (request.method === "POST" && match[2] === "finalize") {
      try {
        return sendJson(response, 200, { character: finalizePlayerSeed(database, account.id, campaignId) });
      } catch (error) {
        return sendJson(response, 422, { error: error.message });
      }
    }
    return sendJson(response, 405, { error: "Method not allowed." });
  };
}

module.exports = { createPlayerHandler };