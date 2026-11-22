const { createHash, randomBytes, randomUUID } = require("node:crypto");

const SESSION_COOKIE = "fieldbook_session";
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return ["", ""];
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter(([key]) => key));
}

function getAuthenticatedAccount(database, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const tokenHash = sha256(token);
  const row = database.prepare(`SELECT accounts.id, accounts.login_identifier, accounts.global_role,
      accounts.must_change_password, sessions.expires_at
    FROM sessions JOIN accounts ON accounts.id = sessions.account_id
    WHERE sessions.token_hash = ? AND accounts.disabled = 0`).get(tokenHash);
  if (row && row.expires_at > new Date().toISOString()) {
    return { id: row.id, username: row.login_identifier, role: row.global_role, mustChangePassword: false };
  }
  database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  return null;
}

function getAccountHomePath(database, accountId) {
  const role = database.prepare("SELECT global_role FROM accounts WHERE id = ? AND disabled = 0").get(accountId)?.global_role;
  return role === "player" ? "/player-interface.html" : "/index.html";
}

function setSessionCookie(response, token, maxAgeSeconds = SESSION_LIFETIME_MS / 1000) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`);
}

function clearSessionCookie(response) {
  setSessionCookie(response, "", 0);
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Request body must be a JSON object.");
  return body;
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

function normalizeUsername(value) {
  if (typeof value !== "string" || value.length < 3 || value.length > 32 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new HttpError(400, "Username must be 3-32 letters, numbers, dots, underscores, or hyphens.");
  }
  return value.toLowerCase();
}

function createSession(database, accountId, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_LIFETIME_MS).toISOString();
  database.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256(token), accountId, createdAt, expiresAt);
  return { token, expiresAt };
}

function createAuthHandler({ database }) {
  database.prepare("DELETE FROM server_config WHERE key = 'bootstrap_token_sha256'").run();

  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");

    try {
      const url = new URL(request.url, "http://fieldbook.invalid");
      const route = `${request.method} ${url.pathname}`;
      const isMutation = request.method === "POST";
      if (isMutation) enforceSameOrigin(request);

      if (route === "GET /api/auth/status") {
        const accountCount = database.prepare("SELECT COUNT(*) AS count FROM accounts").get().count;
        return sendJson(response, 200, { setupRequired: accountCount === 0 });
      }

      if (route === "POST /api/auth/bootstrap") {
        const body = await readJsonBody(request);
        const username = normalizeUsername(body.username);
        const passwordHash = `unused$${randomBytes(32).toString("hex")}`;
        const accountId = randomUUID();
        database.exec("BEGIN IMMEDIATE");
        try {
          if (database.prepare("SELECT COUNT(*) AS count FROM accounts").get().count !== 0) throw new HttpError(409, "Initial account setup is already complete.");
          const now = new Date().toISOString();
          database.prepare(`INSERT INTO accounts (id, login_identifier, password_hash, created_at, updated_at, global_role)
            VALUES (?, ?, ?, ?, ?, 'gm')`).run(accountId, username, passwordHash, now, now);
          database.prepare("DELETE FROM server_config WHERE key = 'bootstrap_token_sha256'").run();
          const session = createSession(database, accountId);
          database.exec("COMMIT");
          setSessionCookie(response, session.token);
          return sendJson(response, 201, { authenticated: true, homePath: "/index.html", account: { id: accountId, username, role: "gm" } });
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      }

      if (route === "POST /api/auth/login") {
        const now = Date.now();
        const body = await readJsonBody(request);
        if (typeof body.username !== "string") throw new HttpError(401, "Invalid username.");
        const username = body.username.toLowerCase();
        const account = database.prepare(`SELECT id, login_identifier, disabled, global_role
          FROM accounts WHERE login_identifier = ?`).get(username);
        if (!account || account.disabled) {
          throw new HttpError(401, "Invalid username.");
        }
        database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date(now).toISOString());
        const session = createSession(database, account.id, now);
        setSessionCookie(response, session.token);
        return sendJson(response, 200, {
          authenticated: true,
          homePath: getAccountHomePath(database, account.id),
          mustChangePassword: false,
          account: { id: account.id, username: account.login_identifier, role: account.global_role, mustChangePassword: false }
        });
      }

      if (route === "GET /api/auth/session") {
        const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
        const account = getAuthenticatedAccount(database, token);
        if (account) return sendJson(response, 200, { authenticated: true, homePath: getAccountHomePath(database, account.id), mustChangePassword: account.mustChangePassword, account });
        clearSessionCookie(response);
        return sendJson(response, 401, { authenticated: false });
      }

      if (route === "POST /api/auth/logout") {
        const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
        if (token && /^[A-Za-z0-9_-]{40,50}$/.test(token)) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
        clearSessionCookie(response);
        return sendJson(response, 200, { authenticated: false });
      }

      return sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "The request could not be completed.";
      return sendJson(response, status, { error: message });
    }
  };
}

module.exports = { createAuthHandler, getAuthenticatedAccount, getAccountHomePath, parseCookies };