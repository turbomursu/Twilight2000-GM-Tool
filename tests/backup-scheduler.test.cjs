const test = require("node:test");
const assert = require("node:assert");
const { DatabaseSync } = require("node:sqlite");
const { tmpdir } = require("node:os");
const { randomUUID } = require("node:crypto");
const { join } = require("node:path");
const { unlinkSync } = require("node:fs");

const {
  BackupScheduleType,
  BackupTriggerEvent,
  createBackupSchedule,
  getBackupSchedule,
  updateBackupSchedule,
  getNextBackupTime,
  recordBackup,
  getBackupHistory,
  pruneOldBackups,
  isBackupDue,
  initializeBackupScheduler,
} = require("../server/backup-scheduler.cjs");

// Setup test database
function setupDatabase() {
  const testDbPath = join(tmpdir(), `test-backup-${randomUUID()}.db`);
  const database = new DatabaseSync(testDbPath);
  database.exec("PRAGMA journal_mode = WAL");

  // Create campaigns table (required for FK constraint)
  database.exec(`
    CREATE TABLE campaigns (
      runtime_id TEXT PRIMARY KEY,
      setup_campaign_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      name TEXT NOT NULL,
      setting TEXT NOT NULL,
      premise TEXT NOT NULL,
      era TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
  `);

  // Initialize backup scheduler
  initializeBackupScheduler(database);

  return { database, testDbPath };
}

function insertCampaign(database, campaignId, suffix = "") {
  database.prepare(`
    INSERT INTO campaigns 
    (runtime_id, setup_campaign_id, schema_version, name, setting, premise, era, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    campaignId,
    `test-setup-${suffix}`,
    1,
    `Test Campaign ${suffix}`,
    "Europe",
    "Soviet invasion",
    "2000-07",
    new Date().toISOString(),
    new Date().toISOString()
  );
}

test("Backup Scheduler", async (t) => {
  await t.test("Schedule Types", async (t) => {
    await t.test("should have valid schedule type constants", () => {
      assert.equal(BackupScheduleType.DISABLED, "disabled");
      assert.equal(BackupScheduleType.HOURLY, "hourly");
      assert.equal(BackupScheduleType.EVERY_6_HOURS, "every-6-hours");
      assert.equal(BackupScheduleType.DAILY, "daily");
      assert.equal(BackupScheduleType.CUSTOM_INTERVAL, "custom-interval");
    });

    await t.test("should have valid trigger event constants", () => {
      assert(Object.keys(BackupTriggerEvent).length > 0);
      assert.equal(BackupTriggerEvent.COMBAT_RESOLVED, "combat.resolved");
    });
  });

  await t.test("Creating Schedules", async (t) => {
    await t.test("should create hourly backup schedule", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "hourly");

        createBackupSchedule(database, cid, BackupScheduleType.HOURLY);

        const schedule = getBackupSchedule(database, cid);
        assert(schedule);
        assert.equal(schedule.schedule_type, BackupScheduleType.HOURLY);
        assert.equal(schedule.enabled, 1);
        assert.equal(schedule.retention_days, 30);
        assert.equal(schedule.max_backups, 100);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should create daily backup schedule with custom retention", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "daily");

        createBackupSchedule(database, cid, BackupScheduleType.DAILY, {
          retentionDays: 60,
          maxBackups: 50,
        });

        const schedule = getBackupSchedule(database, cid);
        assert.equal(schedule.schedule_type, BackupScheduleType.DAILY);
        assert.equal(schedule.retention_days, 60);
        assert.equal(schedule.max_backups, 50);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should create custom interval backup schedule", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "custom");

        createBackupSchedule(database, cid, BackupScheduleType.CUSTOM_INTERVAL, {
          customIntervalMinutes: 120,
        });

        const schedule = getBackupSchedule(database, cid);
        assert.equal(schedule.schedule_type, BackupScheduleType.CUSTOM_INTERVAL);
        assert.equal(schedule.interval_minutes, 120);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should reject invalid schedule type", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "invalid");

        assert.throws(() => {
          createBackupSchedule(database, cid, "invalid-type");
        });
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });
  });

  await t.test("Updating Schedules", async (t) => {
    await t.test("should update schedule type", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "update-type");

        createBackupSchedule(database, cid, BackupScheduleType.HOURLY);
        updateBackupSchedule(database, cid, { schedule_type: BackupScheduleType.DAILY });

        const schedule = getBackupSchedule(database, cid);
        assert.equal(schedule.schedule_type, BackupScheduleType.DAILY);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should disable schedule", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "disable");

        createBackupSchedule(database, cid, BackupScheduleType.DAILY);
        updateBackupSchedule(database, cid, { enabled: 0 });

        const schedule = getBackupSchedule(database, cid);
        assert.equal(schedule.enabled, 0);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should update retention days", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "retention");

        createBackupSchedule(database, cid, BackupScheduleType.DAILY);
        updateBackupSchedule(database, cid, { retention_days: 90 });

        const schedule = getBackupSchedule(database, cid);
        assert.equal(schedule.retention_days, 90);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });
  });

  await t.test("Next Backup Time Calculation", async (t) => {
    await t.test("should return null for disabled schedules", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "disabled");

        createBackupSchedule(database, cid, BackupScheduleType.DISABLED);

        const next = getNextBackupTime(database, cid);
        assert.equal(next, null);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should calculate next hourly backup", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "next-hourly");

        createBackupSchedule(database, cid, BackupScheduleType.HOURLY);

        const next = getNextBackupTime(database, cid);
        assert(next instanceof Date);
        assert(next > new Date());
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should calculate next daily backup", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "next-daily");

        createBackupSchedule(database, cid, BackupScheduleType.DAILY);

        const next = getNextBackupTime(database, cid);
        assert(next instanceof Date);
        assert.equal(next.getHours(), 2); // 2:00 AM
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });
  });

  await t.test("Recording Backups", async (t) => {
    await t.test("should record backup in history", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "record");

        createBackupSchedule(database, cid, BackupScheduleType.HOURLY);

        const backupData = { sourceRevision: 5 };
        const backup = recordBackup(database, cid, backupData, { triggeredBy: "scheduled" });

        assert(backup);
        assert.equal(backup.campaignId, cid);
        assert.equal(backup.sourceRevision, 5);
        assert.equal(backup.triggeredBy, "scheduled");
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should record manual backup", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "manual");

        createBackupSchedule(database, cid, BackupScheduleType.DAILY);

        const backupData = { sourceRevision: 3 };
        const backup = recordBackup(database, cid, backupData, { 
          triggeredBy: "manual",
          notes: "Pre-combat backup"
        });

        assert.equal(backup.triggeredBy, "manual");
        assert.equal(backup.notes, "Pre-combat backup");
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });
  });

  await t.test("Backup History", async (t) => {
    await t.test("should retrieve empty history for new campaign", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "empty-history");

        const history = getBackupHistory(database, cid);
        assert.equal(history.length, 0);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should retrieve backup history", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "history");

        createBackupSchedule(database, cid, BackupScheduleType.HOURLY);

        recordBackup(database, cid, { sourceRevision: 1 });
        recordBackup(database, cid, { sourceRevision: 2 });
        recordBackup(database, cid, { sourceRevision: 3 });

        const history = getBackupHistory(database, cid);
        assert.equal(history.length, 3);
        // Most recent first
        assert.equal(history[0].source_revision, 3);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should respect history limit", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "history-limit");

        createBackupSchedule(database, cid, BackupScheduleType.HOURLY);

        for (let i = 1; i <= 10; i++) {
          recordBackup(database, cid, { sourceRevision: i });
        }

        const history = getBackupHistory(database, cid, 5);
        assert.equal(history.length, 5);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });
  });

  await t.test("Backup Pruning", async (t) => {
    await t.test("should return 0 deleted for new campaign", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "prune-empty");

        const result = pruneOldBackups(database, cid);
        assert.equal(result.deleted, 0);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should prune backups exceeding max_backups", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "prune-max");

        createBackupSchedule(database, cid, BackupScheduleType.HOURLY, { maxBackups: 3 });

        for (let i = 1; i <= 10; i++) {
          recordBackup(database, cid, { sourceRevision: i });
        }

        const result = pruneOldBackups(database, cid);
        assert.equal(result.deleted, 7);
        assert.equal(result.remaining, 3);

        const history = getBackupHistory(database, cid, 100);
        assert.equal(history.length, 3);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });
  });

  await t.test("Checking if Backup is Due", async (t) => {
    await t.test("should return false for disabled schedule", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();
        insertCampaign(database, cid, "due-disabled");

        createBackupSchedule(database, cid, BackupScheduleType.DISABLED);

        assert.equal(isBackupDue(database, cid), false);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });

    await t.test("should return false for missing schedule", () => {
      const { database, testDbPath } = setupDatabase();
      try {
        const cid = randomUUID();

        assert.equal(isBackupDue(database, cid), false);
      } finally {
        database.close();
        try { unlinkSync(testDbPath); } catch {}
      }
    });
  });
});
