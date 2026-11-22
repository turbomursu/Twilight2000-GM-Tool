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

async function startTestServer(t) {
  const database = openRuntimeDatabase();
  const server = http.createServer(createAuthHandler({ database }));
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

test("starts the LAN service over HTTP without any credential configuration", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-http-test-"));
  const server = startServer({
    FIELDBOOK_HOST: "127.0.0.1",
    FIELDBOOK_PORT: "0",
    FIELDBOOK_DB_PATH: join(directory, "runtime.sqlite")
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
    FIELDBOOK_DB_PATH: join(directory, "runtime.sqlite")
  });
  t.after(() => Promise.all(Object.values(servers).map((server) => new Promise((resolve) => server.close(resolve))))
    .then(() => rmSync(directory, { recursive: true, force: true })));
  await Promise.all(Object.values(servers).map((server) => once(server, "listening")));
  const playerOrigin = `http://127.0.0.1:${servers.playerServer.address().port}`;
  const gmOrigin = `http://127.0.0.1:${servers.gmServer.address().port}`;

  const registered = await postJson(`${playerOrigin}/api/auth/register`, { username: "dual-gm", role: "gm" });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get("set-cookie").split(";")[0];
  const session = await fetch(`${gmOrigin}/api/auth/session`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).account.role, "gm");

  const playerPortHome = await fetch(playerOrigin, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(playerPortHome.status, 302);
  assert.equal(new URL(playerPortHome.headers.get("location")).port, new URL(gmOrigin).port);
});

test("creates users by username only, signs in without a password, and logs out", async (t) => {
  const { origin, database } = await startTestServer(t);
  assert.deepEqual(await (await fetch(`${origin}/api/auth/status`)).json(), { setupRequired: true });

  const first = await postJson(`${origin}/api/auth/register`, { username: "GM.User", role: "player" });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.deepEqual(firstBody.account, { id: firstBody.account.id, username: "gm.user", role: "gm" });
  assert.equal(firstBody.homePath, "/index.html");
  assert.deepEqual(await (await fetch(`${origin}/api/auth/status`)).json(), { setupRequired: false });
  assert.equal(database.prepare("SELECT password_hash FROM accounts WHERE id = ?").get(firstBody.account.id).password_hash, "none");
  const registerCookie = first.headers.get("set-cookie");
  assert.match(registerCookie, /HttpOnly/);
  assert.match(registerCookie, /SameSite=Strict/);

  assert.equal((await postJson(`${origin}/api/auth/register`, { username: "gm.user" })).status, 409);
  assert.equal((await postJson(`${origin}/api/auth/register`, { username: "ab" })).status, 400);
  assert.equal((await postJson(`${origin}/api/auth/register`, { username: "valid-name", role: "admin" })).status, 400);

  const player = await postJson(`${origin}/api/auth/register`, { username: "Player.One", role: "player" });
  assert.equal(player.status, 201);
  const playerBody = await player.json();
  assert.equal(playerBody.account.role, "player");
  assert.equal(playerBody.homePath, "/player-interface.html");
  const secondGm = await (await postJson(`${origin}/api/auth/register`, { username: "second-gm", role: "gm" })).json();
  assert.equal(secondGm.account.role, "gm");

  assert.equal((await postJson(`${origin}/api/auth/login`, { username: "nobody" })).status, 401);
  const login = await postJson(`${origin}/api/auth/login`, { username: "GM.USER" });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).account.role, "gm");
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
  assert.equal((await fetch(`${origin}/api/auth/session`, { headers: { Cookie: loginCookie } })).status, 401);
});

test("does not offer password endpoints", async (t) => {
  const { origin } = await startTestServer(t);
  assert.equal((await postJson(`${origin}/api/auth/change-password`, {})).status, 404);
  assert.equal((await postJson(`${origin}/api/auth/bootstrap`, {})).status, 404);
});

test("rejects cross-origin authentication mutations", async (t) => {
  const { origin } = await startTestServer(t);
  const sameOrigin = await postJson(`${origin}/api/auth/login`, { username: "gm-user" }, { Origin: origin });
  assert.equal(sameOrigin.status, 401);
  const response = await postJson(`${origin}/api/auth/login`, { username: "gm-user" }, { Origin: "https://attacker.example" });
  assert.equal(response.status, 403);
});
