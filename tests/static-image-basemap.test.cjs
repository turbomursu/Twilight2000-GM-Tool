const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const { assertCampaignSetupPackage, assertOfflineBasemap } = require("../campaign-package-contract.js");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { createPlayerSeed, exportRuntimeSave, getRuntimeCampaign, openRuntimeDatabase, restoreRuntimeSave } = require("../server/runtime-store.cjs");
const { seedSampleRuntime } = require("../server/sample-data.cjs");
const { getGMMap, updateGMMap } = require("../server/map-publications.cjs");

const bootstrapToken = "static-image-test-bootstrap-token-0123456789";
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
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  name.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
  return chunk;
}

function png(width = 3, height = 2) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  // One zlib block containing the two RGB scanlines and their filter bytes.
  const imageData = Buffer.from([0x78, 0x01, 0x01, 0x0d, 0x00, 0xf2, 0xff,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([signature, pngChunk("IHDR", header), pngChunk("IDAT", imageData), pngChunk("IEND", Buffer.alloc(0))]);
}

function webp(width = 3, height = 2) {
  const data = Buffer.alloc(26);
  data.write("RIFF", 0, "ascii");
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WEBPVP8L", 8, "ascii");
  data.writeUInt32LE(5, 16);
  data[20] = 0x2f;
  data.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return data;
}

function jpeg(width = 3, height = 2) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xff, 0xd9]);
}

function setupPackage(basemap = null) {
  const campaignId = randomUUID();
  const locationId = randomUUID();
  return {
    packageType: "fieldbook.campaign-setup", schemaVersion: 2,
    campaign: { id: campaignId, name: "Image basemap test", setting: "Test", premise: "Test", era: "2000" },
    map: {
      id: randomUUID(), name: "Test area", bounds: { south: 0, west: 0, north: 10, east: 10 },
      center: { lat: 5, lng: 5 }, zoom: 8, fieldPapersAtlas: null, attribution: "",
      offlineAnnotations: [], offlineBasemap: basemap,
      grid: { coordinateSystem: "axial-q-r", cellKm: 10, terrainCells: [] },
      locations: [{ id: locationId, name: "Start", kind: "Settlement", description: "",
        gridRef: "0,0", coordinates: { q: 0, r: 0 }, mapPosition: { lat: 5, lng: 5 },
        visibility: "gm-only", isStartingLocation: true }]
    },
    factions: [], settlements: [], scenarioNotes: []
  };
}

async function startServer(t) {
  const database = openRuntimeDatabase();
  const offlineBasemapDir = mkdtempSync(join(tmpdir(), "fieldbook-static-image-"));
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

async function login(origin, username, secret = password) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: secret })
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

function insertAccount(database, gm, username, role) {
  const id = randomUUID();
  database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, global_role, created_by_account_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, username, gm.password_hash, role, gm.id, gm.created_at, gm.updated_at);
  return id;
}

test("campaign contract accepts static image references with an optional HTTPS license URL", () => {
  const reference = { format: "static-image", assetId: randomUUID(), attribution: "GM-provided map" };
  assert.equal(assertOfflineBasemap(reference), true);
  assert.equal(assertOfflineBasemap({ ...reference, licenseUrl: "https://maps.example.test/license" }), true);
  const input = setupPackage(reference);
  assert.equal(assertCampaignSetupPackage(input), true);
  for (const invalid of [
    { ...reference, licenseUrl: "http://maps.example.test/license" },
    { ...reference, attribution: " " },
    { ...reference, contentType: "image/png" },
    { ...reference, licenseUrl: "" }
  ]) assert.throws(() => assertOfflineBasemap(invalid), /offline basemap/);
});

test("static image upload, publication switching, player access, and runtime backup retain boundaries", async (t) => {
  const { origin, database } = await startServer(t);
  const gmCookie = (await fetch(`${origin}/api/auth/bootstrap`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bootstrapToken, username: "image-gm", password })
  })).headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${origin}/map-basemap-client.js`, { redirect: "manual" })).status, 302);
  assert.equal((await fetch(`${origin}/map-basemap-client.js`, { headers: { Cookie: gmCookie } })).status, 200);
  const gm = database.prepare("SELECT * FROM accounts WHERE login_identifier = 'image-gm'").get();

  async function upload(cookie, body, contentType) {
    return fetch(`${origin}/api/offline-basemaps`, {
      method: "POST", headers: { "Content-Type": contentType, Cookie: cookie }, body
    });
  }
  const images = [
    { body: png(), contentType: "image/png" },
    { body: jpeg(), contentType: "image/jpeg" },
    { body: webp(), contentType: "image/webp" }
  ];
  const uploaded = [];
  for (const image of images) {
    const response = await upload(gmCookie, image.body, image.contentType);
    assert.equal(response.status, 201);
    const { asset } = await response.json();
    assert.equal(asset.format, "static-image");
    assert.equal(asset.contentType, image.contentType);
    assert.equal(asset.width, 3);
    assert.equal(asset.height, 2);
    uploaded.push({ ...image, asset });
  }
  assert.equal((await upload(gmCookie, png(), "image/jpeg")).status, 422, "MIME/signature mismatch is rejected");
  assert.equal((await upload(gmCookie, Buffer.from("<svg/>"), "image/svg+xml")).status, 415, "SVG is not an allowed upload type");
  assert.equal((await upload(gmCookie, png().subarray(0, 30), "image/png")).status, 422, "truncated PNG is rejected");
  assert.equal((await upload(gmCookie, png(20000, 10000), "image/png")).status, 422, "excessive pixel dimensions are rejected");

  const imageAsset = uploaded[0].asset;
  const secondGmId = insertAccount(database, gm, "image-other-gm", "gm");
  const secondGmCookie = await login(origin, "image-other-gm");
  const foreignUpload = await upload(secondGmCookie, webp(), "image/webp");
  const foreignAsset = (await foreignUpload.json()).asset;
  const ownerAssetPath = `/offline-basemaps/${imageAsset.assetId}.image`;
  const ownerRead = await fetch(`${origin}${ownerAssetPath}`, { headers: { Cookie: gmCookie, Range: "bytes=0-7" } });
  assert.equal(ownerRead.status, 206);
  assert.equal(ownerRead.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await ownerRead.arrayBuffer()), png().subarray(0, 8));
  assert.equal((await fetch(`${origin}${ownerAssetPath}`, { headers: { Cookie: secondGmCookie } })).status, 404);
  assert.ok(secondGmId);

  const source = setupPackage();
  const importResponse = await fetch(`${origin}/api/campaigns/import-setup`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: gmCookie }, body: JSON.stringify(source)
  });
  assert.equal(importResponse.status, 201);
  const { campaign } = await importResponse.json();
  const playerAccountId = insertAccount(database, gm, "image-player", "player");
  createPlayerSeed(database, gm.id, campaign.id, {
    username: "image-player", displayLabel: "Image player",
    fields: [{ key: "name", label: "Name", value: "Player", required: true }]
  });
  const playerCookie = await login(origin, "image-player");
  assert.ok(playerAccountId);

  const endpoint = `${origin}/api/campaigns/${campaign.id}/map-publication`;
  const playerEndpoint = `${origin}/api/player/campaigns/${campaign.id}/map`;
  const playerBasemapPath = `/api/player/campaigns/${campaign.id}/map-basemap`;
  const playerBasemapEndpoint = `${origin}${playerBasemapPath}`;
  const call = (body) => fetch(endpoint, { method: "PUT", headers: {
    "Content-Type": "application/json", Cookie: gmCookie
  }, body: JSON.stringify(body) });
  const initial = await (await fetch(endpoint, { headers: { Cookie: gmCookie } })).json();
  const locationId = source.map.locations[0].id;
  const draft = { locationIds: [locationId], markings: [], geometries: [],
    routeLocationIds: [locationId], playerPosition: { lat: 5, lng: 5 } };
  assert.equal((await call({ action: "draft", expectedRevision: initial.map.revision, draft })).status, 200);
  assert.equal((await call({ action: "publish", expectedRevision: initial.map.revision + 1 })).status, 200);
  const originalPlayerPublication = await (await fetch(playerEndpoint, { headers: { Cookie: playerCookie } })).json();
  assert.equal(originalPlayerPublication.map.offlineBasemap, null);

  const selected = { format: "static-image", assetId: imageAsset.assetId, attribution: "GM map credit" };
  const setBasemap = await call({ action: "basemap", expectedRevision: initial.map.revision + 2, basemap: selected });
  assert.equal(setBasemap.status, 200, await setBasemap.clone().text());
  const afterSwitch = await setBasemap.json();
  assert.deepEqual(afterSwitch.map.catalog.offlineBasemap, selected);
  assert.equal(database.prepare("SELECT attribution FROM maps WHERE runtime_campaign_id = ?").get(campaign.id).attribution, selected.attribution);
  assert.ok(database.prepare("SELECT 1 FROM audit_events WHERE campaign_id = ? AND action = 'map.basemap'").get(campaign.id));
  assert.deepEqual(afterSwitch.map.published, originalPlayerPublication.map, "changing source must not mutate the existing publication");
  assert.equal((await call({ action: "basemap", expectedRevision: afterSwitch.map.revision, basemap: {
    ...selected, assetId: foreignAsset.assetId
  } })).status, 422, "the GM cannot select an asset owned by another account");
  assert.equal((await call({ action: "basemap", expectedRevision: afterSwitch.map.revision, basemap: {
    ...selected, format: "raster-pmtiles"
  } })).status, 422, "the reference format must match the stored asset format");
  assert.deepEqual((await (await fetch(playerEndpoint, { headers: { Cookie: playerCookie } })).json()).map, originalPlayerPublication.map);

  const previewResponse = await call({ action: "preview", expectedRevision: afterSwitch.map.revision });
  const preview = await previewResponse.json();
  assert.equal(preview.preview.offlineBasemap.assetUrl, `/offline-basemaps/${imageAsset.assetId}.image`);
  assert.deepEqual((await (await fetch(playerEndpoint, { headers: { Cookie: playerCookie } })).json()).map, originalPlayerPublication.map);
  assert.equal((await call({ action: "publish", expectedRevision: afterSwitch.map.revision })).status, 200);
  const published = await (await fetch(playerEndpoint, { headers: { Cookie: playerCookie } })).json();
  assert.equal(published.map.offlineBasemap.assetUrl, playerBasemapPath);
  const served = await fetch(playerBasemapEndpoint, { headers: { Cookie: playerCookie, Range: "bytes=0-7" } });
  assert.equal(served.status, 206);
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.equal(served.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png().subarray(0, 8));
  assert.equal((await fetch(playerBasemapEndpoint, { headers: { Cookie: secondGmCookie } })).status, 403);
  assert.equal((await fetch(playerBasemapEndpoint, { headers: { Cookie: gmCookie } })).status, 403);

  const sourceSnapshot = database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(campaign.id).source_json;
  const currentRevision = (await (await fetch(endpoint, { headers: { Cookie: gmCookie } })).json()).map.revision;
  const cleared = await call({ action: "basemap", expectedRevision: currentRevision, basemap: null });
  assert.equal(cleared.status, 200);
  const clearedMap = await cleared.json();
  assert.equal(clearedMap.map.catalog.offlineBasemap, null);
  assert.equal(database.prepare("SELECT attribution FROM maps WHERE runtime_campaign_id = ?").get(campaign.id).attribution, "");
  assert.deepEqual(clearedMap.map.published, { ...published.map, offlineBasemap: {
    ...published.map.offlineBasemap, assetUrl: `/offline-basemaps/${imageAsset.assetId}.image`
  } }, "switching back to no basemap also leaves publication unchanged");
  assert.equal(getRuntimeCampaign(database, gm.id, campaign.id).setupPackage.map.offlineBasemap, null);
  assert.equal(database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(campaign.id).source_json, sourceSnapshot);

  const initialized = seedSampleRuntime(database, gm.id, { playerUsername: "image-backup-player" });
  const backupCampaignId = initialized.campaignId;
  const backupMap = getGMMap(database, gm.id, backupCampaignId);
  updateGMMap(database, gm.id, backupCampaignId, {
    action: "basemap", expectedRevision: backupMap.revision, basemap: selected
  }, () => true);
  const backup = exportRuntimeSave(database, gm.id, backupCampaignId);
  assert.equal(JSON.parse(backup.data.maps[0].offlineBasemap_json).format, "static-image");
  const backupSourceSnapshot = database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(backupCampaignId).source_json;
  assert.deepEqual(getRuntimeCampaign(database, gm.id, backupCampaignId).setupPackage.map.offlineBasemap, selected);
  updateGMMap(database, gm.id, backupCampaignId, { action: "basemap", expectedRevision: 1, basemap: null });
  assert.equal(getRuntimeCampaign(database, gm.id, backupCampaignId).setupPackage.map.offlineBasemap, null);
  const campaignRevision = database.prepare("SELECT revision FROM campaigns WHERE runtime_id = ?").get(backupCampaignId).revision;
  restoreRuntimeSave(database, gm.id, backupCampaignId, backup, {
    confirmReplace: true, confirmOlderBackup: true, expectedRevision: campaignRevision
  });
  assert.deepEqual(getRuntimeCampaign(database, gm.id, backupCampaignId).setupPackage.map.offlineBasemap, selected);
  assert.equal(database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(backupCampaignId).source_json, backupSourceSnapshot);
});
