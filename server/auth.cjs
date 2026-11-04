const { promisify } = require("node:util");
const { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } = require("node:crypto");

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "fieldbook_session";
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const PASSWORD_HASH_COST = 32768;
const MAX_BODY_BYTES = 16 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function generateTemporaryPassword() {
  return randomBytes(24).toString("base64url");
}

function safeHexEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function initializeBootstrapToken(database, token) {
  const accountCount = database.prepare("SELECT COUNT(*) AS count FROM accounts").get().count;
  if (accountCount > 0) {
    database.prepare("DELETE FROM server_config WHERE key = 'bootstrap_token_sha256'").run();
    return;
  }
  if (typeof token !== "string" || Buffer.byteLength(token, "utf8") < 32 || Buffer.byteLength(token, "utf8") > 256) {
    throw new Error("Set FIELDBOOK_BOOTSTRAP_TOKEN to a random value between 32 and 256 bytes before first startup.");
  }
  database.prepare(`INSERT INTO server_config (key, value) VALUES ('bootstrap_token_sha256', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(sha256(token));
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64, {
    N: PASSWORD_HASH_COST,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${PASSWORD_HASH_COST}$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password, encodedHash) {
  const [, cost, salt, expectedHex] = typeof encodedHash === "string" ? encodedHash.split("$") : [];
  if (cost !== String(PASSWORD_HASH_COST) || !/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(expectedHex || "")) return false;
  const actual = await scryptAsync(password, salt, 64, {
    N: PASSWORD_HASH_COST,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
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
    return { id: row.id, username: row.login_identifier, role: row.global_role, mustChangePassword: Boolean(row.must_change_password) };
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

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 8 || Buffer.byteLength(value, "utf8") > 128) {
    throw new HttpError(400, "Password must be at least 8 characters and at most 128 bytes.");
  }
  return value;
}

function createLoginLimiter() {
  const failures = new Map();
  return {
    isBlocked(key, now) {
      const state = failures.get(key);
      if (!state) return false;
      if (state.windowStartedAt + LOGIN_WINDOW_MS <= now) {
        failures.delete(key);
        return false;
      }
      return state.blockedUntil > now;
    },
    fail(key, now) {
      if (failures.size > 10000) {
        for (const [entryKey, state] of failures) {
          if (state.windowStartedAt + LOGIN_WINDOW_MS <= now) failures.delete(entryKey);
        }
      }
      const state = failures.get(key);
      if (!state || state.windowStartedAt + LOGIN_WINDOW_MS <= now) {
        failures.set(key, { count: 1, windowStartedAt: now, blockedUntil: 0 });
        return;
      }
      state.count += 1;
      if (state.count >= LOGIN_FAILURE_LIMIT) state.blockedUntil = now + LOGIN_WINDOW_MS;
    },
    clear(key) {
      failures.delete(key);
    }
  };
}

function createSession(database, accountId, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_LIFETIME_MS).toISOString();
  database.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256(token), accountId, createdAt, expiresAt);
  return { token, expiresAt };
}

function createAuthHandler({ database, bootstrapToken }) {
  initializeBootstrapToken(database, bootstrapToken);
  const limiter = createLoginLimiter();
  let dummyPasswordHash;

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
        const bootstrapAvailable = Boolean(database.prepare("SELECT value FROM server_config WHERE key = 'bootstrap_token_sha256'").get());
        return sendJson(response, 200, { setupRequired: accountCount === 0 && bootstrapAvailable });
      }

      if (route === "POST /api/auth/bootstrap") {
        const body = await readJsonBody(request);
        const username = normalizeUsername(body.username);
        const password = validatePassword(body.password);
        const tokenHash = database.prepare("SELECT value FROM server_config WHERE key = 'bootstrap_token_sha256'").get()?.value;
        if (!safeHexEqual(tokenHash, sha256(typeof body.bootstrapToken === "string" ? body.bootstrapToken : ""))) {
          throw new HttpError(401, "Bootstrap authorization failed.");
        }
        const passwordHash = await hashPassword(password);
        const accountId = randomUUID();
        database.exec("BEGIN IMMEDIATE");
        try {
          if (database.prepare("SELECT COUNT(*) AS count FROM accounts").get().count !== 0) throw new HttpError(409, "Initial account setup is already complete.");
          const currentTokenHash = database.prepare("SELECT value FROM server_config WHERE key = 'bootstrap_token_sha256'").get()?.value;
          if (!safeHexEqual(currentTokenHash, sha256(body.bootstrapToken))) throw new HttpError(401, "Bootstrap authorization failed.");
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
        const ip = request.socket.remoteAddress || "unknown";
        const now = Date.now();
        if (limiter.isBlocked(ip, now)) throw new HttpError(429, "Too many login attempts. Try again later.");
        const body = await readJsonBody(request);
        if (typeof body.username !== "string" || typeof body.password !== "string") throw new HttpError(401, "Invalid username or password.");
        const username = body.username.toLowerCase();
        const account = database.prepare(`SELECT id, login_identifier, password_hash, disabled, global_role, must_change_password
          FROM accounts WHERE login_identifier = ?`).get(username);
        if (!dummyPasswordHash) dummyPasswordHash = hashPassword(randomBytes(32).toString("hex"));
        const passwordHash = account?.password_hash || await dummyPasswordHash;
        const passwordMatches = await verifyPassword(body.password, passwordHash);
        if (!account || account.disabled || !passwordMatches) {
          limiter.fail(ip, now);
          throw new HttpError(401, "Invalid username or password.");
        }
        limiter.clear(ip);
        database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date(now).toISOString());
        const session = createSession(database, account.id, now);
        setSessionCookie(response, session.token);
        return sendJson(response, 200, {
          authenticated: true,
          homePath: getAccountHomePath(database, account.id),
          mustChangePassword: Boolean(account.must_change_password),
          account: { id: account.id, username: account.login_identifier, role: account.global_role, mustChangePassword: Boolean(account.must_change_password) }
        });
      }

      if (route === "POST /api/auth/change-password") {
        const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
        const account = getAuthenticatedAccount(database, token);
        if (!account) throw new HttpError(401, "Sign in before changing your password.");
        const body = await readJsonBody(request);
        const currentPassword = validatePassword(body.currentPassword);
        const newPassword = validatePassword(body.newPassword);
        const stored = database.prepare("SELECT password_hash FROM accounts WHERE id = ? AND disabled = 0").get(account.id);
        if (!stored || !(await verifyPassword(currentPassword, stored.password_hash))) {
          throw new HttpError(401, "Current password is incorrect.");
        }
        if (currentPassword === newPassword) throw new HttpError(400, "Choose a password different from the temporary password.");
        const passwordHash = await hashPassword(newPassword);
        database.exec("BEGIN IMMEDIATE");
        try {
          const now = new Date().toISOString();
          database.prepare(`UPDATE accounts SET password_hash = ?, must_change_password = 0, updated_at = ?
            WHERE id = ? AND disabled = 0`).run(passwordHash, now, account.id);
          database.prepare("DELETE FROM sessions WHERE account_id = ?").run(account.id);
          const session = createSession(database, account.id);
          database.exec("COMMIT");
          setSessionCookie(response, session.token);
          return sendJson(response, 200, {
            authenticated: true,
            homePath: getAccountHomePath(database, account.id),
            account: { id: account.id, username: account.username, role: account.role, mustChangePassword: false }
          });
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
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

module.exports = { createAuthHandler, getAuthenticatedAccount, getAccountHomePath, parseCookies, hashPassword, generateTemporaryPassword };