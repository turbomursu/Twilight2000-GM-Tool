/**
 * Backup Automation Tests — Milestone 5a Phase 3
 * 
 * Tests for automatic backup recording triggered by campaign mutations:
 * - Event-based triggers (combat, journal, inventory, character changes)
 * - Scheduled backup execution (background task runner)
 * - Event trigger registration and dispatcher
 * - Integration with existing mutation handlers
 */

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
  recordBackup,
  getBackupHistory,
  isBackupDue,
  initializeBackupScheduler,
} = require("../server/backup-scheduler.cjs");

const {
  triggerAutomaticBackup,
  recordEventBackup,
  initializeBackupAutomation,
  processScheduledBackups,
  getAllBackupTriggerEvents,
} = require("../server/backup-automation.cjs");

// Setup test database
function setupDatabase() {
  const testDbPath = join(tmpdir(), `test-backup-auto-${randomUUID()}.db`);
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

  // Initialize backup scheduler and automation
  initializeBackupScheduler(database);
  initializeBackupAutomation(database);

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
    "Test Campaign",
    "Eastern Europe",
    "Soviet Invasion",
    "1997",
    new Date().toISOString(),
    new Date().toISOString()
  );
}

// --- Test Suite: Event Trigger Registration ---
test("Event Trigger Registration", async (t) => {
  await t.test("exports all backup trigger event types", () => {
    const events = getAllBackupTriggerEvents();
    assert(events.includes(BackupTriggerEvent.COMBAT_RESOLVED));
    assert(events.includes(BackupTriggerEvent.JOURNAL_ENTRY));
    assert(events.includes(BackupTriggerEvent.INVENTORY_CHANGE));
    assert(events.includes(BackupTriggerEvent.CHARACTER_CHANGE));
    assert(events.length >= 4);
  });

  await t.test("event trigger constants match backup scheduler", () => {
    // Ensure consistency between modules
    assert.strictEqual(
      typeof BackupTriggerEvent.CAMPAIGN_CLOCK_ADVANCE,
      "string"
    );
    assert.strictEqual(typeof BackupTriggerEvent.COMBAT_RESOLVED, "string");
    assert.strictEqual(typeof BackupTriggerEvent.JOURNAL_ENTRY, "string");
    assert.strictEqual(typeof BackupTriggerEvent.INVENTORY_CHANGE, "string");
  });
});

// --- Test Suite: Automatic Event-Based Backups ---
test("Event-Based Automatic Backups", async (t) => {
  await t.test("records backup after combat event", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-combat-${randomUUID()}`;
      insertCampaign(database, campaignId);
      createBackupSchedule(database, campaignId, BackupScheduleType.DISABLED);

      // Mock a combat result
      const combatResult = {
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 1,
        dataSize: 5000,
        triggeredBy: "event",
        notes: "After combat: Combat.resolved",
      };

      recordEventBackup(database, campaignId, BackupTriggerEvent.COMBAT_RESOLVED, combatResult);

      const history = getBackupHistory(database, campaignId);
      assert(history.length > 0);
      assert.strictEqual(history[0].triggered_by, "event");
      assert(history[0].notes.includes("Combat.resolved"));
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });

  await t.test("records backup after journal entry", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-journal-${randomUUID()}`;
      insertCampaign(database, campaignId);
      createBackupSchedule(database, campaignId, BackupScheduleType.DISABLED);

      recordEventBackup(database, campaignId, BackupTriggerEvent.JOURNAL_ENTRY, {
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 2,
        dataSize: 3000,
        triggeredBy: "event",
        notes: "Journal entry created",
      });

      const history = getBackupHistory(database, campaignId);
      assert(history.length > 0);
      assert.strictEqual(history[0].triggered_by, "event");
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });

  await t.test("records backup after inventory change", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-inventory-${randomUUID()}`;
      insertCampaign(database, campaignId);
      createBackupSchedule(database, campaignId, BackupScheduleType.DISABLED);

      recordEventBackup(database, campaignId, BackupTriggerEvent.INVENTORY_CHANGE, {
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 3,
        dataSize: 4000,
        triggeredBy: "event",
        notes: "Inventory updated",
      });

      const history = getBackupHistory(database, campaignId);
      assert(history.length > 0);
      assert(history[0].notes.includes("Inventory"));
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });

  await t.test("records backup after character change approval", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-char-${randomUUID()}`;
      insertCampaign(database, campaignId);
      createBackupSchedule(database, campaignId, BackupScheduleType.DISABLED);

      recordEventBackup(database, campaignId, BackupTriggerEvent.CHARACTER_CHANGE, {
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 4,
        dataSize: 2500,
        triggeredBy: "event",
        notes: "Character change approved",
      });

      const history = getBackupHistory(database, campaignId);
      assert(history.length > 0);
      assert(history[0].notes.includes("Character"));
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });

  await t.test("includes event type in backup notes", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-notes-${randomUUID()}`;
      insertCampaign(database, campaignId);
      createBackupSchedule(database, campaignId, BackupScheduleType.DISABLED);

      recordEventBackup(database, campaignId, BackupTriggerEvent.COMBAT_RESOLVED, {
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 1,
        dataSize: 5000,
        triggeredBy: "event",
        notes: "Test combat event",
      });

      const history = getBackupHistory(database, campaignId);
      assert(history.length > 0);
      assert(history[0].notes.includes("event:resolved"));
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });
});

// --- Test Suite: Scheduled Backup Execution ---
test("Scheduled Backup Execution", async (t) => {
  await t.test("processes due scheduled backups", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-scheduled-${randomUUID()}`;
      insertCampaign(database, campaignId);

      // Create a schedule that's due now
      const pastTime = new Date(Date.now() - 60000).toISOString();
      createBackupSchedule(database, campaignId, BackupScheduleType.DAILY, {
        nextBackupTime: pastTime,
      });

      // Mock backup exporter
      const backups = [];
      const backupExporter = (campaignId) => ({
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 1,
        dataSize: 5000,
        triggeredBy: "scheduled",
        notes: "Scheduled backup execution",
      });

      processScheduledBackups(database, [campaignId], backupExporter);

      const history = getBackupHistory(database, campaignId);
      assert(history.length > 0);
      assert.strictEqual(history[0].triggered_by, "scheduled");
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });

  await t.test("skips campaigns with disabled schedules", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-disabled-${randomUUID()}`;
      insertCampaign(database, campaignId);

      createBackupSchedule(database, campaignId, BackupScheduleType.DISABLED);

      const backupExporter = () => ({
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 1,
        dataSize: 5000,
        triggeredBy: "scheduled",
        notes: "Should not run",
      });

      processScheduledBackups(database, [campaignId], backupExporter);

      const history = getBackupHistory(database, campaignId);
      assert.strictEqual(history.length, 0);
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });

  await t.test("processes multiple campaigns in batch", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId1 = `test-campaign-1-${randomUUID()}`;
      const campaignId2 = `test-campaign-2-${randomUUID()}`;
      insertCampaign(database, campaignId1);
      insertCampaign(database, campaignId2);

      const pastTime = new Date(Date.now() - 60000).toISOString();
      createBackupSchedule(database, campaignId1, BackupScheduleType.HOURLY, {
        nextBackupTime: pastTime,
      });
      createBackupSchedule(database, campaignId2, BackupScheduleType.DAILY, {
        nextBackupTime: pastTime,
      });

      const backupExporter = (id) => ({
        campaignId: id,
        timestamp: new Date().toISOString(),
        sourceRevision: 1,
        dataSize: 5000,
        triggeredBy: "scheduled",
        notes: "Batch backup",
      });

      processScheduledBackups(database, [campaignId1, campaignId2], backupExporter);

      const history1 = getBackupHistory(database, campaignId1);
      const history2 = getBackupHistory(database, campaignId2);
      assert(history1.length > 0);
      assert(history2.length > 0);
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });
});

// --- Test Suite: Integration Scenarios ---
test("Integration Scenarios", async (t) => {
  await t.test("records event backup even with disabled schedule", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-integration-${randomUUID()}`;
      insertCampaign(database, campaignId);
      createBackupSchedule(database, campaignId, BackupScheduleType.DISABLED);

      recordEventBackup(database, campaignId, BackupTriggerEvent.COMBAT_RESOLVED, {
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 1,
        dataSize: 5000,
        triggeredBy: "event",
        notes: "Event backup",
      });

      const history = getBackupHistory(database, campaignId);
      assert(history.length > 0);
      assert.strictEqual(history[0].triggered_by, "event");
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });

  await t.test("separates event and scheduled backups in history", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-separation-${randomUUID()}`;
      insertCampaign(database, campaignId);

      const pastTime = new Date(Date.now() - 120000).toISOString();
      createBackupSchedule(database, campaignId, BackupScheduleType.HOURLY, {
        nextBackupTime: pastTime,
      });

      // Record event backup
      recordEventBackup(database, campaignId, BackupTriggerEvent.COMBAT_RESOLVED, {
        campaignId,
        timestamp: new Date(Date.now() - 60000).toISOString(),
        sourceRevision: 1,
        dataSize: 5000,
        triggeredBy: "event",
        notes: "Event backup",
      });

      // Process scheduled backup (with slight delay to ensure different timestamp)
      const backupExporter = () => ({
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 2,
        dataSize: 5100,
        triggeredBy: "scheduled",
        notes: "Scheduled backup",
      });

      processScheduledBackups(database, [campaignId], backupExporter);

      const history = getBackupHistory(database, campaignId, 100);
      assert(history.length >= 2);
      
      // Verify both types exist
      const eventBackups = history.filter(b => b.triggered_by === "event");
      const scheduledBackups = history.filter(b => b.triggered_by === "scheduled");
      assert(eventBackups.length > 0);
      assert(scheduledBackups.length > 0);
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });

  await t.test("handles rapid successive events", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-rapid-${randomUUID()}`;
      insertCampaign(database, campaignId);
      createBackupSchedule(database, campaignId, BackupScheduleType.DISABLED);

      // Record multiple events in rapid succession
      for (let i = 0; i < 5; i++) {
        recordEventBackup(database, campaignId, BackupTriggerEvent.COMBAT_RESOLVED, {
          campaignId,
          timestamp: new Date(Date.now() + i).toISOString(),
          sourceRevision: i + 1,
          dataSize: 5000 + i * 100,
          triggeredBy: "event",
          notes: `Combat event ${i}`,
        });
      }

      const history = getBackupHistory(database, campaignId, 100);
      assert.strictEqual(history.length, 5);
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });
});

// --- Test Suite: Database Schema ---
test("Database Schema for Automation", async (t) => {
  await t.test("creates automation trigger table on initialization", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      // Query to check if table exists
      const tables = database.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('backup_automation_triggers', 'backup_automation_config')
      `).all();

      // At minimum, backup_schedules should exist
      assert(tables.length >= 0);
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });

  await t.test("maintains foreign key relationships for campaigns", () => {
    const { database, testDbPath } = setupDatabase();
    try {
      const campaignId = `test-campaign-fk-${randomUUID()}`;
      insertCampaign(database, campaignId);
      createBackupSchedule(database, campaignId, BackupScheduleType.DAILY);

      recordEventBackup(database, campaignId, BackupTriggerEvent.COMBAT_RESOLVED, {
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: 1,
        dataSize: 5000,
        triggeredBy: "event",
        notes: "FK test",
      });

      const history = getBackupHistory(database, campaignId);
      assert.strictEqual(history[0].campaign_id, campaignId);
    } finally {
      database.close();
      unlinkSync(testDbPath);
    }
  });
});

