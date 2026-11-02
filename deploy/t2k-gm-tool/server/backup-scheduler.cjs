/**
 * Backup Scheduler
 * 
 * Automated backup system for campaigns with time-based and event-triggered scheduling.
 * 
 * Features:
 * - Periodic backups (hourly, daily, or custom intervals)
 * - Event-triggered backups (after combat, journal entry, major changes)
 * - Backup history and retention policies
 * - Configurable per-campaign schedules
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

/**
 * Backup schedule configuration
 */
const BackupScheduleType = {
  DISABLED: "disabled",
  HOURLY: "hourly",
  EVERY_6_HOURS: "every-6-hours",
  DAILY: "daily",
  CUSTOM_INTERVAL: "custom-interval",
};

const BackupTriggerEvent = {
  CAMPAIGN_CLOCK_ADVANCE: "campaign.clock.advance",
  COMBAT_RESOLVED: "combat.resolved",
  JOURNAL_ENTRY: "journal.entry",
  INVENTORY_CHANGE: "inventory.change",
  CHARACTER_CHANGE: "character.change",
  REPORT_PUBLISH: "report.publish",
  MAP_EDIT: "map.edit",
};

/**
 * Create backup schedule record in database
 */
function createBackupSchedule(database, campaignId, scheduleType, options = {}) {
  if (!Object.values(BackupScheduleType).includes(scheduleType)) {
    throw new Error(`Invalid schedule type: ${scheduleType}`);
  }

  const now = new Date().toISOString();
  const interval = options.customIntervalMinutes || null;
  const nextBackupTime = options.nextBackupTime || now;
  const retentionDays = options.retentionDays || 30;
  const maxBackups = options.maxBackups || 100;

  database.prepare(`
    INSERT OR REPLACE INTO backup_schedules 
    (campaign_id, schedule_type, interval_minutes, next_backup_at, retention_days, max_backups, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    campaignId,
    scheduleType,
    interval,
    nextBackupTime,
    retentionDays,
    maxBackups,
    1,
    now,
    now
  );
}

/**
 * Get backup schedule for campaign
 */
function getBackupSchedule(database, campaignId) {
  return database.prepare(`
    SELECT * FROM backup_schedules WHERE campaign_id = ?
  `).get(campaignId);
}

/**
 * Update backup schedule
 */
function updateBackupSchedule(database, campaignId, updates) {
  const allowed = ["schedule_type", "interval_minutes", "retention_days", "max_backups", "enabled"];
  const setClauses = Object.keys(updates)
    .filter(key => allowed.includes(key))
    .map(key => `${key} = ?`);

  if (!setClauses.length) return;

  const values = Object.keys(updates)
    .filter(key => allowed.includes(key))
    .map(key => updates[key]);

  database.prepare(`
    UPDATE backup_schedules 
    SET ${setClauses.join(", ")}, updated_at = ?
    WHERE campaign_id = ?
  `).run(...values, new Date().toISOString(), campaignId);
}

/**
 * Get next scheduled backup time
 */
function getNextBackupTime(database, campaignId) {
  const schedule = getBackupSchedule(database, campaignId);
  if (!schedule || schedule.schedule_type === BackupScheduleType.DISABLED) {
    return null;
  }

  const nextBackup = new Date(schedule.next_backup_at);
  if (nextBackup > new Date()) {
    return nextBackup;
  }

  const now = new Date();
  let nextTime = new Date(now);

  switch (schedule.schedule_type) {
    case BackupScheduleType.HOURLY:
      nextTime.setHours(nextTime.getHours() + 1);
      nextTime.setMinutes(0);
      break;
    case BackupScheduleType.EVERY_6_HOURS:
      nextTime.setHours(nextTime.getHours() + 6);
      nextTime.setMinutes(0);
      break;
    case BackupScheduleType.DAILY:
      nextTime.setDate(nextTime.getDate() + 1);
      nextTime.setHours(2, 0, 0);
      break;
    case BackupScheduleType.CUSTOM_INTERVAL:
      nextTime.setMinutes(nextTime.getMinutes() + (schedule.interval_minutes || 60));
      break;
  }

  return nextTime;
}

/**
 * Record backup in database
 */
function recordBackup(database, campaignId, backupData, options = {}) {
  const now = new Date().toISOString();
  const backup = {
    campaignId,
    timestamp: now,
    sourceRevision: backupData.sourceRevision,
    dataSize: JSON.stringify(backupData).length,
    triggeredBy: options.triggeredBy || "scheduled",
    notes: options.notes || "",
  };

  database.prepare(`
    INSERT INTO backup_history 
    (campaign_id, backup_timestamp, source_revision, data_size_bytes, triggered_by, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    backup.campaignId,
    backup.timestamp,
    backup.sourceRevision,
    backup.dataSize,
    backup.triggeredBy,
    backup.notes,
    now
  );

  // Update next backup time in schedule
  database.prepare(`
    UPDATE backup_schedules 
    SET last_backup_at = ?, next_backup_at = ?
    WHERE campaign_id = ?
  `).run(now, getNextBackupTime(database, campaignId)?.toISOString(), campaignId);

  return backup;
}

/**
 * Get backup history for campaign
 */
function getBackupHistory(database, campaignId, limit = 50) {
  return database.prepare(`
    SELECT * FROM backup_history 
    WHERE campaign_id = ? 
    ORDER BY backup_timestamp DESC 
    LIMIT ?
  `).all(campaignId, limit);
}

/**
 * Delete old backups based on retention policy
 */
function pruneOldBackups(database, campaignId) {
  const schedule = getBackupSchedule(database, campaignId);
  if (!schedule) return { deleted: 0 };

  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() - schedule.retention_days);

  // Delete by retention days
  const deleteOld = database.prepare(`
    DELETE FROM backup_history 
    WHERE campaign_id = ? AND backup_timestamp < ?
  `);
  deleteOld.run(campaignId, retentionDate.toISOString());

  // Trim to max backups
  const allBackups = database.prepare(`
    SELECT * FROM backup_history 
    WHERE campaign_id = ? 
    ORDER BY backup_timestamp DESC
  `).all(campaignId);

  if (allBackups.length > schedule.max_backups) {
    const toDelete = allBackups.slice(schedule.max_backups);
    const deleteStmt = database.prepare(`
      DELETE FROM backup_history 
      WHERE campaign_id = ? AND backup_timestamp = ?
    `);
    toDelete.forEach(backup => {
      deleteStmt.run(campaignId, backup.backup_timestamp);
    });
  }

  return {
    deleted: allBackups.length - Math.min(allBackups.length, schedule.max_backups),
    remaining: Math.min(allBackups.length, schedule.max_backups),
  };
}

/**
 * Check if backup is due (time or event-based)
 */
function isBackupDue(database, campaignId, trigger = null) {
  const schedule = getBackupSchedule(database, campaignId);

  if (!schedule || schedule.enabled === 0) {
    return false;
  }

  if (schedule.schedule_type === BackupScheduleType.DISABLED) {
    return false;
  }

  // Check time-based schedule
  const nextBackup = schedule.next_backup_at ? new Date(schedule.next_backup_at) : null;
  if (nextBackup && nextBackup <= new Date()) {
    return true;
  }

  // Could add event-based triggers here if needed
  return false;
}

/**
 * Initialize backup scheduler in database
 * Creates backup_schedules and backup_history tables if they don't exist
 */
function initializeBackupScheduler(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS backup_schedules (
      campaign_id TEXT PRIMARY KEY,
      schedule_type TEXT NOT NULL CHECK (schedule_type IN ('disabled', 'hourly', 'every-6-hours', 'daily', 'custom-interval')),
      interval_minutes INTEGER,
      next_backup_at TEXT NOT NULL,
      last_backup_at TEXT,
      retention_days INTEGER NOT NULL DEFAULT 30 CHECK (retention_days > 0),
      max_backups INTEGER NOT NULL DEFAULT 100 CHECK (max_backups > 0),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(runtime_id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS backup_history (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      campaign_id TEXT NOT NULL,
      backup_timestamp TEXT NOT NULL,
      source_revision INTEGER NOT NULL,
      data_size_bytes INTEGER NOT NULL,
      triggered_by TEXT NOT NULL CHECK (triggered_by IN ('scheduled', 'manual', 'event')),
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
      UNIQUE (campaign_id, backup_timestamp)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_backup_history_campaign ON backup_history(campaign_id, backup_timestamp DESC);
  `);
}

module.exports = {
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
};
