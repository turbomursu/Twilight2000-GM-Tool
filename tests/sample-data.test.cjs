const assert = require("node:assert/strict");
const { createHash, randomBytes } = require("node:crypto");
const { mkdtempSync, rmSync } = require("node:fs");
const http = require("node:http");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { once } = require("node:events");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { openRuntimeDatabase, getRuntimeDashboard } = require("../server/runtime-store.cjs");
const { seedSampleDatabase } = require("../server/seed-sample.cjs");

function createGmAccount(database, username = "gm-user") {
  const timestamp = new Date().toISOString();
  database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
    VALUES (?, ?, ?, 0, ?, ?, 'gm')`).run("gm-account-1", username, "test-only-hash", timestamp, timestamp);
}

test("requires an explicit development database path and GM username", () => {
  assert.throws(() => seedSampleDatabase([]), /--db <development-db-path> --gm <gm-username>/);
});

test("refuses to seed the configured live database path", () => {
  assert.throws(() => seedSampleDatabase(["--db", "data/live.sqlite", "--gm", "gm-user"], {
    FIELDBOOK_DB_PATH: "data/live.sqlite"
  }), /Refusing to seed/);
  assert.throws(() => seedSampleDatabase(["--db", "data/fieldbook.sqlite", "--gm", "gm-user"], {}), /Refusing to seed/);
});

test("seeds an idempotent runtime dashboard and player seed without resetting edits", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-sample-data-test-"));
  const databasePath = join(directory, "development.sqlite");
  let database;
  try {
    database = openRuntimeDatabase(databasePath);
    createGmAccount(database);
    database.close();
    database = null;

    const firstSeed = seedSampleDatabase(["--db", databasePath, "--gm", "gm-user"]);
    assert.equal(firstSeed.campaignName, "The Long Road");
    assert.equal(firstSeed.seedStatus, "seed");
    assert.equal(Object.hasOwn(firstSeed, "activationToken"), false);

    database = openRuntimeDatabase(databasePath);
    const initialData = getRuntimeDashboard(database, "gm-account-1", firstSeed.campaignId);
    assert.equal(initialData.dashboard.gameDate, "2000-05-11");
    assert.equal(initialData.dashboard.dayNumber, 14);
    assert.equal(initialData.dashboard.distanceKm, 86);
    assert.equal(initialData.dashboard.rationsDays, 6);
    assert.equal(initialData.dashboard.fuelUnits, 3);
    assert.deepEqual(initialData.route.map(({ name }) => name), ["Sälen coast road", "Vansbro", "Mora", "Orsa"]);
    assert.equal(initialData.personnel.length, 4);
    assert.equal(initialData.journal.length, 3);

    database.prepare("UPDATE runtime_dashboard_state SET rations_days = 4 WHERE campaign_id = ?").run(firstSeed.campaignId);
    database.close();
    database = null;

    const secondSeed = seedSampleDatabase(["--db", databasePath, "--gm", "gm-user"]);
    assert.equal(secondSeed.campaignId, firstSeed.campaignId);
    assert.equal(Object.hasOwn(secondSeed, "activationToken"), false);
    database = openRuntimeDatabase(databasePath);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM campaigns").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM player_seats WHERE campaign_id = ?").get(firstSeed.campaignId).count, 1);
    assert.equal(database.prepare("SELECT rations_days FROM runtime_dashboard_state WHERE campaign_id = ?").get(firstSeed.campaignId).rations_days, 4);
  } finally {
    database?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("does not seed a development campaign under a different GM owner", () => {
  const database = openRuntimeDatabase();
  try {
    createGmAccount(database);
    database.prepare(`INSERT INTO accounts
      (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
      VALUES (?, ?, ?, 0, ?, ?, 'gm')`).run("gm-account-2", "another-gm", "test-only-hash", new Date().toISOString(), new Date().toISOString());
    const initialSeed = require("../server/sample-data.cjs").seedSampleRuntime(database, "gm-account-1");
    assert.throws(() => require("../server/sample-data.cjs").seedSampleRuntime(database, "gm-account-2"), /different GM account/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM campaigns").get().count, 1);
    assert.ok(initialSeed.campaignId);
  } finally {
    database.close();
  }
});

test("serves seeded runtime dashboard data only to its GM owner", async (t) => {
  const database = openRuntimeDatabase();
  const timestamp = new Date().toISOString();
  createGmAccount(database);
  const seeded = require("../server/sample-data.cjs").seedSampleRuntime(database, "gm-account-1");
  database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
    VALUES (?, ?, ?, 0, ?, ?, 'gm')`).run("other-gm", "other-gm", "test-only-hash", timestamp, timestamp);
  const gmToken = randomBytes(32).toString("base64url");
  const otherToken = randomBytes(32).toString("base64url");
  database.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(createHash("sha256").update(gmToken).digest("hex"), "gm-account-1", timestamp, "2099-01-01T00:00:00.000Z");
  database.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(createHash("sha256").update(otherToken).digest("hex"), "other-gm", timestamp, "2099-01-01T00:00:00.000Z");
  const authHandler = createAuthHandler({ database, bootstrapToken: "not-used-because-accounts-exist" });
  const server = http.createServer(createAppHandler({ database, authHandler }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(() => {
    database.close();
    resolve();
  })));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const allowed = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, { headers: { Cookie: `fieldbook_session=${gmToken}` } });
  assert.equal(allowed.status, 200);
  const { runtime } = await allowed.json();
  assert.equal(runtime.campaign.premise, "A small column travels north through an uncertain region.");
  assert.equal(runtime.campaign.era, "11 May 2000");
  assert.equal(runtime.dashboard.rationsDays, 6);
  assert.equal(runtime.route.length, 4);
  assert.deepEqual(runtime.route.map(({ mapPosition }) => mapPosition), [
    { lat: 60.79, lng: 13.15 },
    { lat: 60.51, lng: 14.22 },
    { lat: 61.01, lng: 14.54 },
    { lat: 61.12, lng: 14.62 }
  ]);
  assert.equal(runtime.locations.length, 4);
  assert.equal(runtime.personnel.length, 4);
  assert.equal(runtime.journal.length, 3);

  const missingRevision = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ journal: runtime.journal })
  });
  assert.equal(missingRevision.status, 422);

  const staleUpdate = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ expectedRevision: runtime.campaign.revision - 1, journal: runtime.journal })
  });
  assert.equal(staleUpdate.status, 409);
  const stalePersonnelUpdate = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ expectedRevision: runtime.campaign.revision - 1, personnel: runtime.personnel })
  });
  assert.equal(stalePersonnelUpdate.status, 409);
  const staleMapUpdate = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ expectedRevision: runtime.campaign.revision - 1, locations: [{ id: runtime.locations[0].id, mapPosition: { lat: 60.6, lng: 14.1 } }] })
  });
  assert.equal(staleMapUpdate.status, 409);

  const updatedPersonnel = runtime.personnel.map((person, index) => ({
    ...person,
    name: index === 0 ? "Anja Updated" : person.name,
    condition: index === 0 ? "Recovering" : person.condition,
    readiness: index === 0 ? "Alert" : person.readiness
  }));
  const updatedJournal = runtime.journal.map((entry) => ({ ...entry, date: entry.entryDate }));
  const updatedRoute = runtime.route.map(({ locationId, detail, kmFromPrevious }) => ({ locationId, detail, kmFromPrevious }));
  [updatedRoute[1], updatedRoute[2]] = [updatedRoute[2], updatedRoute[1]];
  const updatedLocations = [{ id: runtime.locations[0].id, mapPosition: { lat: 60.6, lng: 14.1 } }];
  const updateResponse = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ expectedRevision: runtime.campaign.revision,
      dashboard: { rationsDays: 5, weather: "Rain/Snow", weatherNote: "North road weather watch." },
      personnel: updatedPersonnel, journal: updatedJournal, route: updatedRoute, locations: updatedLocations })
  });
  assert.equal(updateResponse.status, 200);
  const updatedRuntime = (await updateResponse.json()).runtime;
  assert.equal(updatedRuntime.dashboard.rationsDays, 5);
  assert.equal(updatedRuntime.dashboard.weather, "Rain/Snow");
  assert.equal(updatedRuntime.dashboard.weatherNote, "North road weather watch.");
  assert.equal(updatedRuntime.personnel[0].name, "Anja Updated");
  assert.equal(updatedRuntime.personnel[0].condition, "Recovering");
  assert.equal(updatedRuntime.personnel[0].readiness, "Alert");
  assert.equal(updatedRuntime.route[1].locationId, runtime.route[2].locationId);
  assert.deepEqual(updatedRuntime.locations[0].mapPosition, { lat: 60.6, lng: 14.1 });
  assert.deepEqual(updatedRuntime.route.find(({ locationId }) => locationId === runtime.locations[0].id).mapPosition, { lat: 60.6, lng: 14.1 });
  assert.equal(updatedRuntime.campaign.revision, 6);

  const reloaded = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, { headers: { Cookie: `fieldbook_session=${gmToken}` } });
  const reloadedRuntime = (await reloaded.json()).runtime;
  assert.equal(reloadedRuntime.dashboard.rationsDays, 5);
  assert.equal(reloadedRuntime.dashboard.weather, "Rain/Snow");
  assert.equal(reloadedRuntime.dashboard.weatherNote, "North road weather watch.");
  assert.equal(reloadedRuntime.personnel[0].name, "Anja Updated");
  assert.equal(reloadedRuntime.route[1].locationId, runtime.route[2].locationId);
  assert.deepEqual(reloadedRuntime.locations[0].mapPosition, { lat: 60.6, lng: 14.1 });

  const outOfBoundsMapUpdate = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ expectedRevision: reloadedRuntime.campaign.revision, locations: [{ id: runtime.locations[0].id, mapPosition: { lat: 80, lng: 14 } }] })
  });
  assert.equal(outOfBoundsMapUpdate.status, 422);

  const auditResponse = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/audit`, { headers: { Cookie: `fieldbook_session=${gmToken}` } });
  const auditedActions = (await auditResponse.json()).events.map(({ action }) => action);
  assert.ok(auditedActions.includes("route.update"));
  assert.ok(auditedActions.includes("map.locations.update"));

  const deniedWrite = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${otherToken}` },
    body: JSON.stringify({ expectedRevision: updatedRuntime.campaign.revision, dashboard: { rationsDays: 1 } })
  });
  assert.equal(deniedWrite.status, 404);

  const invalidCombinedUpdate = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ expectedRevision: updatedRuntime.campaign.revision, dashboard: { rationsDays: 2 }, journal: [{ id: "broken" }] })
  });
  assert.equal(invalidCombinedUpdate.status, 422);
  const afterRollback = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, { headers: { Cookie: `fieldbook_session=${gmToken}` } });
  assert.equal((await afterRollback.json()).runtime.dashboard.rationsDays, 5);

  const customWeatherResponse = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ expectedRevision: reloadedRuntime.campaign.revision, dashboard: { weather: "Dense smoke", weatherNote: "GM-defined visibility condition." } })
  });
  assert.equal(customWeatherResponse.status, 200);
  const customWeatherRuntime = (await customWeatherResponse.json()).runtime;
  const customWeather = customWeatherRuntime.dashboard;
  assert.equal(customWeather.weather, "Dense smoke");
  assert.equal(customWeather.weatherNote, "GM-defined visibility condition.");

  const personnelOnly = customWeatherRuntime.personnel.map((person, index) => ({
    ...person,
    readiness: index === 0 ? "Resting" : person.readiness
  }));
  const personnelOnlyResponse = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ expectedRevision: customWeatherRuntime.campaign.revision, personnel: personnelOnly })
  });
  assert.equal(personnelOnlyResponse.status, 200);
  const personnelOnlyRuntime = (await personnelOnlyResponse.json()).runtime;
  assert.equal(personnelOnlyRuntime.campaign.revision, customWeatherRuntime.campaign.revision + 1);
  assert.equal(personnelOnlyRuntime.personnel[0].readiness, "Resting");

  const stalePersonnelRetry = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${gmToken}` },
    body: JSON.stringify({ expectedRevision: customWeatherRuntime.campaign.revision, personnel: customWeather.personnel })
  });
  assert.equal(stalePersonnelRetry.status, 409);
  assert.equal(getRuntimeDashboard(database, "gm-account-1", seeded.campaignId).personnel[0].readiness, "Resting");

  const denied = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, { headers: { Cookie: `fieldbook_session=${otherToken}` } });
  assert.equal(denied.status, 404);
});