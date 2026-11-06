const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { deflateSync } = require("node:zlib");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { createPlayerSeed, openRuntimeDatabase } = require("../server/runtime-store.cjs");

const bootstrapToken = "image-coordinate-test-bootstrap-token-123456";
const password = "A-correct-horse-battery-41";

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write(type, 4, "ascii");
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
  return chunk;
}

function png(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  const imageData = deflateSync(pixels);
  return Buffer.concat([signature, pngChunk("IHDR", header), pngChunk("IDAT", imageData), pngChunk("IEND", Buffer.alloc(0))]);
}

function imagePackage(assetId, widthPixels = 4) {
  const campaignId = randomUUID();
  const locationId = randomUUID();
  return {
    packageType: "fieldbook.campaign-setup",
    schemaVersion: 2,
    campaign: { id: campaignId, name: "Image-coordinate test", setting: "Test", premise: "Test", era: "2000" },
    map: {
      id: randomUUID(),
      name: "Scanned field map",
      bounds: { type: "image-km", widthPixels, heightPixels: 2, widthKm: 12 },
      center: { x: 6, y: 3 },
      zoom: 1,
      fieldPapersAtlas: null,
      attribution: "GM-provided image",
      offlineAnnotations: [],
      offlineBasemap: { format: "static-image", assetId, attribution: "GM map credit" },
      grid: { coordinateSystem: "axial-q-r", cellKm: 10, origin: { x: 0, y: 6 }, terrainCells: [] },
      locations: [{
        id: locationId, name: "Starting point", kind: "Settlement", description: "",
        gridRef: "0,0", coordinates: { q: 0, r: 0 }, mapPosition: { x: 2, y: 3 },
        visibility: "gm-only", isStartingLocation: true
      }]
    },
    factions: [],
    settlements: [],
    scenarioNotes: []
  };
}

async function startServer(t) {
  const database = openRuntimeDatabase();
  const offlineBasemapDir = mkdtempSync(join(tmpdir(), "fieldbook-image-coordinate-"));
  const server = http.createServer(createAppHandler({
    database, authHandler: createAuthHandler({ database, bootstrapToken }), offlineBasemapDir
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(() => {
    database.close();
    rmSync(offlineBasemapDir, { recursive: true, force: true });
    resolve();
  })));
  return { origin: `http://127.0.0.1:${server.address().port}`, database };
}

async function jsonCall(origin, path, cookie, method = "GET", body) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { response, body: await response.json() };
}

test("authorized image-coordinate setup import, runtime editing, publication, and recovery preserve kilometre coordinates", async (t) => {
  const { origin, database } = await startServer(t);
  const anonymousHelper = await fetch(`${origin}/map-coordinates.js`, { redirect: "manual" });
  assert.equal(anonymousHelper.status, 302);
  assert.equal(anonymousHelper.headers.get("location"), "/login.html?next=%2Fmap-coordinates.js");
  const bootstrap = await fetch(`${origin}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bootstrapToken, username: "image-coordinate-gm", password })
  });
  assert.equal(bootstrap.status, 201);
  const gmCookie = bootstrap.headers.get("set-cookie").split(";")[0];
  const gmHelper = await fetch(`${origin}/map-coordinates.js`, { headers: { Cookie: gmCookie } });
  assert.equal(gmHelper.status, 200);
  assert.equal(gmHelper.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.match(await gmHelper.text(), /FieldbookMapCoordinates/);
  const headHelper = await fetch(`${origin}/map-coordinates.js`, { method: "HEAD", headers: { Cookie: gmCookie } });
  assert.equal(headHelper.status, 200);
  assert.equal(await headHelper.text(), "");
  const gm = database.prepare("SELECT * FROM accounts WHERE login_identifier = ?").get("image-coordinate-gm");

  const uploaded = await fetch(`${origin}/api/offline-basemaps`, {
    method: "POST", headers: { Cookie: gmCookie, "Content-Type": "image/png" }, body: png(4, 2)
  });
  assert.equal(uploaded.status, 201);
  const asset = (await uploaded.json()).asset;
  const uploadOtherSize = await fetch(`${origin}/api/offline-basemaps`, {
    method: "POST", headers: { Cookie: gmCookie, "Content-Type": "image/png" }, body: png(5, 2)
  });
  const wrongSizedAsset = (await uploadOtherSize.json()).asset;

  const mismatchedPackage = imagePackage(wrongSizedAsset.assetId);
  const mismatchResponse = await jsonCall(origin, "/api/campaigns/import-setup", gmCookie, "POST", mismatchedPackage);
  assert.equal(mismatchResponse.response.status, 422);
  assert.match(mismatchResponse.body.error, /dimensions must match/);

  const setup = imagePackage(asset.assetId);
  const imported = await jsonCall(origin, "/api/campaigns/import-setup", gmCookie, "POST", setup);
  assert.equal(imported.response.status, 201, imported.body.error);
  const campaignId = imported.body.campaign.id;
  const sourceLocationId = setup.map.locations[0].id;
  assert.deepEqual(imported.body.campaign.setupPackage.map.bounds, setup.map.bounds);
  assert.deepEqual(JSON.parse(database.prepare("SELECT center_json FROM maps WHERE runtime_campaign_id = ?").get(campaignId).center_json),
    { x: 6, y: 3 });
  assert.deepEqual(JSON.parse(database.prepare("SELECT bounds_json FROM maps WHERE runtime_campaign_id = ?").get(campaignId).bounds_json),
    setup.map.bounds);

  const playerId = randomUUID();
  database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, global_role, created_by_account_id, created_at, updated_at)
    VALUES (?, ?, ?, 'player', ?, ?, ?)`).run(playerId, "image-coordinate-player", gm.password_hash, gm.id, gm.created_at, gm.updated_at);
  createPlayerSeed(database, gm.id, campaignId, {
    username: "image-coordinate-player", displayLabel: "Image Player",
    fields: [{ key: "name", label: "Name", value: "Player", required: true }]
  });
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "image-coordinate-player", password })
  });
  assert.equal(login.status, 200);
  const playerCookie = login.headers.get("set-cookie").split(";")[0];
  const playerHelper = await fetch(`${origin}/map-coordinates.js`, { headers: { Cookie: playerCookie } });
  assert.equal(playerHelper.status, 200, "the player map also uses the authenticated shared helper");
  assert.equal(playerHelper.headers.get("content-type"), "text/javascript; charset=utf-8");

  const locationsPath = `/api/campaigns/${campaignId}/locations`;
  const created = await jsonCall(origin, locationsPath, gmCookie, "POST", {
    name: "North checkpoint", kind: "Waypoint", mapPosition: { x: 9, y: 5 }, visibilityEligibility: "players"
  });
  assert.equal(created.response.status, 201, created.body.error);
  const addedLocationId = created.body.location.id;
  const outsideCreate = await jsonCall(origin, locationsPath, gmCookie, "POST", {
    name: "Outside", kind: "Waypoint", mapPosition: { x: 9, y: 6.1 }
  });
  assert.equal(outsideCreate.response.status, 422);
  const updatedLocation = await jsonCall(origin, `${locationsPath}/${addedLocationId}`, gmCookie, "PUT", {
    mapPosition: { x: 10, y: 4 }
  });
  assert.equal(updatedLocation.response.status, 200);
  assert.deepEqual(JSON.parse(updatedLocation.body.location.map_position_json), { x: 10, y: 4 });

  const runtimePath = `/api/campaigns/${campaignId}/runtime`;
  const currentRuntime = (await jsonCall(origin, runtimePath, gmCookie)).body.runtime;
  const deskUpdate = await jsonCall(origin, runtimePath, gmCookie, "PUT", {
    expectedRevision: currentRuntime.campaign.revision,
    locations: [
      { id: sourceLocationId, mapPosition: { x: 3, y: 2 } },
      { id: addedLocationId, mapPosition: { x: 10, y: 4 } }
    ]
  });
  assert.equal(deskUpdate.response.status, 200, deskUpdate.body.error);
  assert.deepEqual(deskUpdate.body.runtime.locations.find(({ id }) => id === sourceLocationId).mapPosition, { x: 3, y: 2 });
  assert.deepEqual(deskUpdate.body.runtime.locations.find(({ id }) => id === addedLocationId).mapPosition, { x: 10, y: 4 });

  const routePath = `/api/campaigns/${campaignId}/route/stops`;
  const routeStop = await jsonCall(origin, routePath, gmCookie, "POST", {
    locationId: addedLocationId, detail: "Checkpoint", kmFromPrevious: 10, ordinal: 1
  });
  assert.equal(routeStop.response.status, 201, routeStop.body.error);
  assert.deepEqual(routeStop.body.stop.mapPosition, { x: 10, y: 4 });

  const partyPath = `/api/campaigns/${campaignId}/party-position`;
  const partyUpdate = await jsonCall(origin, partyPath, gmCookie, "PUT", { x: 4, y: 5 });
  assert.equal(partyUpdate.response.status, 200, partyUpdate.body.error);
  assert.deepEqual({ x: partyUpdate.body.position.x, y: partyUpdate.body.position.y }, { x: 4, y: 5 });
  assert.equal((await jsonCall(origin, partyPath, playerCookie, "PUT", { x: 1, y: 1 })).response.status, 403);
  assert.equal((await jsonCall(origin, partyPath, gmCookie, "PUT", { lat: 4, lng: 5 })).response.status, 400);

  const publicationPath = `/api/campaigns/${campaignId}/map-publication`;
  const mapState = (await jsonCall(origin, publicationPath, gmCookie)).body.map;
  const mismatchedReplacement = await jsonCall(origin, publicationPath, gmCookie, "PUT", {
    action: "basemap", expectedRevision: mapState.revision,
    basemap: { format: "static-image", assetId: wrongSizedAsset.assetId, attribution: "GM map credit" }
  });
  assert.equal(mismatchedReplacement.response.status, 422, "replacement image pixels must preserve declared image-map scaling");
  const draft = {
    locationIds: [sourceLocationId, addedLocationId],
    markings: [{ id: "party-marker", label: "Rally point", position: { x: 4, y: 5 } }],
    geometries: [
      { id: "route-line", label: "Trail", geometry: { type: "LineString", coordinates: [[3, 2], [10, 4]] } },
      { id: "area", label: "Search area", geometry: { type: "Polygon", coordinates: [[[1, 1], [3, 1], [3, 3], [1, 1]]] } }
    ],
    routeLocationIds: [sourceLocationId, addedLocationId],
    playerPosition: { x: 4, y: 5 }
  };
  const savedDraft = await jsonCall(origin, publicationPath, gmCookie, "PUT", {
    action: "draft", expectedRevision: mapState.revision, draft
  });
  assert.equal(savedDraft.response.status, 200, savedDraft.body.error);
  const preview = await jsonCall(origin, publicationPath, gmCookie, "PUT", {
    action: "preview", expectedRevision: savedDraft.body.map.revision
  });
  assert.equal(preview.response.status, 200, preview.body.error);
  assert.deepEqual(preview.body.preview.playerPosition, { x: 4, y: 5 });
  assert.deepEqual(preview.body.preview.geometries[0].geometry.coordinates, [[3, 2], [10, 4]]);
  assert.equal((await jsonCall(origin, publicationPath, gmCookie, "PUT", {
    action: "draft", expectedRevision: savedDraft.body.map.revision,
    draft: { ...draft, geometries: [{ ...draft.geometries[0], geometry: {
      type: "LineString", coordinates: [[3, 2], [13, 4]]
    } }] }
  })).response.status, 422, "image geometry is bounded in x/y kilometres");

  const deniedPMTiles = await jsonCall(origin, publicationPath, gmCookie, "PUT", {
    action: "basemap", expectedRevision: savedDraft.body.map.revision, basemap: {
      format: "raster-pmtiles", assetId: randomUUID(), attribution: "Not available"
    }
  });
  assert.equal(deniedPMTiles.response.status, 422, "geographic basemaps cannot replace a non-geographic image map");
  const deniedClear = await jsonCall(origin, publicationPath, gmCookie, "PUT", {
    action: "basemap", expectedRevision: savedDraft.body.map.revision, basemap: null
  });
  assert.equal(deniedClear.response.status, 422, "image-map background cannot silently fall back to online geography");

  const published = await jsonCall(origin, publicationPath, gmCookie, "PUT", {
    action: "publish", expectedRevision: savedDraft.body.map.revision
  });
  assert.equal(published.response.status, 200, published.body.error);
  const playerMap = await jsonCall(origin, `/api/player/campaigns/${campaignId}/map`, playerCookie);
  assert.equal(playerMap.response.status, 200);
  assert.deepEqual(playerMap.body.map.bounds, setup.map.bounds);
  assert.deepEqual(playerMap.body.map.playerPosition, { x: 4, y: 5 });
  assert.equal(playerMap.body.map.offlineBasemap.format, "static-image");
  assert.equal(playerMap.body.map.offlineBasemap.assetUrl, `/api/player/campaigns/${campaignId}/map-basemap`);
  const playerImage = await fetch(`${origin}${playerMap.body.map.offlineBasemap.assetUrl}`, {
    headers: { Cookie: playerCookie, Range: "bytes=0-7" }
  });
  assert.equal(playerImage.status, 206);
  assert.equal(playerImage.headers.get("content-type"), "image/png");
  assert.deepEqual(playerMap.body.map.geometries[0].geometry.coordinates, [[3, 2], [10, 4]]);
  assert.equal(Object.hasOwn(playerMap.body.map, "scenarioNotes"), false);
  assert.equal((await jsonCall(origin, publicationPath, playerCookie)).response.status, 403);

  const backupResponse = await jsonCall(origin, `/api/campaigns/${campaignId}/backup`, gmCookie);
  assert.equal(backupResponse.response.status, 200);
  const backup = backupResponse.body.backup;
  assert.deepEqual(JSON.parse(backup.data.mapPublication.draft_json).playerPosition, { x: 4, y: 5 });
  assert.deepEqual({ x: backup.data.partyPosition.lat, y: backup.data.partyPosition.lng }, { x: 4, y: 5 });

  const movedParty = await jsonCall(origin, partyPath, gmCookie, "PUT", { x: 8, y: 2 });
  assert.equal(movedParty.response.status, 200);
  const beforeRestore = (await jsonCall(origin, runtimePath, gmCookie)).body.runtime;
  const restored = await jsonCall(origin, `/api/campaigns/${campaignId}/restore`, gmCookie, "POST", {
    backup, confirmReplace: true, confirmOlderBackup: true, expectedRevision: beforeRestore.campaign.revision
  });
  assert.equal(restored.response.status, 200, restored.body.error);
  const restoredParty = await jsonCall(origin, partyPath, gmCookie);
  assert.deepEqual({ x: restoredParty.body.position.x, y: restoredParty.body.position.y }, { x: 4, y: 5 });
  const restoredMap = await jsonCall(origin, publicationPath, gmCookie);
  assert.deepEqual(restoredMap.body.map.draft.playerPosition, { x: 4, y: 5 });
  assert.equal(restoredMap.body.map.published, null, "restore keeps explicit publication withdrawal behavior");

});
