const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { openRuntimeDatabase } = require("../server/runtime-store.cjs");

const bootstrapToken = "test-only-bootstrap-token-0123456789-abcdef";
const password = "A-correct-horse-battery-41";

async function startApp(t) {
  const database = openRuntimeDatabase();
  const authHandler = createAuthHandler({ database, bootstrapToken });
  const server = http.createServer(createAppHandler({ database, authHandler }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(() => {
    database.close();
    resolve();
  })));
  return `http://127.0.0.1:${server.address().port}`;
}

async function bootstrap(origin) {
  return fetch(`${origin}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bootstrapToken, username: "gm-user", password })
  });
}

test("redirects anonymous requests to login and serves only public auth assets", async (t) => {
  const origin = await startApp(t);
  const root = await fetch(origin, { redirect: "manual" });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get("location"), "/login.html");

  const protectedPage = await fetch(`${origin}/campaign-setup.html`, { redirect: "manual" });
  assert.equal(protectedPage.status, 302);
  assert.equal(protectedPage.headers.get("location"), "/login.html?next=%2Fcampaign-setup.html");

  const login = await fetch(`${origin}/login.html`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /id="bootstrap-form"/);
  assert.equal((await fetch(`${origin}/login.css`)).status, 200);
  assert.equal((await fetch(`${origin}/login.js`)).status, 200);

  const status = await fetch(`${origin}/api/auth/status`);
  assert.deepEqual(await status.json(), { setupRequired: true });
  assert.equal((await fetch(`${origin}/server/runtime-store.cjs`)).status, 404);
});

test("serves protected pages only for an active session and gates them again after logout", async (t) => {
  const origin = await startApp(t);
  const bootstrapResponse = await bootstrap(origin);
  assert.equal(bootstrapResponse.status, 201);
  const cookie = bootstrapResponse.headers.get("set-cookie").split(";")[0];

  const protectedPage = await fetch(`${origin}/index.html`, { headers: { Cookie: cookie } });
  assert.equal(protectedPage.status, 200);
  assert.match(await protectedPage.text(), /data-auth-logout/);

  const setupPage = await fetch(`${origin}/campaign-setup.html`, { headers: { Cookie: cookie } });
  assert.equal(setupPage.status, 200);
  assert.match(await setupPage.text(), /id="export-package-top"/);

  const playerPage = await fetch(`${origin}/player-interface.html`, { headers: { Cookie: cookie } });
  assert.equal(playerPage.status, 200);
  assert.match(await playerPage.text(), /data-auth-logout/);

  const loginPage = await fetch(`${origin}/login.html`, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(loginPage.status, 302);
  assert.equal(loginPage.headers.get("location"), "/index.html");

  const logout = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: "{}"
  });
  assert.equal(logout.status, 200);
  const blockedAgain = await fetch(`${origin}/index.html`, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(blockedAgain.status, 302);
  assert.equal(blockedAgain.headers.get("location"), "/login.html?next=%2Findex.html");
});