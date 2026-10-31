const { getAuthenticatedAccount, parseCookies } = require("./auth.cjs");
const { createAssignedUser, listAssignedUsers } = require("./runtime-store.cjs");

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
    if (bytes > 8 * 1024) throw new HttpError(413, "Request body is too large.");
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

function createUserHandler({ database }) {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
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

    if (request.method === "GET" && request.url === "/api/users") {
      return sendJson(response, 200, { users: listAssignedUsers(database, account.id) || [] });
    }
    if (request.method === "POST" && request.url === "/api/users") {
      try {
        const body = await readJsonBody(request);
        const user = createAssignedUser(database, account.id, body.username);
        return sendJson(response, 201, { user });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /UNIQUE constraint failed/i.test(error.message) || /already exists/i.test(error.message) ? 409
            : /GM account required/i.test(error.message) ? 403 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    return sendJson(response, request.method === "GET" || request.method === "POST" ? 404 : 405, { error: "Not found." });
  };
}

module.exports = { createUserHandler };