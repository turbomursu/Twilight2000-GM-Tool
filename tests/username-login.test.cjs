const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
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
  assert.equal((await post("/api/users", { username: "anonymous" })).status, 401);
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

function loginHarness({ setupRequired = false, role = "gm" } = {}) {
  class Element {
    constructor() { this.hidden = false; this.disabled = false; this.textContent = ""; this.handlers = {}; this.classList = { toggle() {} }; }
    addEventListener(event, handler) { this.handlers[event] = handler; }
    querySelector() { return this.submitButton; }
  }
  const nodes = new Map([
    ...["#login-form", "#bootstrap-form", "#auth-title", "#auth-description", "#auth-mode-label",
      "#auth-feedback", "#create-user-entry", "#cancel-user-entry", "label[for='login-username']"]
      .map((selector) => [selector, new Element()])
  ]);
  nodes.get("#login-form").submitButton = new Element();
  nodes.get("#bootstrap-form").submitButton = new Element();
  nodes.get("#create-user-entry").hidden = true;
  nodes.get("#cancel-user-entry").hidden = true;
  const requests = [];
  const redirects = [];
  const response = (ok, data) => ({ ok, json: async () => data });
  const fetch = async (path, options) => {
    requests.push({ path, options });
    if (path === "/api/auth/status") return response(true, { setupRequired });
    if (path === "/api/auth/session") return response(false, {});
    if (path === "/api/auth/login") return response(true, { account: { role }, homePath: role === "gm" ? "/index.html" : "/player-interface.html" });
    if (path === "/api/auth/logout") return response(true, {});
    throw new Error(`Unexpected request: ${path}`);
  };
  class FormData { *[Symbol.iterator]() { yield ["username", "test-user"]; } }
  runInNewContext(readFileSync(join(__dirname, "..", "login.js"), "utf8"), {
    document: { querySelector: (selector) => nodes.get(selector) }, fetch, FormData, URLSearchParams,
    location: { search: "", replace: (url) => redirects.push(url) }
  });
  return { nodes, requests, redirects, flush: () => new Promise((resolve) => setImmediate(resolve)) };
}

test("login user creation entry requires GM sign-in and opens existing user management", async () => {
  const h = loginHarness();
  await h.flush();
  const create = h.nodes.get("#create-user-entry");
  assert.equal(create.hidden, false);
  create.handlers.click();
  assert.equal(h.nodes.get("label[for='login-username']").textContent, "GM username");
  assert.equal(h.nodes.get("#cancel-user-entry").hidden, false);
  h.nodes.get("#login-form").handlers.submit({ preventDefault() {} });
  await h.flush();
  assert.equal(h.redirects[0], "/index.html?open=users");
  const dashboard = readFileSync(join(__dirname, "..", "index.html"), "utf8");
  assert.match(dashboard, /searchParams\.get\("open"\) === "users"[\s\S]*?searchParams\.delete\("open"\)[\s\S]*?getElementById\("open-users-dialog"\)\.click\(\)/);

  const player = loginHarness({ role: "player" });
  await player.flush();
  player.nodes.get("#create-user-entry").handlers.click();
  player.nodes.get("#login-form").handlers.submit({ preventDefault() {} });
  await player.flush();
  assert.equal(player.redirects.length, 0);
  assert.equal(player.requests.at(-1).path, "/api/auth/logout");
  assert.match(player.nodes.get("#auth-feedback").textContent, /GM username is required/);
  player.nodes.get("#cancel-user-entry").handlers.click();
  assert.equal(player.nodes.get("#auth-title").textContent, "Sign in");
  player.nodes.get("#login-form").handlers.submit({ preventDefault() {} });
  await player.flush();
  assert.equal(player.redirects[0], "/player-interface.html");
});

test("first-run setup keeps the GM bootstrap flow", async () => {
  const h = loginHarness({ setupRequired: true });
  await h.flush();
  assert.equal(h.nodes.get("#login-form").hidden, true);
  assert.equal(h.nodes.get("#bootstrap-form").hidden, false);
  assert.equal(h.nodes.get("#create-user-entry").hidden, true);
  assert.equal(h.nodes.get("#auth-title").textContent, "Create GM account");
});