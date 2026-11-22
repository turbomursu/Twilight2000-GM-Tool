const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { openRuntimeDatabase } = require("../server/runtime-store.cjs");

test("username-only setup, login, and GM-created roles", async (context) => {
  const database = openRuntimeDatabase();
  const server = http.createServer(createAppHandler({ database, authHandler: createAuthHandler({ database }) }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(() => { database.close(); resolve(); })));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, cookie) => fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
  const bootstrap = await post("/api/auth/bootstrap", { username: "first-gm" });
  assert.equal(bootstrap.status, 201);
  const gmCookie = bootstrap.headers.get("set-cookie").split(";")[0];
  const playerResponse = await post("/api/users", { username: "player-one" }, gmCookie);
  assert.equal(playerResponse.status, 201);
  const { user: player } = await playerResponse.json();
  assert.equal(player.role, "player");
  database.prepare("UPDATE accounts SET must_change_password = 1 WHERE id = ?").run(player.id);
  const login = await post("/api/auth/login", { username: "PLAYER-ONE" });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).mustChangePassword, false);
  const playerCookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${origin}/api/player/campaigns`, { headers: { Cookie: playerCookie } })).status, 200);
  assert.equal((await post("/api/users", { username: "bad-gm", role: "gm" }, playerCookie)).status, 403);
  const gmResponse = await post("/api/users", { username: "second-gm", role: "gm" }, gmCookie);
  assert.equal(gmResponse.status, 201);
  assert.equal((await gmResponse.json()).user.role, "gm");
  const gmLogin = await post("/api/auth/login", { username: "second-gm" });
  assert.equal((await gmLogin.json()).homePath, "/index.html");
  assert.equal((await post("/api/users", { username: "invalid-role", role: "admin" }, gmCookie)).status, 422);
  assert.equal((await post("/api/auth/login", { username: "missing-user" })).status, 401);
  database.prepare("UPDATE accounts SET disabled = 1 WHERE id = ?").run(player.id);
  assert.equal((await post("/api/auth/login", { username: "player-one" })).status, 401);
  assert.equal((await post(`/api/users/${player.id}/enable`, {}, playerCookie)).status, 401);
  assert.equal((await post(`/api/users/${player.id}/enable`, {}, gmCookie)).status, 200);
  assert.equal((await post("/api/auth/login", { username: "player-one" })).status, 200);
});