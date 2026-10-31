const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { openRuntimeDatabase } = require("../server/runtime-store.cjs");

const bootstrapToken = "test-only-bootstrap-token-0123456789-abcdef";
const password = "A-correct-horse-battery-41";

function validSetupPackage() {
  return {
    packageType: "fieldbook.campaign-setup",
    schemaVersion: 2,
    campaign: { id: "setup-campaign-1", name: "Northbound", setting: "Dalarna", premise: "A column travels north.", era: "2000" },
    map: {
      id: "map-1", name: "Vansbro sector",
      bounds: { south: 59, west: 13, north: 61, east: 15 }, center: { lat: 60, lng: 14 }, zoom: 8,
      fieldPapersAtlas: { id: "atlas-1" }, attribution: "© OpenStreetMap contributors", offlineAnnotations: [],
      grid: { coordinateSystem: "axial-q-r", cellKm: 10, terrainCells: [{ q: 1, r: -2, terrainType: "forest" }] },
      locations: [{ id: "location-1", name: "Vansbro", kind: "Settlement", description: "Starting town", gridRef: "1,-2", coordinates: { q: 1, r: -2 }, mapPosition: { lat: 60, lng: 14 }, visibility: "gm-only", isStartingLocation: true }]
    },
    factions: [{ id: "faction-1", name: "Local Guard", description: "A regional force", color: "#42735a", influenceCells: ["1,-2"] }],
    settlements: [{ id: "settlement-1", locationId: "location-1", name: "Vansbro", prominentFactionIds: ["faction-1"], scale: "Town", populationEstimate: 1200, security: "Uneasy", attitude: "Wary", leadership: "Council", situation: "Short on fuel." }],
    scenarioNotes: [{ id: "note-1", title: "Bridge", body: "Status unknown.", visibility: "gm-only" }]
  };
}

async function startTestServer(t) {
  const database = openRuntimeDatabase();
  const authHandler = createAuthHandler({ database, bootstrapToken });
  const server = http.createServer(createAppHandler({ database, authHandler }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(() => {
    database.close();
    resolve();
  })));
  return { origin: `http://127.0.0.1:${server.address().port}`, database };
}

async function bootstrapGM(origin) {
  const response = await fetch(`${origin}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bootstrapToken, username: "gm-user", password })
  });
  assert.equal(response.status, 201);
  return response.headers.get("set-cookie").split(";")[0];
}

test("requires a session before listing or importing runtime campaigns", async (t) => {
  const { origin } = await startTestServer(t);
  assert.equal((await fetch(`${origin}/api/campaigns`)).status, 401);
  const response = await fetch(`${origin}/api/campaigns/import-setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validSetupPackage())
  });
  assert.equal(response.status, 401);
});

test("imports a setup package for its GM and returns only owned campaigns", async (t) => {
  const { origin, database } = await startTestServer(t);
  const cookie = await bootstrapGM(origin);
  const sourceJson = JSON.stringify(validSetupPackage());
  const imported = await fetch(`${origin}/api/campaigns/import-setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: sourceJson
  });
  assert.equal(imported.status, 201);
  const { campaign } = await imported.json();
  assert.notEqual(campaign.id, campaign.sourceCampaignId);
  assert.equal(campaign.role, "gm");
  assert.equal(campaign.setupPackage.campaign.name, "Northbound");
  assert.equal(campaign.setupPackage.scenarioNotes[0].visibility, "gm-only");
  assert.equal(database.prepare("SELECT role FROM campaign_memberships WHERE campaign_id = ?").get(campaign.id).role, "gm");

  const list = await fetch(`${origin}/api/campaigns`, { headers: { Cookie: cookie } });
  assert.deepEqual((await list.json()).campaigns.map(({ id, name }) => ({ id, name })), [{ id: campaign.id, name: "Northbound" }]);

  const detail = await fetch(`${origin}/api/campaigns/${encodeURIComponent(campaign.id)}`, { headers: { Cookie: cookie } });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).campaign.setupPackage.map.id, "map-1");

  const outsiderId = "unrelated-account";
  const ownerPasswordHash = database.prepare("SELECT password_hash FROM accounts WHERE login_identifier = 'gm-user'").get().password_hash;
  database.prepare(`INSERT INTO accounts (id, login_identifier, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`).run(outsiderId, "other-user", ownerPasswordHash, new Date().toISOString(), new Date().toISOString());
  const outsiderLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "other-user", password })
  });
  assert.equal(outsiderLogin.status, 200);
  const outsiderCookie = outsiderLogin.headers.get("set-cookie").split(";")[0];
  const outsiderList = await fetch(`${origin}/api/campaigns`, { headers: { Cookie: outsiderCookie } });
  assert.deepEqual((await outsiderList.json()).campaigns, []);

  const unauthorizedDetail = await fetch(`${origin}/api/campaigns/${encodeURIComponent(campaign.id)}`, {
    headers: { Cookie: outsiderCookie }
  });
  assert.equal(unauthorizedDetail.status, 404);
});

test("rejects malformed setup packages without creating campaigns", async (t) => {
  const { origin, database } = await startTestServer(t);
  const cookie = await bootstrapGM(origin);
  const invalid = validSetupPackage();
  invalid.schemaVersion = 99;
  const response = await fetch(`${origin}/api/campaigns/import-setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(invalid)
  });
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /schema version 2/);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM campaigns").get().count, 0);
});