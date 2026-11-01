const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { openRuntimeDatabase, createPlayerSeed } = require("../server/runtime-store.cjs");
const { emptyConditions } = require("../server/conditions.cjs");

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

test("GM condition records project only each active player's values and exclude private GM notes", async (t) => {
  const { origin, database } = await startTestServer(t);
  const cookie = await bootstrapGM(origin);
  const imported = await fetch(`${origin}/api/campaigns/import-setup`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(validSetupPackage()) });
  const { campaign } = await imported.json();
  const gm = database.prepare("SELECT * FROM accounts WHERE login_identifier = 'gm-user'").get();
  const addAccount = database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, global_role, created_by_account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  async function login(username) {
    const response = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200); return response.headers.get("set-cookie").split(";")[0];
  }
  const cookies = []; const characterIds = [];
  for (let seat = 1; seat <= 4; seat += 1) {
    const username = `condition-player-${seat}`;
    addAccount.run(username, username, gm.password_hash, "player", gm.id, gm.created_at, gm.updated_at);
    createPlayerSeed(database, gm.id, campaign.id, { username, displayLabel: `Seat ${seat}`,
      fields: [{ key: "private", label: "Private", value: `PRIVATE CHARACTER ${seat}`, required: false }] });
    cookies.push(await login(username));
    characterIds.push(database.prepare("SELECT character_id FROM player_seats WHERE account_id = ?").get(username).character_id);
  }
  addAccount.run("condition-other-gm", "condition-other-gm", gm.password_hash, "gm", null, gm.created_at, gm.updated_at);
  const otherGMCookie = await login("condition-other-gm");
  const gmPath = `${origin}/api/campaigns/${campaign.id}/conditions`;
  const playerPath = `${origin}/api/player/campaigns/${campaign.id}/conditions`;
  const write = (body, authCookie = cookie, headers = {}) => fetch(gmPath, { method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: authCookie, ...headers }, body: JSON.stringify(body) });
  const read = async (authCookie) => (await fetch(playerPath, { headers: { Cookie: authCookie } })).json();
  const value = { ...emptyConditions(), damage: 2, stress: 1, dehydrated: true, notes: "Public note <img src=x>" };
  const update = { characterId: characterIds[0], expectedRevision: 0, conditions: value, gmNotes: "SECRET GM PLAN" };
  assert.equal((await fetch(playerPath)).status, 401);
  assert.equal((await fetch(gmPath, { headers: { Cookie: cookies[0] } })).status, 403);
  assert.equal((await fetch(gmPath, { headers: { Cookie: otherGMCookie } })).status, 404);
  assert.equal((await write(update, otherGMCookie)).status, 404);
  assert.equal((await write(update, cookies[0])).status, 403);
  assert.equal((await fetch(playerPath, { method: "PUT", headers: { Cookie: cookies[0], "Content-Type": "application/json" }, body: JSON.stringify(update) })).status, 405);
  assert.equal((await write(update, cookie, { Origin: "http://untrusted.example" })).status, 403);
  assert.deepEqual(await read(cookies[0]), { record: null });
  for (const conditions of [{ ...value, hitCapacity: 99 }, { ...value, damage: -1 }, { ...value, stress: 1.5 },
    { ...value, starving: "healthy" }, { ...value, notes: "x".repeat(2001) }]) {
    assert.equal((await write({ ...update, conditions })).status, 422);
  }
  assert.equal((await write({ ...update, characterId: "foreign-character" })).status, 404);
  for (let seat = 0; seat < 4; seat += 1) {
    assert.equal((await write({ ...update, characterId: characterIds[seat], conditions: { ...value, damage: seat + 1, notes: `Own-seat note ${seat}` } })).status, 200);
  }
  for (let seat = 0; seat < 4; seat += 1) {
    const response = await read(cookies[seat]);
    assert.equal(response.record.conditions.damage, seat + 1);
    assert.equal(response.record.conditions.notes, `Own-seat note ${seat}`);
    assert.equal(response.record.conditions.starving, null);
    assert.deepEqual(Object.keys(response.record).sort(), ["conditions", "revision", "schemaVersion", "updatedAt"]);
    assert.doesNotMatch(JSON.stringify(response), /SECRET GM|gmNotes|gm_notes|PRIVATE CHARACTER|updated_by|characterId|setupPackage|factions/);
  }
  const gmResult = await (await fetch(gmPath, { headers: { Cookie: cookie } })).json();
  const redirected = await (await fetch(`${playerPath}?characterId=${characterIds[3]}`, { headers: { Cookie: cookies[0] } })).json();
  assert.equal(redirected.record.conditions.damage, 1);
  assert.equal(gmResult.conditions.characters[0].gmNotes, "SECRET GM PLAN");
  assert.equal((await write(update)).status, 409);
  assert.equal((await write({ characterId: characterIds[0], expectedRevision: 1, clear: true })).status, 200);
  assert.deepEqual(await read(cookies[0]), { record: null });
  assert.equal((await write(update)).status, 409);
  assert.equal((await read(cookies[1])).record.conditions.damage, 2);
  database.prepare("UPDATE player_seats SET active = 0 WHERE account_id = 'condition-player-2'").run();
  assert.equal((await fetch(playerPath, { headers: { Cookie: cookies[1] } })).status, 404);
});

test("player inventories isolate four seats and apply item/source/quantity changes only after owning GM approval", async (t) => {
  const { origin, database } = await startTestServer(t);
  const cookie = await bootstrapGM(origin);
  const imported = await fetch(`${origin}/api/campaigns/import-setup`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(validSetupPackage()) });
  const { campaign } = await imported.json();
  const gm = database.prepare("SELECT * FROM accounts WHERE login_identifier = 'gm-user'").get();
  const addAccount = database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, global_role, created_by_account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const cookies = [];
  async function login(username) {
    const response = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200); return response.headers.get("set-cookie").split(";")[0];
  }
  for (let seat = 1; seat <= 4; seat += 1) {
    const username = `inventory-player-${seat}`;
    addAccount.run(username, username, gm.password_hash, "player", gm.id, gm.created_at, gm.updated_at);
    createPlayerSeed(database, gm.id, campaign.id, { username, displayLabel: `Player ${seat}`,
      fields: [{ key: "private", label: "Private", value: "Other private character fields", required: false }] });
    cookies.push(await login(username));
  }
  addAccount.run("inventory-other-gm", "inventory-other-gm", gm.password_hash, "gm", null, gm.created_at, gm.updated_at);
  const otherGMCookie = await login("inventory-other-gm");
  const playerPath = `${origin}/api/player/campaigns/${campaign.id}/inventory`;
  const gmPath = `${origin}/api/campaigns/${campaign.id}/inventory`;
  const read = async (authCookie = cookies[0]) => (await (await fetch(playerPath, { headers: { Cookie: authCookie } })).json()).inventory;
  const post = (path, authCookie, body, headers = {}) => fetch(path, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: authCookie, ...headers }, body: JSON.stringify(body) });
  const propose = (body, authCookie = cookies[0], headers = {}) => post(`${playerPath}/proposals`, authCookie, body, headers);
  const review = (id, body, authCookie = cookie) => post(`${gmPath}/proposals/${id}/review`, authCookie, body);
  const item = { name: "Field ration <img src=x>", quantity: 2, carryLocation: "backpack", sourceCategory: "RB", sourceReference: "Claimed reference", details: "Manual inventory record" };
  assert.equal((await fetch(playerPath)).status, 401);
  assert.equal((await fetch(gmPath, { headers: { Cookie: cookies[0] } })).status, 403);
  assert.equal((await fetch(gmPath, { headers: { Cookie: otherGMCookie } })).status, 404);
  assert.equal((await propose({ kind: "add", item }, cookies[0], { Origin: "http://untrusted.example" })).status, 403);
  assert.equal((await propose({ kind: "add", item })).status, 202);
  const first = (await read()).proposals[0];
  assert.equal((await post(`${playerPath}/proposals`, cookies[1], { kind: "add", item }, { Origin: "http://untrusted.example" })).status, 403);
  assert.equal((await review(first.id, { decision: "approve" }, cookies[0])).status, 403);
  assert.equal((await review(first.id, { decision: "reject" }, otherGMCookie)).status, 404);
  assert.equal((await read()).items.length, 0);
  assert.equal((await review(first.id, { decision: "approve", sourceCategory: "RB", sourceReference: "", confirmSource: true })).status, 422);
  assert.equal((await review(first.id, { decision: "approve", sourceCategory: "UF", sourceReference: "", confirmSource: false })).status, 422);
  assert.equal((await review(first.id, { decision: "approve", sourceCategory: "GM", sourceReference: "GM campaign item", confirmSource: true })).status, 200);
  assert.equal((await review(first.id, { decision: "reject" })).status, 409);
  let inventory = await read(); let accepted = inventory.items[0];
  assert.equal(accepted.quantity, 2); assert.equal(accepted.sourceCategory, "GM");
  assert.equal(accepted.sourceReference, "GM campaign item");
  for (const authCookie of cookies.slice(1)) { const other = await read(authCookie); assert.equal(other.items.length, 0); assert.equal(other.proposals.length, 0); }
  assert.equal((await propose({ kind: "update", itemId: accepted.id, expectedItemRevision: 0, item }, cookies[1])).status, 404);
  assert.equal((await propose({ kind: "add", item, characterId: inventory.characterId })).status, 422);
  assert.equal((await propose({ kind: "add", item: { ...item, quantity: -1 } })).status, 422);
  assert.equal((await propose({ kind: "add", item: { ...item, quantity: 1.5 } })).status, 422);
  assert.equal((await propose({ kind: "add", item: { ...item, weight: 5 } })).status, 422);
  const update = await propose({ kind: "update", itemId: accepted.id, expectedItemRevision: accepted.revision, item: { ...item, quantity: 5 } });
  assert.equal(update.status, 202); const updateId = (await update.json()).proposal.id;
  assert.equal((await read()).items[0].quantity, 2);
  assert.equal((await propose({ kind: "remove", itemId: accepted.id, expectedItemRevision: 0 })).status, 409);
  assert.equal((await review(updateId, { decision: "approve", sourceCategory: "UF", sourceReference: "Unverified campaign claim", confirmSource: true })).status, 200);
  accepted = (await read()).items[0]; assert.equal(accepted.quantity, 5); assert.equal(accepted.revision, 1); assert.equal(accepted.sourceCategory, "UF");
  assert.equal((await propose({ kind: "remove", itemId: accepted.id, expectedItemRevision: 0 })).status, 409);
  const removal = await propose({ kind: "remove", itemId: accepted.id, expectedItemRevision: 1 });
  const removalId = (await removal.json()).proposal.id;
  assert.equal((await read()).items.length, 1);
  assert.equal((await post(gmPath, cookie, { kind: "update", characterId: inventory.characterId, itemId: accepted.id,
    expectedItemRevision: 1, item: { ...item, quantity: 6, sourceCategory: "UF" }, confirmSource: true })).status, 200);
  assert.equal((await review(removalId, { decision: "approve" })).status, 409);
  assert.equal((await review(removalId, { decision: "reject", reviewNote: "Stale after GM correction" })).status, 200);
  const freshRemoval = await propose({ kind: "remove", itemId: accepted.id, expectedItemRevision: 2 });
  const freshRemovalId = (await freshRemoval.json()).proposal.id;
  assert.equal((await review(freshRemovalId, { decision: "approve", reviewNote: "Removed by GM" })).status, 200);
  assert.equal((await read()).items.length, 0);
  const fourth = await read(cookies[3]);
  assert.equal((await post(gmPath, cookie, { kind: "add", characterId: fourth.characterId,
    item: { ...item, sourceReference: "Test-only GM-attested Fourth Edition reference" }, confirmSource: true })).status, 200);
  assert.equal((await read(cookies[3])).items[0].sourceCategory, "RB");
  assert.equal((await read()).items.length, 0);
  assert.equal((await post(gmPath, cookies[0], { kind: "add", characterId: fourth.characterId, item, confirmSource: true })).status, 403);
  assert.equal((await post(gmPath, cookie, { kind: "add", characterId: "foreign-character", item, confirmSource: true })).status, 404);
  const rejected = await propose({ kind: "add", item }); const rejectedId = (await rejected.json()).proposal.id;
  assert.equal((await review(rejectedId, { decision: "reject", reviewNote: "Source not accepted" })).status, 200);
  assert.equal((await read()).items.length, 0);
  assert.doesNotMatch(JSON.stringify(await read()), /reviewed_by|submitter_account_id|Other private character|gm-only|password|setupPackage/);
  database.prepare("UPDATE player_seats SET active = 0 WHERE account_id = 'inventory-player-1'").run();
  assert.equal((await fetch(playerPath, { headers: { Cookie: cookies[0] } })).status, 404);
  assert.equal((await propose({ kind: "add", item })).status, 404);
});

test("COMMS broadcasts single-line messages with server-owned identity and game time to GM and four seats", async (t) => {
  const { origin, database } = await startTestServer(t);
  const cookie = await bootstrapGM(origin);
  const importCampaign = async (source) => (await (await fetch(`${origin}/api/campaigns/import-setup`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(source)
  })).json()).campaign;
  const campaign = await importCampaign(validSetupPackage());
  const otherSource = validSetupPackage(); otherSource.campaign.id = "other-comms-campaign";
  const otherCampaign = await importCampaign(otherSource);
  const gm = database.prepare("SELECT * FROM accounts WHERE login_identifier = 'gm-user'").get();
  const insertAccount = database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, global_role, created_by_account_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  async function login(username) {
    const response = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200); return response.headers.get("set-cookie").split(";")[0];
  }
  const cookies = [];
  for (let seat = 1; seat <= 4; seat += 1) {
    const username = `comms-player-${seat}`;
    insertAccount.run(username, username, gm.password_hash, "player", gm.id, gm.created_at, gm.updated_at);
    createPlayerSeed(database, gm.id, campaign.id, { username, displayLabel: `Seat ${seat}`,
      fields: [{ key: "private", label: "Private field", value: "Private character data", required: false }] });
    cookies.push(await login(username));
  }
  insertAccount.run("comms-other-gm", "comms-other-gm", gm.password_hash, "gm", null, gm.created_at, gm.updated_at);
  const otherGMCookie = await login("comms-other-gm");
  const gmPath = `${origin}/api/campaigns/${campaign.id}/comms`;
  const playerPath = `${origin}/api/player/campaigns/${campaign.id}/comms`;
  const post = (path, authCookie, body, extraHeaders = {}) => fetch(path, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: authCookie, ...extraHeaders }, body: JSON.stringify(body) });
  const read = async (path, authCookie) => (await fetch(path, { headers: { Cookie: authCookie } })).json();
  assert.equal((await fetch(playerPath)).status, 401);
  assert.equal((await fetch(gmPath)).status, 401);
  assert.equal((await fetch(gmPath, { headers: { Cookie: cookies[0] } })).status, 403);
  assert.equal((await fetch(gmPath, { headers: { Cookie: otherGMCookie } })).status, 404);
  assert.equal((await post(gmPath, otherGMCookie, { text: "Foreign message" })).status, 404);
  const foreignPlayerPath = `${origin}/api/player/campaigns/${otherCampaign.id}/comms`;
  assert.equal((await fetch(foreignPlayerPath, { headers: { Cookie: cookies[0] } })).status, 404);
  assert.equal((await post(foreignPlayerPath, cookies[0], { text: "Foreign message" })).status, 404);
  assert.equal((await post(playerPath, cookies[0], { text: "Hello" }, { Origin: "http://untrusted.example" })).status, 403);
  for (const text of ["", "   ", "First\nSecond", "First\rSecond", "First\u2028Second", "First\tSecond", "x".repeat(241)]) {
    assert.equal((await post(playerPath, cookies[0], { text })).status, 422);
  }
  for (const extra of [{ sender: "GM" }, { gameTime: "fake" }, { campaignId: otherCampaign.id }, { recipient: "another-seat" }]) {
    assert.equal((await post(playerPath, cookies[0], { text: "Spoof", ...extra })).status, 422);
  }
  assert.deepEqual(await read(playerPath, cookies[0]), { messages: [], hasEarlier: false });
  const unstamped = await post(playerPath, cookies[0], { text: "Clock not configured" });
  assert.equal(unstamped.status, 201); assert.equal((await unstamped.json()).message.gameTime, null);
  database.prepare(`INSERT INTO runtime_dashboard_state
    (campaign_id, game_date, day_number, distance_km, rations_days, fuel_units, weather, weather_note, active_stop_index, updated_at)
    VALUES (?, '2000-05-11', 14, 0, 0, 0, 'Rain', '', 0, ?)`).run(campaign.id, new Date().toISOString());
  for (let seat = 1; seat <= 4; seat += 1) {
    const response = await post(playerPath, cookies[seat - 1], { text: seat === 1 ? "x".repeat(240) : `Report ${seat} <img src=x>` });
    assert.equal(response.status, 201);
    const { message } = await response.json();
    assert.deepEqual(message.sender, { label: `Seat ${seat}`, role: "player" });
    assert.deepEqual(message.gameTime, { gameDate: "2000-05-11", dayNumber: 14 });
  }
  database.prepare("UPDATE runtime_dashboard_state SET game_date = '2000-05-12', day_number = 15 WHERE campaign_id = ?").run(campaign.id);
  const reply = await post(gmPath, cookie, { text: "  Copy. Hold position.  " });
  assert.equal(reply.status, 201);
  const replyBody = await reply.json();
  assert.deepEqual(replyBody.message.sender, { label: "GM", role: "gm" });
  assert.equal(replyBody.message.text, "Copy. Hold position.");
  assert.deepEqual(replyBody.message.gameTime, { gameDate: "2000-05-12", dayNumber: 15 });
  const received = await read(playerPath, cookies[0]);
  assert.equal(received.messages.length, 6);
  assert.deepEqual(received.messages[1].gameTime, { gameDate: "2000-05-11", dayNumber: 14 });
  for (const authCookie of cookies) assert.deepEqual(await read(playerPath, authCookie), received);
  assert.deepEqual((await read(gmPath, cookie)).messages, received.messages);
  assert.deepEqual((await read(`${origin}/api/campaigns/${otherCampaign.id}/comms`, cookie)).messages, []);
  assert.doesNotMatch(JSON.stringify(received), /sender_account_id|Private character|gm-only|gm-user|setupPackage|login_identifier|password/);
  database.prepare("UPDATE player_seats SET active = 0 WHERE account_id = 'comms-player-1'").run();
  assert.equal((await fetch(playerPath, { headers: { Cookie: cookies[0] } })).status, 404);
  assert.equal((await post(playerPath, cookies[0], { text: "Revoked" })).status, 404);
});

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