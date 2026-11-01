const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { openRuntimeDatabase, createPlayerSeed } = require("../server/runtime-store.cjs");

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

test("GM-selected maps exclude hidden records and publish read-only to all four assigned players", async (t) => {
  const { origin, database } = await startTestServer(t);
  const cookie = await bootstrapGM(origin);
  const source = validSetupPackage();
  source.map.locations.push({ ...source.map.locations[0], id: "hidden-location", name: "Hidden base",
    description: "Secret ambush", isStartingLocation: false, mapPosition: { lat: 60.5, lng: 14.5 } });
  const imported = await fetch(`${origin}/api/campaigns/import-setup`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(source) });
  assert.equal(imported.status, 201);
  const { campaign } = await imported.json();
  const gm = database.prepare("SELECT * FROM accounts WHERE login_identifier = 'gm-user'").get();
  const accounts = database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, global_role, created_by_account_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  async function login(username) {
    const response = await fetch(`${origin}/api/auth/login`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  }
  const playerCookies = [];
  for (let seat = 1; seat <= 4; seat += 1) {
    const username = `map-player-${seat}`;
    accounts.run(username, username, gm.password_hash, "player", gm.id, gm.created_at, gm.updated_at);
    createPlayerSeed(database, gm.id, campaign.id, { username, displayLabel: username,
      fields: [{ key: "name", label: "Name", value: `Private character ${seat}`, required: true }] });
    playerCookies.push(await login(username));
  }
  accounts.run("map-outsider", "map-outsider", gm.password_hash, "player", gm.id, gm.created_at, gm.updated_at);
  accounts.run("map-other-gm", "map-other-gm", gm.password_hash, "gm", null, gm.created_at, gm.updated_at);
  const outsiderCookie = await login("map-outsider");
  const otherGMCookie = await login("map-other-gm");
  const gmPath = `${origin}/api/campaigns/${campaign.id}/map-publication`;
  const playerPath = `${origin}/api/player/campaigns/${campaign.id}/map`;
  const readPlayer = async (authCookie = playerCookies[0]) => (await fetch(playerPath, { headers: { Cookie: authCookie } })).json();
  const action = (input, authCookie = cookie, extraHeaders = {}) => fetch(gmPath, { method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: authCookie, ...extraHeaders }, body: JSON.stringify(input) });
  assert.equal((await fetch(playerPath)).status, 401);
  assert.equal((await fetch(gmPath, { headers: { Cookie: playerCookies[0] } })).status, 403);
  assert.equal((await fetch(gmPath, { headers: { Cookie: otherGMCookie } })).status, 404);
  assert.equal((await action({ action: "withdraw", expectedRevision: 0 }, otherGMCookie)).status, 404);
  assert.equal((await fetch(playerPath, { headers: { Cookie: outsiderCookie } })).status, 404);
  assert.equal((await fetch(playerPath, { method: "PUT", headers: { Cookie: playerCookies[0] } })).status, 405);
  assert.equal((await action({ action: "withdraw", expectedRevision: 0 }, cookie, { Origin: "http://untrusted.example" })).status, 403);
  assert.deepEqual(await readPlayer(), { map: null, publishedAt: null });
  assert.equal((await action({ action: "publish", expectedRevision: 0 })).status, 422);
  const draft = { locationIds: ["location-1"], markings: [{ id: "road-notice", label: "Bridge closed <img src=x>", position: { lat: 60.1, lng: 14.1 } }],
    routeLocationIds: ["location-1"], playerPosition: { lat: 60, lng: 14 } };
  for (const invalid of [{ ...draft, gmNotes: "SECRET" }, { ...draft, locationIds: ["foreign-location"] },
    { ...draft, locationIds: ["location-1", "location-1"] }, { ...draft, routeLocationIds: ["hidden-location"] },
    { ...draft, playerPosition: { lat: 70, lng: 14 } },
    { ...draft, markings: [{ ...draft.markings[0], secret: "SECRET" }] }]) {
    assert.equal((await action({ action: "draft", expectedRevision: 0, draft: invalid })).status, 422);
  }
  assert.equal((await action({ action: "draft", expectedRevision: 0, draft })).status, 200);
  const preview = await (await action({ action: "preview", expectedRevision: 1 })).json();
  assert.equal(preview.revision, 1);
  assert.deepEqual(preview.preview.locations.map((location) => location.id), ["location-1"]);
  assert.deepEqual(await readPlayer(), { map: null, publishedAt: null });
  assert.equal((await action({ action: "publish", expectedRevision: 0 })).status, 409);
  assert.equal((await action({ action: "publish", expectedRevision: 1 })).status, 200);
  const published = await readPlayer();
  assert.deepEqual(published.map, preview.preview);
  assert.deepEqual(Object.keys(published.map).sort(), ["bounds", "locations", "markings", "name", "playerPosition", "route", "schemaVersion"]);
  assert.deepEqual(Object.keys(published.map.locations[0]).sort(), ["id", "kind", "name", "position"]);
  assert.doesNotMatch(JSON.stringify(published), /Hidden base|hidden-location|Secret ambush|Status unknown|gm-only|Private character|atlas|terrain|faction|description|setupPackage/);
  for (const authCookie of playerCookies) assert.deepEqual(await readPlayer(authCookie), published);
  assert.equal((await action({ action: "draft", expectedRevision: 2, draft: { ...draft, locationIds: [], routeLocationIds: [], markings: [] } })).status, 200);
  assert.deepEqual(await readPlayer(), published);
  assert.equal((await action({ action: "withdraw", expectedRevision: 2 })).status, 409);
  assert.equal((await action({ action: "withdraw", expectedRevision: 3 })).status, 200);
  for (const authCookie of playerCookies) assert.deepEqual(await readPlayer(authCookie), { map: null, publishedAt: null });
  assert.deepEqual(JSON.parse(database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(campaign.id).source_json), source);
  database.prepare("UPDATE player_seats SET active = 0 WHERE account_id = 'map-player-1'").run();
  assert.equal((await fetch(playerPath, { headers: { Cookie: playerCookies[0] } })).status, 404);
});

test("GM reports preview an allow-listed draft, publish explicitly, and withdraw for assigned players", async (t) => {
  const { origin, database } = await startTestServer(t);
  const cookie = await bootstrapGM(origin);
  const imported = await fetch(`${origin}/api/campaigns/import-setup`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(validSetupPackage())
  });
  const { campaign } = await imported.json();
  const gm = database.prepare("SELECT * FROM accounts WHERE login_identifier = 'gm-user'").get();
  const addAccount = database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, global_role, created_by_account_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  addAccount.run("report-player", "report-player", gm.password_hash, "player", gm.id, gm.created_at, gm.updated_at);
  addAccount.run("report-outsider", "report-outsider", gm.password_hash, "player", gm.id, gm.created_at, gm.updated_at);
  addAccount.run("report-other-gm", "report-other-gm", gm.password_hash, "gm", null, gm.created_at, gm.updated_at);
  createPlayerSeed(database, gm.id, campaign.id, {
    username: "report-player", displayLabel: "Assigned player",
    fields: [{ key: "name", label: "Name", value: "Private character name", required: true }]
  });
  async function login(username) {
    const response = await fetch(`${origin}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password })
    });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  }
  const playerCookie = await login("report-player");
  const outsiderCookie = await login("report-outsider");
  const otherGMCookie = await login("report-other-gm");
  const gmPath = `${origin}/api/campaigns/${campaign.id}/situation-report`;
  const playerPath = `${origin}/api/player/campaigns/${campaign.id}/situation-report`;
  const readPlayer = async () => (await fetch(playerPath, { headers: { Cookie: playerCookie } })).json();
  async function action(input, authCookie = cookie, extraHeaders = {}) {
    return fetch(gmPath, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: authCookie, ...extraHeaders }, body: JSON.stringify(input) });
  }
  assert.equal((await fetch(playerPath)).status, 401);
  assert.equal((await fetch(gmPath)).status, 401);
  assert.equal((await fetch(gmPath, { headers: { Cookie: playerCookie } })).status, 403);
  assert.equal((await fetch(playerPath, { headers: { Cookie: outsiderCookie } })).status, 404);
  assert.equal((await fetch(gmPath, { headers: { Cookie: otherGMCookie } })).status, 404);
  assert.equal((await action({ action: "withdraw", expectedRevision: 0 }, otherGMCookie)).status, 404);
  assert.equal((await action({ action: "publish", expectedRevision: 0 }, playerCookie)).status, 403);
  assert.equal((await fetch(playerPath, { method: "PUT", headers: { Cookie: playerCookie } })).status, 405);
  assert.equal((await action({ action: "withdraw", expectedRevision: 0 }, cookie, { Origin: "http://untrusted.example" })).status, 403);
  assert.deepEqual(await readPlayer(), { report: null, publishedAt: null });
  const draft = { title: "North road", body: "Wait at the bridge. <img src=x onerror=alert(1)>", gameTime: "Day 14 / 08:00" };
  assert.equal((await action({ action: "draft", expectedRevision: 0, draft: { ...draft, gmNotes: "SECRET" } })).status, 422);
  assert.equal((await action({ action: "draft", expectedRevision: 0, draft: { ...draft, body: "x".repeat(12001) } })).status, 422);
  assert.equal((await action({ action: "draft", expectedRevision: 0, draft })).status, 200);
  assert.deepEqual(await readPlayer(), { report: null, publishedAt: null });
  const preview = await action({ action: "preview", expectedRevision: 1 });
  assert.deepEqual(await preview.json(), { preview: draft, revision: 1 });
  assert.deepEqual(await readPlayer(), { report: null, publishedAt: null });
  assert.equal((await action({ action: "publish", expectedRevision: 0 })).status, 409);
  assert.equal((await action({ action: "publish", expectedRevision: 1 })).status, 200);
  const published = await readPlayer();
  assert.deepEqual(published.report, draft);
  assert.equal(typeof published.publishedAt, "string");
  assert.deepEqual(Object.keys(published).sort(), ["publishedAt", "report"]);
  assert.deepEqual(Object.keys(published.report).sort(), ["body", "gameTime", "title"]);
  assert.doesNotMatch(JSON.stringify(published), /Status unknown|gm-only|Private character|scenarioNotes|setupPackage|faction/);
  const changedDraft = { ...draft, body: "SECRET DRAFT not yet published" };
  assert.equal((await action({ action: "draft", expectedRevision: 2, draft: changedDraft })).status, 200);
  assert.deepEqual(await readPlayer(), published);
  assert.equal((await action({ action: "withdraw", expectedRevision: 2 })).status, 409);
  assert.deepEqual(await readPlayer(), published);
  assert.equal((await action({ action: "withdraw", expectedRevision: 3 })).status, 200);
  assert.deepEqual(await readPlayer(), { report: null, publishedAt: null });
  const gmReport = (await (await fetch(gmPath, { headers: { Cookie: cookie } })).json()).report;
  assert.deepEqual(gmReport.draft, changedDraft);
  assert.equal(gmReport.published, null);
  assert.equal(gmReport.revision, 4);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM gm_notes WHERE runtime_campaign_id = ?").get(campaign.id).count, 1);
  database.prepare("UPDATE player_seats SET active = 0 WHERE account_id = ?").run("report-player");
  assert.equal((await fetch(playerPath, { headers: { Cookie: playerCookie } })).status, 404);
});

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
  assert.equal(outsiderList.status, 403);

  const unauthorizedDetail = await fetch(`${origin}/api/campaigns/${encodeURIComponent(campaign.id)}`, {
    headers: { Cookie: outsiderCookie }
  });
  assert.equal(unauthorizedDetail.status, 403);
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

test("faction layer API persists and clears campaign-scoped edits with revision and origin checks", async (t) => {
  const { origin, database } = await startTestServer(t);
  const cookie = await bootstrapGM(origin);
  const importCampaign = async (sourceId) => {
    const setup = validSetupPackage();
    setup.campaign.id = sourceId;
    const response = await fetch(`${origin}/api/campaigns/import-setup`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(setup)
    });
    assert.equal(response.status, 201);
    return (await response.json()).campaign.id;
  };
  const campaignId = await importCampaign("layer-source-one");
  const otherCampaign = await importCampaign("layer-source-two");
  const path = `${origin}/api/campaigns/${campaignId}/faction-layers`;
  const getLayers = async (id) => (await (await fetch(`${origin}/api/campaigns/${id}/faction-layers`, { headers: { Cookie: cookie } })).json()).layers;
  const untouched = await getLayers(otherCampaign);
  assert.equal((await fetch(path)).status, 401);
  const put = (body, headers = {}) => fetch(path, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie, ...headers }, body: JSON.stringify(body)
  });
  assert.equal((await put({ expectedRevision: 0, factionId: "faction-1", cells: [] }, { Origin: "http://untrusted.example" })).status, 403);
  const changed = await put({ expectedRevision: 0, factionId: "faction-1", cells: ["-3,4", "2,5"] });
  assert.equal(changed.status, 200);
  assert.deepEqual((await changed.json()).layers.influence["faction-1"], ["-3,4", "2,5"]);
  assert.equal((await put({ expectedRevision: 0, factionId: "faction-1", cells: [] })).status, 409);
  assert.equal((await put({ expectedRevision: 1, settlementId: "settlement-1", factionIds: [] })).status, 200);
  assert.deepEqual((await getLayers(campaignId)).prominence["settlement-1"], []);
  assert.equal((await put({ expectedRevision: 2, factionId: "outside", cells: [] })).status, 422);
  assert.equal((await put({ expectedRevision: 2, factionId: "faction-1", cells: [] })).status, 200);
  assert.deepEqual((await getLayers(campaignId)).influence["faction-1"], []);
  assert.deepEqual(await getLayers(otherCampaign), untouched);
  const source = JSON.parse(database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(campaignId).source_json);
  assert.deepEqual(source.factions[0].influenceCells, ["1,-2"]);
  assert.deepEqual(source.settlements[0].prominentFactionIds, ["faction-1"]);

  const hash = database.prepare("SELECT password_hash FROM accounts WHERE login_identifier = 'gm-user'").get().password_hash;
  const timestamp = new Date().toISOString();
  database.prepare("INSERT INTO accounts (id, login_identifier, password_hash, created_at, updated_at, global_role) VALUES ('other-owner', 'other-owner', ?, ?, ?, 'gm')").run(hash, timestamp, timestamp);
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "other-owner", password })
  });
  assert.equal(login.status, 200);
  const outsiderCookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(path, { headers: { Cookie: outsiderCookie } })).status, 404);
  assert.equal((await put({ expectedRevision: 3, factionId: "faction-1", cells: [] }, { Cookie: outsiderCookie })).status, 404);
});