const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { openRuntimeDatabase } = require("../server/runtime-store.cjs");

const bootstrapToken = "test-only-bootstrap-token-0123456789-abcdef";
const password = "A-correct-horse-battery-41";

async function startApp(t, options = {}) {
  const database = openRuntimeDatabase();
  const authHandler = createAuthHandler({ database, bootstrapToken });
  const server = http.createServer(createAppHandler({ database, authHandler, offlineBasemapDir: options.offlineBasemapDir }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(() => {
    database.close();
    resolve();
  })));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return options.includeDatabase ? { origin, database } : origin;
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
  for (const path of ["/project-status.html", "/project-features.html", "/ROADMAP.md", "/FEATURES.md"]) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404);
  }
  const weatherRules = await fetch(`${origin}/weather-rules.js`, { redirect: "manual" });
  assert.equal(weatherRules.status, 302);
  assert.equal(weatherRules.headers.get("location"), "/login.html?next=%2Fweather-rules.js");

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
  const runtimeHtml = await protectedPage.text();
  assert.match(runtimeHtml, /data-auth-logout/);
  assert.doesNotMatch(runtimeHtml, /project-status\.html|project-features\.html|ROADMAP\.md|FEATURES\.md/);
  const playerHtml = readFileSync(join(__dirname, "..", "player-interface.html"), "utf8");
  assert.match(playerHtml, /href="\/vendor\/leaflet\.css"/);
  assert.match(playerHtml, /src="\/vendor\/leaflet\.js"/);
  assert.match(playerHtml, /src="\/vendor\/pmtiles\.js"/);
  assert.doesNotMatch(playerHtml, /unpkg\.com\/leaflet/);
  for (const id of ["map-geometry-type", "map-geometry-label", "add-map-geometry", "map-geometry-coordinates", "map-geometry-entries"]) {
    assert.equal(runtimeHtml.split(`id="${id}"`).length - 1, 1, `${id} must appear once`);
  }
  assert.match(runtimeHtml, /<option value="LineString">Line<\/option><option value="Polygon">Area<\/option>/);

  const setupPage = await fetch(`${origin}/campaign-setup.html`, { headers: { Cookie: cookie } });
  assert.equal(setupPage.status, 200);
  const setupHtml = await setupPage.text();
  assert.match(setupHtml, /id="export-package-top"/);
  assert.equal([...setupHtml.matchAll(/\b(?:let|const)\s+baseMapLayer\s*=/g)].length, 1);
  for (const id of ["map-bound-south", "map-bound-west", "map-bound-north", "map-bound-east", "apply-map-bounds"]) {
    assert.match(setupHtml, new RegExp(`id="${id}"`));
  }
  assert.match(setupHtml, /Bounds must contain all campaign locations/);

  for (const path of ["/project-status.html", "/project-features.html", "/ROADMAP.md", "/FEATURES.md"]) {
    assert.equal((await fetch(`${origin}${path}`, { headers: { Cookie: cookie } })).status, 404);
  }
  const weatherRules = await fetch(`${origin}/weather-rules.js`, { headers: { Cookie: cookie } });
  assert.equal(weatherRules.status, 200);
  assert.match(weatherRules.headers.get("content-type"), /text\/javascript/);
  assert.match(await weatherRules.text(), /Rain\/Snow/);
  for (const [path, contentType] of [["/vendor/leaflet.js", /text\/javascript/], ["/vendor/leaflet.css", /text\/css/], ["/vendor/pmtiles.js", /text\/javascript/]]) {
    const asset = await fetch(`${origin}${path}`, { headers: { Cookie: cookie } });
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), contentType);
  }
  const playerPage = await fetch(`${origin}/player-interface.html`, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(playerPage.status, 302);
  assert.equal(playerPage.headers.get("location"), "/index.html");

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

test("offline PMTiles upload is GM-only and serves authenticated byte ranges", async (t) => {
  const offlineBasemapDir = mkdtempSync(join(tmpdir(), "fieldbook-offline-basemap-"));
  t.after(() => rmSync(offlineBasemapDir, { recursive: true, force: true }));
  const { origin, database } = await startApp(t, { offlineBasemapDir, includeDatabase: true });
  assert.equal((await fetch(`${origin}/api/offline-basemaps`, {
    method: "POST", headers: { "Content-Type": "application/vnd.pmtiles" }, body: Buffer.alloc(128)
  })).status, 401);

  const bootstrapResponse = await bootstrap(origin);
  const gmCookie = bootstrapResponse.headers.get("set-cookie").split(";")[0];
  const gm = database.prepare("SELECT * FROM accounts WHERE login_identifier = 'gm-user'").get();
  database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, global_role, created_by_account_id, created_at, updated_at)
    VALUES (?, ?, ?, 'player', ?, ?, ?)`).run("offline-player", "offline-player", gm.password_hash, gm.id, gm.created_at, gm.updated_at);
  const playerLogin = await fetch(`${origin}/api/auth/login`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "offline-player", password }) });
  const playerCookie = playerLogin.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${origin}/api/offline-basemaps`, {
    method: "POST", headers: { "Content-Type": "application/vnd.pmtiles", Cookie: playerCookie }, body: Buffer.alloc(128)
  })).status, 403);

  const invalid = await fetch(`${origin}/api/offline-basemaps`, {
    method: "POST", headers: { "Content-Type": "application/vnd.pmtiles", Cookie: gmCookie }, body: Buffer.alloc(128)
  });
  assert.equal(invalid.status, 422);

  const archive = Buffer.alloc(256);
  archive.write("PMTiles", 0, "ascii");
  archive[7] = 3;
  for (let index = 127; index < archive.length; index += 1) archive[index] = index % 251;
  const uploaded = await fetch(`${origin}/api/offline-basemaps`, {
    method: "POST", headers: { "Content-Type": "application/vnd.pmtiles", Cookie: gmCookie }, body: archive
  });
  assert.equal(uploaded.status, 201);
  const { asset } = await uploaded.json();
  assert.equal(asset.byteLength, archive.length);
  const path = `${origin}/offline-basemaps/${asset.assetId}.pmtiles`;
  assert.equal((await fetch(path)).status, 401);
  assert.equal((await fetch(path, { headers: { Cookie: playerCookie, Range: "bytes=7-15" } })).status, 404);
  const range = await fetch(path, { headers: { Cookie: gmCookie, Range: "bytes=7-15" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), `bytes 7-15/${archive.length}`);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), archive.subarray(7, 16));
  const whole = await fetch(path, { headers: { Cookie: gmCookie } });
  assert.equal(whole.status, 200);
  assert.deepEqual(Buffer.from(await whole.arrayBuffer()), archive);
  assert.equal((await fetch(`${origin}/offline-basemaps/..%2f..%2fpackage.json.pmtiles`, { headers: { Cookie: gmCookie } })).status, 404);
});