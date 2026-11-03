/**
 * Backup Automation Module — Milestone 5a Phase 3
 * 
 * Automatic backup recording triggered by campaign mutations:
 * - Event-based triggers (combat, journal, inventory, character changes)
 * - Scheduled backup execution via background task runner
 * - Event dispatcher for routing mutations to backup system
 * 
 * No external dependencies. All operations are deterministic database queries.
 */

/**
 * Backup trigger event types (subset of BackupTriggerEvent from backup-scheduler.cjs)
 * Exported as convenience for automation workflow
 */
const BackupAutomationTriggers = {
  CAMPAIGN_CLOCK_ADVANCE: "campaign.clock.advance",
  COMBAT_RESOLVED: "combat.resolved",
  JOURNAL_ENTRY: "journal.entry",
  INVENTORY_CHANGE: "inventory.change",
  CHARACTER_CHANGE: "character.change",
  REPORT_PUBLISH: "report.publish",
  MAP_EDIT: "map.edit",
};

/**
 * Get all available backup trigger event types
 * @returns {string[]} Array of trigger event types
 */
function getAllBackupTriggerEvents() {
  return Object.values(BackupAutomationTriggers);
}

/**
 * Record automatic backup triggered by a campaign event
 * 
 * @param {DatabaseSync} database
 * @param {string} campaignId
 * @param {string} eventType - Event type from BackupTriggerEvent
 * @param {Object} backupData
 * @param {string} backupData.campaignId
 * @param {string} backupData.timestamp - ISO timestamp
 * @param {number} backupData.sourceRevision - Campaign revision number
 * @param {number} backupData.dataSize - Size in bytes
 * @param {string} backupData.notes - Optional notes
 * @returns {Object} Recorded backup entry
 */
function recordEventBackup(database, campaignId, eventType, backupData) {
  if (!eventType) {
    throw new Error("Event type required for automatic backup");
  }

  if (!backupData.timestamp || !Number.isInteger(backupData.sourceRevision)) {
    throw new Error("Backup data must include timestamp and sourceRevision");
  }

  // Record the backup with event trigger tracking
  const now = new Date().toISOString();
  const eventLabel = `event:${eventType.split(".").pop()}`;
  const notes = `${eventLabel}: ${backupData.notes || ""}`.trim();

  database.prepare(`
    INSERT INTO backup_history 
    (campaign_id, backup_timestamp, source_revision, data_size_bytes, triggered_by, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    campaignId,
    backupData.timestamp,
    backupData.sourceRevision,
    backupData.dataSize,
    "event",
    notes,
    now
  );

  // Update schedule's last backup time
  database.prepare(`
    UPDATE backup_schedules 
    SET last_backup_at = ?
    WHERE campaign_id = ?
  `).run(now, campaignId);

  return {
    campaignId,
    timestamp: backupData.timestamp,
    sourceRevision: backupData.sourceRevision,
    dataSize: backupData.dataSize,
    triggeredBy: "event",
    eventType,
    notes,
    recordedAt: now,
  };
}

/**
 * Process all due scheduled backups for given campaigns
 * Called by background task runner at regular intervals
 * 
 * @param {DatabaseSync} database
 * @param {string[]} campaignIds - List of campaign IDs to check
 * @param {Function} backupExporter - Function(campaignId) -> backup object
 *   Exported backup must include: { campaignId, timestamp, sourceRevision, dataSize, triggeredBy, notes }
 * @returns {Object} Summary { processed: count, skipped: count, errors: [] }
 */
function processScheduledBackups(database, campaignIds, backupExporter) {
  const summary = {
    processed: 0,
    skipped: 0,
    errors: [],
  };

  if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
    return summary;
  }

  campaignIds.forEach((campaignId) => {
    try {
      const schedule = database.prepare(`
        SELECT * FROM backup_schedules WHERE campaign_id = ?
      `).get(campaignId);

      // Skip if no schedule, disabled, or not due
      if (!schedule || schedule.enabled === 0) {
        summary.skipped++;
        return;
      }

      if (schedule.schedule_type === "disabled") {
        summary.skipped++;
        return;
      }

      const nextBackup = schedule.next_backup_at ? new Date(schedule.next_backup_at) : null;
      if (!nextBackup || nextBackup > new Date()) {
        summary.skipped++;
        return;
      }

      // Export and record backup
      const backup = backupExporter(campaignId);
      if (!backup) {
        summary.errors.push({
          campaignId,
          error: "Backup exporter returned null",
        });
        return;
      }

      const now = new Date().toISOString();

      // Record in backup history
      database.prepare(`
        INSERT INTO backup_history 
        (campaign_id, backup_timestamp, source_revision, data_size_bytes, triggered_by, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        campaignId,
        backup.timestamp,
        backup.sourceRevision,
        backup.dataSize,
        "scheduled",
        backup.notes || "Scheduled backup execution",
        now
      );

      // Calculate next backup time based on schedule type
      const nextTime = calculateNextBackupTime(schedule);

      // Update schedule
      database.prepare(`
        UPDATE backup_schedules 
        SET last_backup_at = ?, next_backup_at = ?, updated_at = ?
        WHERE campaign_id = ?
      `).run(nextTime, nextTime, now, campaignId);

      summary.processed++;
    } catch (error) {
      summary.errors.push({
        campaignId,
        error: error.message,
      });
    }
  });

  // Prune old backups for each campaign
  campaignIds.forEach((campaignId) => {
    try {
      pruneBackupsForCampaign(database, campaignId);
    } catch (error) {
      // Log but don't fail
      console.error(`Failed to prune backups for ${campaignId}:`, error.message);
    }
  });

  return summary;
}

/**
 * Calculate next backup time based on schedule type
 * @param {Object} schedule - Backup schedule record
 * @returns {string} ISO timestamp of next backup time
 */
function calculateNextBackupTime(schedule) {
  const now = new Date();

  switch (schedule.schedule_type) {
    case "hourly": {
      const next = new Date(now);
      next.setHours(next.getHours() + 1);
      next.setMinutes(0, 0, 0);
      return next.toISOString();
    }

    case "every-6-hours": {
      const hour = now.getHours();
      let nextHour = (Math.floor(hour / 6) + 1) * 6;
      if (nextHour >= 24) nextHour = 0;

      const next = new Date(now);
      next.setHours(nextHour, 0, 0, 0);
      if (nextHour === 0) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }

    case "daily": {
      const next = new Date(now);
      next.setUTCHours(2, 0, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next.toISOString();
    }

    case "custom-interval": {
      if (!schedule.interval_minutes || schedule.interval_minutes <= 0) {
        throw new Error("Custom interval schedule must have interval_minutes > 0");
      }
      const next = new Date(now.getTime() + schedule.interval_minutes * 60 * 1000);
      return next.toISOString();
    }

    default:
      throw new Error(`Unknown schedule type: ${schedule.schedule_type}`);
  }
}

/**
 * Prune old backups for a campaign based on retention policy
 * @param {DatabaseSync} database
 * @param {string} campaignId
 * @returns {Object} Pruning summary { deletedByAge: number, deletedByCount: number }
 */
function pruneBackupsForCampaign(database, campaignId) {
  const schedule = database.prepare(`
    SELECT * FROM backup_schedules WHERE campaign_id = ?
  `).get(campaignId);

  if (!schedule) {
    return { deletedByAge: 0, deletedByCount: 0 };
  }

  let deletedByAge = 0;
  let deletedByCount = 0;

  // Delete by age
  if (schedule.retention_days && schedule.retention_days > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - schedule.retention_days);

    const result = database.prepare(`
      DELETE FROM backup_history 
      WHERE campaign_id = ? AND backup_timestamp < ?
    `);
    deletedByAge = result.run(campaignId, cutoffDate.toISOString()).changes;
  }

  // Trim to max backups (keep newest)
  if (schedule.max_backups && schedule.max_backups > 0) {
    const allBackups = database.prepare(`
      SELECT backup_timestamp FROM backup_history 
      WHERE campaign_id = ? 
      ORDER BY backup_timestamp DESC
    `).all(campaignId);

    if (allBackups.length > schedule.max_backups) {
      const toDelete = allBackups.slice(schedule.max_backups);
      const stmt = database.prepare(`
        DELETE FROM backup_history 
        WHERE campaign_id = ? AND backup_timestamp = ?
      `);
      
      toDelete.forEach((backup) => {
        deletedByCount += stmt.run(campaignId, backup.backup_timestamp).changes;
      });
    }
  }

  return { deletedByAge, deletedByCount };
}

/**
 * Initialize backup automation database tables and config
 * @param {DatabaseSync} database
 */
function initializeBackupAutomation(database) {
  // Automation tables would be created here if needed for advanced features
  // For Phase 3, all data is stored in existing backup_schedules and backup_history tables
  // This function is a placeholder for future expansion (event subscription registry, etc.)
  
  // Verify backup_schedules exists (created by backup-scheduler)
  const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='backup_schedules'
  `).all();

  if (tables.length === 0) {
    throw new Error("backup_schedules table not found. Call initializeBackupScheduler() first.");
  }
}

/**
 * Create background task runner for scheduled backups
 * Returns a controller object that can be started and stopped
 * 
 * @param {DatabaseSync} database
 * @param {Object} options
 * @param {number} options.intervalMs - Check interval in milliseconds (default 60000 = 1 minute)
 * @param {Function} options.backupExporter - Function(campaignId) -> backup object
 * @param {string[]} options.campaignIds - List of campaign IDs to monitor
 * @returns {Object} Runner controller { start(), stop(), isRunning() }
 */
function createBackupRunner(database, options = {}) {
  const intervalMs = options.intervalMs || 60000; // 1 minute default
  const backupExporter = options.backupExporter || (() => null);
  const campaignIds = options.campaignIds || [];

  let intervalHandle = null;
  let isRunning = false;

  return {
    start() {
      if (isRunning) return;
      isRunning = true;

      intervalHandle = setInterval(() => {
        try {
          processScheduledBackups(database, campaignIds, backupExporter);
        } catch (error) {
          console.error("Backup runner error:", error.message);
        }
      }, intervalMs);
    },

    stop() {
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
      }
      isRunning = false;
    },

    isRunning() {
      return isRunning;
    },

    updateCampaigns(newCampaignIds) {
      campaignIds.length = 0;
      if (Array.isArray(newCampaignIds)) {
        campaignIds.push(...newCampaignIds);
      }
    },
  };
}

module.exports = {
  BackupAutomationTriggers,
  getAllBackupTriggerEvents,
  recordEventBackup,
  processScheduledBackups,
  calculateNextBackupTime,
  pruneBackupsForCampaign,
  initializeBackupAutomation,
  createBackupRunner,
};
