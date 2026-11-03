const { getAuthenticatedAccount, parseCookies, generateTemporaryPassword, hashPassword } = require("./auth.cjs");
const {
  createAssignedUser,
  createPlayerSeedTemplate,
  deletePlayerSeedTemplate,
  listAssignedUsers,
  listPlayerSeedTemplates,
  resetAssignedUserPassword,
  updatePlayerSeedTemplate
} = require("./runtime-store.cjs");

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
    if (bytes > 24 * 1024) throw new HttpError(413, "Request body is too large.");
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
    if (["POST", "PUT", "DELETE"].includes(request.method)) {
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
        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(temporaryPassword);
        const user = createAssignedUser(database, account.id, body.username, { passwordHash });
        return sendJson(response, 201, { user, temporaryPassword });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /UNIQUE constraint failed/i.test(error.message) || /already exists/i.test(error.message) ? 409
            : /GM account required/i.test(error.message) ? 403 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const temporaryPasswordMatch = request.url.match(/^\/api\/users\/([^/]+)\/temporary-password$/);
    if (request.method === "POST" && temporaryPasswordMatch) {
      let userId;
      try {
        userId = decodeURIComponent(temporaryPasswordMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid user ID." });
      }
      try {
        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(temporaryPassword);
        const user = resetAssignedUserPassword(database, account.id, userId, passwordHash);
        return user
          ? sendJson(response, 200, { user, temporaryPassword })
          : sendJson(response, 404, { error: "Player account not found." });
      } catch (error) {
        const status = /GM account required/.test(error.message) ? 403 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    if (request.method === "GET" && request.url === "/api/player-seeds") {
      return sendJson(response, 200, { seeds: listPlayerSeedTemplates(database, account.id) || [] });
    }
    if (request.method === "POST" && request.url === "/api/player-seeds") {
      try {
        const body = await readJsonBody(request);
        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(temporaryPassword);
        const seed = createPlayerSeedTemplate(database, account.id, body, { passwordHash, temporaryPassword });
        const { temporaryPassword: createdPassword, ...publicSeed } = seed;
        return sendJson(response, 201, { seed: publicSeed, temporaryPassword: createdPassword });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /UNIQUE constraint failed/i.test(error.message) || /already has a character template/i.test(error.message) ? 409
            : /GM account required|Choose a player username created by this GM/.test(error.message) ? 403 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const seedMatch = request.url.match(/^\/api\/player-seeds\/([^/]+)$/);
    if (request.method === "PUT" && seedMatch) {
      let templateId;
      try {
        templateId = decodeURIComponent(seedMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid player seed ID." });
      }
      try {
        const body = await readJsonBody(request);
        const seed = updatePlayerSeedTemplate(database, account.id, templateId, body);
        return seed ? sendJson(response, 200, { seed }) : sendJson(response, 404, { error: "Player seed not found." });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : /GM account required/.test(error.message) ? 403 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    if (request.method === "DELETE" && seedMatch) {
      let templateId;
      try {
        templateId = decodeURIComponent(seedMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid player seed ID." });
      }
      try {
        return deletePlayerSeedTemplate(database, account.id, templateId)
          ? sendJson(response, 200, { deleted: true })
          : sendJson(response, 404, { error: "Player seed not found." });
      } catch (error) {
        const status = /GM account required/.test(error.message) ? 403 : /Remove this player/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    return sendJson(response, request.method === "GET" || request.method === "POST" ? 404 : 405, { error: "Not found." });
  };
}

module.exports = { createUserHandler };