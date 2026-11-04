const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, rmSync } = require("node:fs");
const http = require("node:http");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { once } = require("node:events");
const test = require("node:test");
const { createAuthHandler } = require("../server/auth.cjs");
const { startServer } = require("../server/main.cjs");
const { openRuntimeDatabase } = require("../server/runtime-store.cjs");

const bootstrapToken = "test-only-bootstrap-token-0123456789-abcdef";
const password = "A-correct-horse-battery-41";

async function startTestServer(t) {
  const database = openRuntimeDatabase();
  const server = http.createServer(createAuthHandler({ database, bootstrapToken }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(() => {
    database.close();
    resolve();
  })));
  return { origin: `http://127.0.0.1:${server.address().port}`, database };
}

async function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

test("starts the LAN service over HTTP without TLS configuration", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-http-test-"));
  const server = startServer({
    FIELDBOOK_HOST: "127.0.0.1",
    FIELDBOOK_PORT: "0",
    FIELDBOOK_DB_PATH: join(directory, "runtime.sqlite"),
    FIELDBOOK_BOOTSTRAP_TOKEN: bootstrapToken
  });
  t.after(() => new Promise((resolve) => server.close(() => {
    rmSync(directory, { recursive: true, force: true });
    resolve();
  })));
  await once(server, "listening");
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { setupRequired: true });
});

test("starts shared player and GM services on separate ports", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-dual-http-test-"));
  const servers = startServer({
    FIELDBOOK_HOST: "127.0.0.1",
    FIELDBOOK_PLAYER_PORT: "0",
    FIELDBOOK_GM_PORT: "0",
    FIELDBOOK_DB_PATH: join(directory, "runtime.sqlite"),
    FIELDBOOK_BOOTSTRAP_TOKEN: bootstrapToken
  });
  t.after(() => Promise.all(Object.values(servers).map((server) => new Promise((resolve) => server.close(resolve))))
    .then(() => rmSync(directory, { recursive: true, force: true })));
  await Promise.all(Object.values(servers).map((server) => once(server, "listening")));
  const playerOrigin = `http://127.0.0.1:${servers.playerServer.address().port}`;
  const gmOrigin = `http://127.0.0.1:${servers.gmServer.address().port}`;

  const bootstrap = await postJson(`${playerOrigin}/api/auth/bootstrap`, { bootstrapToken, username: "dual-gm", password });
  assert.equal(bootstrap.status, 201);
  const cookie = bootstrap.headers.get("set-cookie").split(";")[0];
  const session = await fetch(`${gmOrigin}/api/auth/session`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).account.role, "gm");

  const playerPortHome = await fetch(playerOrigin, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(playerPortHome.status, 302);
  assert.equal(new URL(playerPortHome.headers.get("location")).port, new URL(gmOrigin).port);
});

test("bootstraps one GM account, authenticates sessions, and logs out", async (t) => {
  const { origin, database } = await startTestServer(t);
  const rejectedBootstrap = await postJson(`${origin}/api/auth/bootstrap`, {
    bootstrapToken: "incorrect-token-that-is-long-enough",
    username: "gm-user",
    password
  });
  assert.equal(rejectedBootstrap.status, 401);

  const bootstrap = await postJson(`${origin}/api/auth/bootstrap`, { bootstrapToken, username: "GM.User", password });
  assert.equal(bootstrap.status, 201);
  const bootstrapBody = await bootstrap.json();
  assert.equal(bootstrapBody.authenticated, true);
  assert.deepEqual(bootstrapBody.account, { id: bootstrapBody.account.id, username: "gm.user", role: "gm" });
  assert.equal(Object.hasOwn(bootstrapBody.account, "password_hash"), false);
  const storedPasswordHash = database.prepare("SELECT password_hash FROM accounts WHERE id = ?").get(bootstrapBody.account.id).password_hash;
  assert.match(storedPasswordHash, /^scrypt\$32768\$/);
  assert.notEqual(storedPasswordHash, password);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM server_config").get().count, 0);

  const bootstrapCookie = bootstrap.headers.get("set-cookie");
  assert.match(bootstrapCookie, /HttpOnly/);
  assert.doesNotMatch(bootstrapCookie, /(?:^|;\s*)Secure(?:;|$)/);
  assert.match(bootstrapCookie, /SameSite=Strict/);

  const repeatedBootstrap = await postJson(`${origin}/api/auth/bootstrap`, { bootstrapToken, username: "other-user", password });
  assert.equal(repeatedBootstrap.status, 401);

  const invalidLogin = await postJson(`${origin}/api/auth/login`, { username: "gm.user", password: "wrong password" });
  assert.equal(invalidLogin.status, 401);
  const suffixedPasswordLogin = await postJson(`${origin}/api/auth/login`, { username: "gm.user", password: `${password}extra` });
  assert.equal(suffixedPasswordLogin.status, 401);

  const login = await postJson(`${origin}/api/auth/login`, { username: "GM.USER", password });
  assert.equal(login.status, 200);
  const loginCookie = login.headers.get("set-cookie").split(";")[0];
  const sessionToken = loginCookie.slice(loginCookie.indexOf("=") + 1);
  const sessionTokenHash = createHash("sha256").update(sessionToken).digest("hex");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?").get(sessionTokenHash).count, 1);

  const session = await fetch(`${origin}/api/auth/session`, { headers: { Cookie: loginCookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).account.username, "gm.user");

  const logout = await postJson(`${origin}/api/auth/logout`, {}, { Cookie: loginCookie });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?").get(sessionTokenHash).count, 0);

  const expiredSession = await fetch(`${origin}/api/auth/session`, { headers: { Cookie: loginCookie } });
  assert.equal(expiredSession.status, 401);
});

test("accepts passwords of eight characters and rejects shorter passwords", async (t) => {
  const { origin } = await startTestServer(t);
  const tooShortBootstrap = await postJson(`${origin}/api/auth/bootstrap`, {
    bootstrapToken, username: "gm-user", password: "shortpw"
  });
  assert.equal(tooShortBootstrap.status, 400);

  const bootstrap = await postJson(`${origin}/api/auth/bootstrap`, {
    bootstrapToken, username: "gm-user", password: "password"
  });
  assert.equal(bootstrap.status, 201);
  const cookie = bootstrap.headers.get("set-cookie").split(";")[0];

  const tooShortChange = await postJson(`${origin}/api/auth/change-password`, {
    currentPassword: "password", newPassword: "shortpw"
  }, { Cookie: cookie });
  assert.equal(tooShortChange.status, 400);

  const change = await postJson(`${origin}/api/auth/change-password`, {
    currentPassword: "password", newPassword: "passw0rd"
  }, { Cookie: cookie });
  assert.equal(change.status, 200);
});

test("rejects cross-origin authentication mutations", async (t) => {
  const { origin } = await startTestServer(t);
  const sameOrigin = await postJson(`${origin}/api/auth/login`, { username: "gm-user", password }, { Origin: origin });
  assert.equal(sameOrigin.status, 401);
  const response = await postJson(`${origin}/api/auth/login`, { username: "gm-user", password }, { Origin: "https://attacker.example" });
  assert.equal(response.status, 403);
});