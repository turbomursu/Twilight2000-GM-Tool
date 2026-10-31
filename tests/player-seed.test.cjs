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
      id: "map-1", name: "Vansbro sector", bounds: { south: 59, west: 13, north: 61, east: 15 },
      center: { lat: 60, lng: 14 }, zoom: 8, fieldPapersAtlas: { id: "atlas-1" }, attribution: "© OpenStreetMap contributors",
      offlineAnnotations: [], grid: { coordinateSystem: "axial-q-r", cellKm: 10, terrainCells: [] },
      locations: [{ id: "location-1", name: "Vansbro", kind: "Settlement", mapPosition: { lat: 60, lng: 14 }, isStartingLocation: true }]
    },
    factions: [], settlements: [], scenarioNotes: []
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

async function postJson(origin, path, body, cookie) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
}

test("player activates, selects assigned campaign, fills only blank seed fields, and finalizes", async (t) => {
  const { origin, database } = await startTestServer(t);
  const gmBootstrap = await postJson(origin, "/api/auth/bootstrap", { bootstrapToken, username: "gm-user", password });
  const gmCookie = gmBootstrap.headers.get("set-cookie").split(";")[0];
  const importResponse = await fetch(`${origin}/api/campaigns/import-setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: gmCookie },
    body: JSON.stringify(validSetupPackage())
  });
  assert.equal(importResponse.status, 201);
  const campaignId = (await importResponse.json()).campaign.id;

  const createdUserResponse = await postJson(origin, "/api/users", { username: "player-one" }, gmCookie);
  assert.equal(createdUserResponse.status, 201);
  const { user } = await createdUserResponse.json();
  assert.equal(user.username, "player-one");
  assert.equal(user.disabled, true);
  assert.equal(typeof user.activationToken, "string");
  assert.equal((await postJson(origin, "/api/users", { username: "player-one" }, gmCookie)).status, 409);
  const users = await fetch(`${origin}/api/users`, { headers: { Cookie: gmCookie } });
  assert.equal((await users.json()).users[0].username, "player-one");

  const unknownUsernameAssignment = await postJson(origin, `/api/campaigns/${campaignId}/player-seeds`, {
    username: "not-created", displayLabel: "Unknown", fields: [{ key: "name", label: "Name", value: "", required: true }]
  }, gmCookie);
  assert.equal(unknownUsernameAssignment.status, 422);

  const assigned = await postJson(origin, `/api/campaigns/${campaignId}/player-seeds`, {
    username: "player-one",
    displayLabel: "Player One",
    fields: [
      { key: "characterName", label: "Character name", value: "", required: true },
      { key: "nationality", label: "Nationality", value: "", required: false },
      { key: "branch", label: "Branch", value: "Infantry", required: false }
    ]
  }, gmCookie);
  assert.equal(assigned.status, 201);
  const { seed } = await assigned.json();
  assert.equal(seed.status, "seed");
  assert.equal(Object.hasOwn(seed, "activationToken"), false);

  const activate = await postJson(origin, "/api/auth/activate", { token: user.activationToken, password });
  assert.equal(activate.status, 201);
  assert.equal((await activate.json()).homePath, "/player-interface.html");
  const playerCookie = activate.headers.get("set-cookie").split(";")[0];
  assert.equal((await postJson(origin, "/api/auth/activate", { token: user.activationToken, password })).status, 401);
  assert.equal((await postJson(origin, "/api/users", { username: "player-two" }, playerCookie)).status, 403);
  assert.equal((await fetch(`${origin}/api/campaigns`, { headers: { Cookie: playerCookie } })).status, 403);
  assert.equal((await fetch(`${origin}/api/campaigns/${campaignId}`, { headers: { Cookie: playerCookie } })).status, 403);
  assert.equal((await fetch(`${origin}/api/campaigns/${campaignId}/player-seeds`, { headers: { Cookie: playerCookie } })).status, 403);

  const playerPage = await fetch(`${origin}/player-interface.html`, { headers: { Cookie: playerCookie } });
  assert.equal(playerPage.status, 200);
  assert.match(await playerPage.text(), /id="player-seed-shell"/);
  assert.equal((await fetch(`${origin}/player-seed-client.js`, { headers: { Cookie: playerCookie } })).status, 200);
  const gmPage = await fetch(`${origin}/index.html`, { headers: { Cookie: playerCookie }, redirect: "manual" });
  assert.equal(gmPage.status, 302);
  assert.equal(gmPage.headers.get("location"), "/player-interface.html");

  const campaigns = await fetch(`${origin}/api/player/campaigns`, { headers: { Cookie: playerCookie } });
  assert.deepEqual((await campaigns.json()).campaigns.map(({ id, status }) => ({ id, status })), [{ id: campaignId, status: "seed" }]);

  const characterResponse = await fetch(`${origin}/api/player/campaigns/${campaignId}/character`, { headers: { Cookie: playerCookie } });
  const character = (await characterResponse.json()).character;
  assert.equal(character.status, "seed");
  assert.equal(character.fields.find(({ key }) => key === "branch").playerEditable, false);

  const presetEdit = await fetch(`${origin}/api/player/campaigns/${campaignId}/character`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: playerCookie },
    body: JSON.stringify({ fields: [{ key: "branch", value: "Artillery" }] })
  });
  assert.equal(presetEdit.status, 422);

  const incompleteFinalize = await postJson(origin, `/api/player/campaigns/${campaignId}/character/finalize`, {}, playerCookie);
  assert.equal(incompleteFinalize.status, 422);

  const update = await fetch(`${origin}/api/player/campaigns/${campaignId}/character`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: playerCookie },
    body: JSON.stringify({ fields: [{ key: "characterName", value: "Asta Holm" }, { key: "nationality", value: "Swedish" }] })
  });
  assert.equal(update.status, 200);
  const updatedCharacter = (await update.json()).character;
  assert.equal(updatedCharacter.fields.find(({ key }) => key === "characterName").value, "Asta Holm");

  const finalized = await postJson(origin, `/api/player/campaigns/${campaignId}/character/finalize`, {}, playerCookie);
  assert.equal(finalized.status, 200);
  assert.equal((await finalized.json()).character.status, "playable");

  const afterFinalize = await fetch(`${origin}/api/player/campaigns/${campaignId}/character`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: playerCookie },
    body: JSON.stringify({ fields: [{ key: "characterName", value: "Changed" }] })
  });
  assert.equal(afterFinalize.status, 202);
  const changeRequest = (await afterFinalize.json()).changeRequest;
  assert.equal(changeRequest.status, "pending");
  assert.equal(changeRequest.fields[0].oldValue, "Asta Holm");

  const unchangedCharacter = await fetch(`${origin}/api/player/campaigns/${campaignId}/character`, { headers: { Cookie: playerCookie } });
  const unchangedRecord = (await unchangedCharacter.json()).character;
  assert.equal(unchangedRecord.fields.find(({ key }) => key === "characterName").value, "Asta Holm");
  assert.equal(unchangedRecord.pendingChangeRequest.id, changeRequest.id);
  const secondPendingRequest = await fetch(`${origin}/api/player/campaigns/${campaignId}/character`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: playerCookie },
    body: JSON.stringify({ fields: [{ key: "nationality", value: "Norwegian" }] })
  });
  assert.equal(secondPendingRequest.status, 409);

  const gmRequests = await fetch(`${origin}/api/campaigns/${campaignId}/character-changes`, { headers: { Cookie: gmCookie } });
  assert.equal((await gmRequests.json()).requests[0].id, changeRequest.id);
  const approve = await postJson(origin, `/api/campaigns/${campaignId}/character-changes/${changeRequest.id}/review`, {
    decision: "approved", reviewNote: "Confirmed with the player."
  }, gmCookie);
  assert.equal(approve.status, 200);
  const approvedCharacter = await fetch(`${origin}/api/player/campaigns/${campaignId}/character`, { headers: { Cookie: playerCookie } });
  assert.equal((await approvedCharacter.json()).character.fields.find(({ key }) => key === "characterName").value, "Changed");

  const rejectedProposal = await fetch(`${origin}/api/player/campaigns/${campaignId}/character`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: playerCookie },
    body: JSON.stringify({ fields: [{ key: "characterName", value: "Rejected Name" }] })
  });
  assert.equal(rejectedProposal.status, 202);
  const rejectedRequest = (await rejectedProposal.json()).changeRequest;
  const reject = await postJson(origin, `/api/campaigns/${campaignId}/character-changes/${rejectedRequest.id}/review`, {
    decision: "rejected", reviewNote: "Keep the current name."
  }, gmCookie);
  assert.equal(reject.status, 200);
  const rejectedCharacter = await fetch(`${origin}/api/player/campaigns/${campaignId}/character`, { headers: { Cookie: playerCookie } });
  assert.equal((await rejectedCharacter.json()).character.fields.find(({ key }) => key === "characterName").value, "Changed");

  const duplicateAssignment = await postJson(origin, `/api/campaigns/${campaignId}/player-seeds`, {
    username: "player-one", displayLabel: "Another seed", fields: [{ key: "characterName", label: "Character name", value: "", required: true }]
  }, gmCookie);
  assert.equal(duplicateAssignment.status, 409);

  for (let seatNumber = 2; seatNumber <= 4; seatNumber += 1) {
    const newUser = await postJson(origin, "/api/users", { username: `player-${seatNumber}` }, gmCookie);
    assert.equal(newUser.status, 201);
    const additionalSeat = await postJson(origin, `/api/campaigns/${campaignId}/player-seeds`, {
      username: `player-${seatNumber}`, displayLabel: `Player ${seatNumber}`,
      fields: [{ key: "characterName", label: "Character name", value: "", required: true }]
    }, gmCookie);
    assert.equal(additionalSeat.status, 201);
  }
  assert.equal((await postJson(origin, "/api/users", { username: "player-five" }, gmCookie)).status, 201);
  const fifthSeat = await postJson(origin, `/api/campaigns/${campaignId}/player-seeds`, {
    username: "player-five", displayLabel: "Player Five",
    fields: [{ key: "characterName", label: "Character name", value: "", required: true }]
  }, gmCookie);
  assert.equal(fifthSeat.status, 409);

  const gmSeeds = await fetch(`${origin}/api/campaigns/${campaignId}/player-seeds`, { headers: { Cookie: gmCookie } });
  assert.equal((await gmSeeds.json()).seeds.length, 4);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM player_seats WHERE campaign_id = ? AND account_id = ?").get(campaignId, seed.accountId).count, 1);
});

test("a player cannot access another player's campaign seed", async (t) => {
  const { origin } = await startTestServer(t);
  const response = await fetch(`${origin}/api/player/campaigns/not-assigned/character`);
  assert.equal(response.status, 401);
});

test("a GM-created user can sign in before assignment but cannot open GM surfaces", async (t) => {
  const { origin } = await startTestServer(t);
  const gmBootstrap = await postJson(origin, "/api/auth/bootstrap", { bootstrapToken, username: "gm-user", password });
  const gmCookie = gmBootstrap.headers.get("set-cookie").split(";")[0];
  const created = await postJson(origin, "/api/users", { username: "waiting-player" }, gmCookie);
  const { activationToken } = (await created.json()).user;
  const activated = await postJson(origin, "/api/auth/activate", { token: activationToken, password });
  assert.equal(activated.status, 201);
  const playerCookie = activated.headers.get("set-cookie").split(";")[0];

  const playerPage = await fetch(`${origin}/player-interface.html`, { headers: { Cookie: playerCookie } });
  assert.equal(playerPage.status, 200);
  const campaigns = await fetch(`${origin}/api/player/campaigns`, { headers: { Cookie: playerCookie } });
  assert.deepEqual((await campaigns.json()).campaigns, []);
  const gmPage = await fetch(`${origin}/index.html`, { headers: { Cookie: playerCookie }, redirect: "manual" });
  assert.equal(gmPage.status, 302);
  assert.equal(gmPage.headers.get("location"), "/player-interface.html");
});