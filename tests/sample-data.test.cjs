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
    assert.equal(typeof firstSeed.activationToken, "string");

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
    assert.equal(secondSeed.activationToken, null);
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
  assert.equal(runtime.dashboard.rationsDays, 6);
  assert.equal(runtime.route.length, 4);
  assert.equal(runtime.personnel.length, 4);
  assert.equal(runtime.journal.length, 3);

  const denied = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, { headers: { Cookie: `fieldbook_session=${otherToken}` } });
  assert.equal(denied.status, 404);
});