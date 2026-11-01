const assert = require("node:assert/strict");
const { createHash, randomBytes } = require("node:crypto");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const { openRuntimeDatabase, getRuntimeDashboard, exportRuntimeSave, restoreRuntimeSave, updateRuntimeDashboard } = require("../server/runtime-store.cjs");
const { seedSampleRuntime } = require("../server/sample-data.cjs");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");

function createGm(database, id, username) {
  const timestamp = new Date().toISOString();
  database.prepare(`INSERT INTO accounts
    (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
    VALUES (?, ?, ?, 0, ?, ?, 'gm')`).run(id, username, "test-only-hash", timestamp, timestamp);
}

test("runtime backup round-trips dashboard and preserves record IDs and monotonic revision", () => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const before = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    const originalCharacterId = database.prepare("SELECT id FROM characters WHERE campaign_id = ?").get(seeded.campaignId).id;
    const originalSeatId = database.prepare("SELECT id FROM player_seats WHERE campaign_id = ?").get(seeded.campaignId).id;
    const originalPersonnelIds = database.prepare("SELECT id FROM personnel WHERE campaign_id = ? ORDER BY sort_order").all(seeded.campaignId).map(({ id }) => id);
    const backup = exportRuntimeSave(database, "gm-owner", seeded.campaignId, { now: () => "2026-11-01T10:00:00.000Z" });

    updateRuntimeDashboard(database, "gm-owner", seeded.campaignId, {
      dashboard: { rationsDays: 2, weather: "Fog" },
      personnel: before.personnel.slice(0, 1),
      journal: []
    }, { now: () => Date.parse("2026-11-01T10:10:00.000Z") });
    const changed = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    assert.equal(changed.dashboard.rationsDays, 2);
    assert.equal(changed.personnel.length, 1);
    assert.equal(changed.journal.length, 0);

    assert.throws(() => restoreRuntimeSave(database, "gm-owner", seeded.campaignId, backup, {
      confirmReplace: true,
      expectedRevision: changed.campaign.revision
    }), /older than the active campaign/);
    assert.equal(getRuntimeDashboard(database, "gm-owner", seeded.campaignId).dashboard.rationsDays, 2);

    assert.throws(() => restoreRuntimeSave(database, "gm-owner", seeded.campaignId, backup, {
      confirmReplace: true,
      confirmOlderBackup: true,
      expectedRevision: changed.campaign.revision - 1
    }), /revision changed/);

    const result = restoreRuntimeSave(database, "gm-owner", seeded.campaignId, backup, {
      confirmReplace: true,
      confirmOlderBackup: true,
      expectedRevision: changed.campaign.revision,
      now: () => Date.parse("2026-11-01T10:20:00.000Z")
    });
    const restored = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    assert.equal(result.restoredFromRevision, before.campaign.revision);
    assert.equal(restored.dashboard.rationsDays, before.dashboard.rationsDays);
    assert.equal(restored.dashboard.weather, before.dashboard.weather);
    assert.equal(restored.personnel.length, before.personnel.length);
    assert.equal(restored.journal.length, before.journal.length);
    assert.equal(restored.campaign.revision, changed.campaign.revision + 1);
    assert.deepEqual(database.prepare("SELECT id FROM personnel WHERE campaign_id = ? ORDER BY sort_order").all(seeded.campaignId).map(({ id }) => id), originalPersonnelIds);
    assert.equal(database.prepare("SELECT id FROM characters WHERE campaign_id = ?").get(seeded.campaignId).id, originalCharacterId);
    assert.equal(database.prepare("SELECT id FROM player_seats WHERE campaign_id = ?").get(seeded.campaignId).id, originalSeatId);
  } finally {
    database.close();
  }
});

test("runtime restore rejects bad checksums and rolls back database failures atomically", () => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const backup = exportRuntimeSave(database, "gm-owner", seeded.campaignId);
    const badChecksum = { ...backup, checksum: "0".repeat(64) };
    assert.throws(() => restoreRuntimeSave(database, "gm-owner", seeded.campaignId, badChecksum, {
      confirmReplace: true,
      expectedRevision: 0
    }), /checksum is invalid/);

    updateRuntimeDashboard(database, "gm-owner", seeded.campaignId, { dashboard: { rationsDays: 1 } });
    const beforeFailure = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    database.exec(`CREATE TRIGGER reject_restore_personnel BEFORE INSERT ON personnel
      BEGIN SELECT RAISE(ABORT, 'injected restore failure'); END`);
    assert.throws(() => restoreRuntimeSave(database, "gm-owner", seeded.campaignId, backup, {
      confirmReplace: true,
      confirmOlderBackup: true,
      expectedRevision: beforeFailure.campaign.revision
    }), /injected restore failure/);
    const afterFailure = getRuntimeDashboard(database, "gm-owner", seeded.campaignId);
    assert.equal(afterFailure.dashboard.rationsDays, 1);
    assert.equal(afterFailure.campaign.revision, beforeFailure.campaign.revision);
    assert.equal(afterFailure.personnel.length, beforeFailure.personnel.length);
  } finally {
    database.close();
  }
});

test("runtime backups and restores are isolated to the campaign owner", () => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    createGm(database, "other-gm", "other-gm");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const backup = exportRuntimeSave(database, "gm-owner", seeded.campaignId);
    const revision = getRuntimeDashboard(database, "gm-owner", seeded.campaignId).campaign.revision;
    assert.ok(backup);
    assert.equal(exportRuntimeSave(database, "other-gm", seeded.campaignId), null);
    assert.throws(() => restoreRuntimeSave(database, "other-gm", seeded.campaignId, backup, {
      confirmReplace: true,
      expectedRevision: revision
    }), /Runtime campaign not found/);
  } finally {
    database.close();
  }
});

test("runtime backup HTTP routes export and restore only for the owning GM", async (t) => {
  const database = openRuntimeDatabase();
  try {
    createGm(database, "gm-owner", "gm-owner");
    createGm(database, "other-gm", "other-gm");
    const seeded = seedSampleRuntime(database, "gm-owner");
    const timestamp = new Date().toISOString();
    const ownerToken = randomBytes(32).toString("base64url");
    const otherToken = randomBytes(32).toString("base64url");
    database.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(createHash("sha256").update(ownerToken).digest("hex"), "gm-owner", timestamp, "2099-01-01T00:00:00.000Z");
    database.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(createHash("sha256").update(otherToken).digest("hex"), "other-gm", timestamp, "2099-01-01T00:00:00.000Z");
    const server = http.createServer(createAppHandler({ database, authHandler: createAuthHandler({ database }) }));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(() => resolve())));
    const origin = `http://127.0.0.1:${server.address().port}`;

    const exportResponse = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/backup`, {
      headers: { Cookie: `fieldbook_session=${ownerToken}` }
    });
    assert.equal(exportResponse.status, 200);
    const backup = (await exportResponse.json()).backup;
    assert.equal(backup.backupType, "fieldbook.campaign-runtime");

    const otherExport = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/backup`, {
      headers: { Cookie: `fieldbook_session=${otherToken}` }
    });
    assert.equal(otherExport.status, 404);

    const currentRevision = getRuntimeDashboard(database, "gm-owner", seeded.campaignId).campaign.revision;
    const updateResponse = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/runtime`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${ownerToken}` },
      body: JSON.stringify({ dashboard: { rationsDays: 2 } })
    });
    assert.equal(updateResponse.status, 200);

    const conflict = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${ownerToken}` },
      body: JSON.stringify({ backup, confirmReplace: true, confirmOlderBackup: true, expectedRevision: currentRevision })
    });
    assert.equal(conflict.status, 409);

    const invalidBackup = { ...backup, checksum: "0".repeat(64) };
    const invalidRestore = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${ownerToken}` },
      body: JSON.stringify({ backup: invalidBackup, confirmReplace: true, confirmOlderBackup: true, expectedRevision: currentRevision + 1 })
    });
    assert.equal(invalidRestore.status, 422);
    assert.equal(getRuntimeDashboard(database, "gm-owner", seeded.campaignId).dashboard.rationsDays, 2);

    const otherRestore = await fetch(`${origin}/api/campaigns/${seeded.campaignId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `fieldbook_session=${otherToken}` },
      body: JSON.stringify({ backup, confirmReplace: true, confirmOlderBackup: true, expectedRevision: currentRevision + 1 })
    });
    assert.equal(otherRestore.status, 404);
  } finally {
    database.close();
  }
});
