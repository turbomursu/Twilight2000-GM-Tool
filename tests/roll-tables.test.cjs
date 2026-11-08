const assert = require("node:assert/strict");
const { createHash, randomBytes } = require("node:crypto");
const http = require("node:http");
const { once } = require("node:events");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { getRollTableCatalog, replaceRollTableCatalog } = require("../server/roll-tables.cjs");
const { openRuntimeDatabase } = require("../server/runtime-store.cjs");
const { rollDice, validateRollTableCatalog } = require("../roll-table-contract.js");

const sampleCatalog = {
  schemaVersion: 1,
  tables: [{
    id: "weather-test",
    name: "Weather test",
    contexts: ["situation"],
    dice: "1d6",
    columns: ["Roll", "Outcome"],
    rows: [{ min: 1, max: 6, values: ["1-6", "Example outcome"] }],
    notes: []
  }]
};

function addAccount(database, id, role) {
  const timestamp = new Date().toISOString();
  database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
    VALUES (?, ?, 'test-only-hash', 0, ?, ?, ?)`).run(id, id, timestamp, timestamp, role);
  const token = randomBytes(32).toString("base64url");
  database.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(createHash("sha256").update(token).digest("hex"), id, timestamp, "2099-01-01T00:00:00.000Z");
  return `fieldbook_session=${token}`;
}

async function startServer(t, database) {
  const server = http.createServer(createAppHandler({
    database,
    authHandler: createAuthHandler({ database, bootstrapToken: "test-roll-table-bootstrap-token-0123456789" })
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("the bundled shared catalog validates and every included table maps all die totals", () => {
  const catalog = validateRollTableCatalog(require("../roll-tables.json"));
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.tables.length, 17);
  assert.ok(catalog.tables.every((table) => table.contexts.length === 0));
  const stationaryEncounters = catalog.tables.find((table) => table.id === "stationary-encounters");
  assert.equal(stationaryEncounters.dice, "1d100");
  assert.deepEqual(stationaryEncounters.rows.map(({ min, max }) => [min, max]), [
    [1, 4], [5, 5], [6, 6], [7, 7], [8, 100]
  ]);
});

test("roll-table catalogs require unique names and complete, non-overlapping die ranges", () => {
  assert.deepEqual(validateRollTableCatalog({ schemaVersion: 1, tables: [] }), { schemaVersion: 1, tables: [] });
  assert.equal(rollDice("2d6", (sides) => sides - 1), 12);
  assert.equal(rollDice("2d6", (() => { const values = [0, 5]; return () => values.shift(); })()), 7);
  assert.throws(() => validateRollTableCatalog({
    ...sampleCatalog,
    tables: [sampleCatalog.tables[0], { ...sampleCatalog.tables[0], id: "another-id" }]
  }), /name .* duplicated/i);
  assert.throws(() => validateRollTableCatalog({
    schemaVersion: 1,
    tables: [{ ...sampleCatalog.tables[0], rows: [
      { min: 1, max: 4, values: ["1-4", "A"] },
      { min: 4, max: 6, values: ["4-6", "B"] }
    ] }]
  }), /overlapping ranges/i);
  assert.throws(() => validateRollTableCatalog({
    schemaVersion: 1,
    tables: [{ ...sampleCatalog.tables[0], rows: [{ min: 1, max: 5, values: ["1-5", "A"] }] }]
  }), /cover every possible dice total/i);
  assert.throws(() => rollDice("1d6", () => 6), /invalid result/i);
});

test("the catalog is shared across GMs, revision checked, and unavailable to players", async (t) => {
  const database = openRuntimeDatabase();
  t.after(() => database.close());
  const gmCookie = addAccount(database, "roll-gm-one", "gm");
  const otherGmCookie = addAccount(database, "roll-gm-two", "gm");
  const playerCookie = addAccount(database, "roll-player", "player");
  const origin = await startServer(t, database);

  assert.equal((await fetch(`${origin}/api/roll-tables`)).status, 401);
  const initialResponse = await fetch(`${origin}/api/roll-tables`, { headers: { Cookie: gmCookie } });
  assert.equal(initialResponse.status, 200);
  const initial = await initialResponse.json();
  assert.equal(initial.revision, 0);
  assert.equal(initial.catalog.tables.length, 17);

  const updateResponse = await fetch(`${origin}/api/roll-tables`, {
    method: "PUT",
    headers: { Cookie: gmCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: initial.revision, catalog: sampleCatalog })
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.revision, 1);
  const otherGmResponse = await fetch(`${origin}/api/roll-tables`, { headers: { Cookie: otherGmCookie } });
  assert.deepEqual(await otherGmResponse.json(), updated);

  const staleResponse = await fetch(`${origin}/api/roll-tables`, {
    method: "PUT",
    headers: { Cookie: otherGmCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: 0, catalog: { schemaVersion: 1, tables: [] } })
  });
  assert.equal(staleResponse.status, 409);

  const invalidResponse = await fetch(`${origin}/api/roll-tables`, {
    method: "PUT",
    headers: { Cookie: gmCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: 1, catalog: { schemaVersion: 1, tables: [{ ...sampleCatalog.tables[0], rows: [] }] } })
  });
  assert.equal(invalidResponse.status, 422);
  assert.equal((await fetch(`${origin}/api/roll-tables`, { headers: { Cookie: gmCookie } })).status, 200);

  assert.equal((await fetch(`${origin}/api/roll-tables`, { headers: { Cookie: playerCookie } })).status, 403);
  const playerWrite = await fetch(`${origin}/api/roll-tables`, {
    method: "PUT",
    headers: { Cookie: playerCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: 1, catalog: { schemaVersion: 1, tables: [] } })
  });
  assert.equal(playerWrite.status, 403);
  const crossOrigin = await fetch(`${origin}/api/roll-tables`, {
    method: "PUT",
    headers: { Cookie: gmCookie, Origin: "http://attacker.invalid", "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: 1, catalog: { schemaVersion: 1, tables: [] } })
  });
  assert.equal(crossOrigin.status, 403);
});

test("catalog changes survive a database reopen outside campaign state", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-roll-tables-"));
  const databasePath = join(directory, "roll-tables.sqlite");
  let database;
  try {
    database = openRuntimeDatabase(databasePath);
    replaceRollTableCatalog(database, 0, sampleCatalog);
    database.close();
    database = openRuntimeDatabase(databasePath);
    assert.deepEqual(getRollTableCatalog(database), { revision: 1, catalog: sampleCatalog });
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM campaigns").get().count, 0);
  } finally {
    database?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
