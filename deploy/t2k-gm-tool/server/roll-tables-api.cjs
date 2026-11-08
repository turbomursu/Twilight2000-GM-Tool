const { getAuthenticatedAccount, parseCookies } = require("./auth.cjs");
const { RollTableRevisionConflict, getRollTableCatalog, replaceRollTableCatalog } = require("./roll-tables.cjs");

const MAX_CATALOG_BYTES = 5 * 1024 * 1024;

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
    if (parsed.protocol !== "http:" || parsed.host !== request.headers.host) throw new Error();
  } catch {
    const error = new Error("Cross-origin requests are not allowed.");
    error.status = 403;
    throw error;
  }
}

async function readJsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
    const error = new Error("Content-Type must be application/json.");
    error.status = 415;
    throw error;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_CATALOG_BYTES) {
      const error = new Error("Roll-table JSON must be no larger than 5 MiB.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    const error = new Error("Request body must be a JSON object.");
    error.status = 400;
    throw error;
  }
}

function createRollTablesHandler({ database }) {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const url = new URL(request.url, "http://fieldbook.invalid");
    if (url.pathname !== "/api/roll-tables") return sendJson(response, 404, { error: "Not found." });
    if (request.method === "PUT") {
      try {
        enforceSameOrigin(request);
      } catch (error) {
        return sendJson(response, error.status || 403, { error: error.message });
      }
    }
    const account = getAuthenticatedAccount(database, parseCookies(request.headers.cookie)["fieldbook_session"]);
    if (!account) return sendJson(response, 401, { error: "Authentication required." });
    if (account.role !== "gm") return sendJson(response, 403, { error: "GM access required." });
    if (request.method === "GET") return sendJson(response, 200, getRollTableCatalog(database));
    if (request.method !== "PUT") {
      response.setHeader("Allow", "GET, PUT");
      return sendJson(response, 405, { error: "Method not allowed." });
    }
    try {
      const body = await readJsonBody(request);
      if (Object.keys(body).sort().join(",") !== "catalog,expectedRevision") {
        return sendJson(response, 422, { error: "Import requires only expectedRevision and catalog." });
      }
      return sendJson(response, 200, replaceRollTableCatalog(database, body.expectedRevision, body.catalog));
    } catch (error) {
      const status = error.status || (error instanceof RollTableRevisionConflict ? 409 : 422);
      return sendJson(response, status, { error: error.message });
    }
  };
}

module.exports = { createRollTablesHandler };
