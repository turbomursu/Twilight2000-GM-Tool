/**
 * Campaign Mutation Hooks — Milestone 5a Phase 3
 * 
 * Integration layer that triggers automatic backups on campaign mutations.
 * Wraps mutation handlers to capture events and route them to backup automation.
 * 
 * No external dependencies. Works with existing DatabaseSync and backup modules.
 */

const { exportRuntimeSave, getRuntimeCampaign } = require("./runtime-store.cjs");
const {
  recordEventBackup,
  BackupAutomationTriggers,
} = require("./backup-automation.cjs");

/**
 * Create a backup-aware mutation handler that automatically records backups on success
 * 
 * @param {Object} options
 * @param {DatabaseSync} options.database
 * @param {string} options.campaignId
 * @param {string} options.accountId
 * @param {Function} options.mutationFn - Async function that performs the mutation
 * @param {string} options.eventType - Event type from BackupAutomationTriggers
 * @returns {Promise} Result from mutationFn
 */
async function withAutomaticBackup(options) {
  const { database, campaignId, accountId, mutationFn, eventType } = options;

  if (!mutationFn || typeof mutationFn !== "function") {
    throw new Error("mutationFn is required");
  }

  if (!eventType) {
    throw new Error("eventType is required");
  }

  // Execute the mutation
  const result = await mutationFn();

  // After successful mutation, attempt to record automatic backup
  try {
    const campaign = getRuntimeCampaign(database, accountId, campaignId);
    if (campaign) {
      // Export current state as backup
      const backup = exportRuntimeSave(database, accountId, campaignId);
      if (backup) {
        // Record in backup history with event trigger
        recordEventBackup(database, campaignId, eventType, {
          campaignId,
          timestamp: new Date().toISOString(),
          sourceRevision: campaign.revision,
          dataSize: JSON.stringify(backup).length,
          notes: `Automatic backup after ${eventType.split(".").pop()}`,
        });
      }
    }
  } catch (error) {
    // Log but don't fail the mutation
    console.error(`Failed to record automatic backup for ${campaignId}:`, error.message);
  }

  return result;
}

/**
 * Create handlers for all event-triggered mutations
 * Returns object with handler functions that can be passed to route handlers
 * 
 * @param {DatabaseSync} database
 * @returns {Object} Handlers for { onCombatResolved, onJournalEntry, onInventoryChange, onCharacterChange }
 */
function createMutationHandlers(database) {
  return {
    /**
     * Call after combat resolution to trigger automatic backup
     * @param {string} campaignId
     * @param {string} accountId
     * @param {Object} combatResult - Result from combat resolution
     */
    onCombatResolved(campaignId, accountId, combatResult) {
      if (!campaignId || !accountId) return;

      try {
        const campaign = getRuntimeCampaign(database, accountId, campaignId);
        if (campaign) {
          const backup = exportRuntimeSave(database, accountId, campaignId);
          if (backup) {
            recordEventBackup(database, campaignId, BackupAutomationTriggers.COMBAT_RESOLVED, {
              campaignId,
              timestamp: new Date().toISOString(),
              sourceRevision: campaign.revision,
              dataSize: JSON.stringify(backup).length,
              notes: `Combat: ${combatResult.combat_type || "combat"} resolved`,
            });
          }
        }
      } catch (error) {
        console.error(`Combat backup failed for ${campaignId}:`, error.message);
      }
    },

    /**
     * Call after journal entry to trigger automatic backup
     * @param {string} campaignId
     * @param {string} accountId
     * @param {Object} journalEntry - Journal entry data
     */
    onJournalEntry(campaignId, accountId, journalEntry) {
      if (!campaignId || !accountId) return;

      try {
        const campaign = getRuntimeCampaign(database, accountId, campaignId);
        if (campaign) {
          const backup = exportRuntimeSave(database, accountId, campaignId);
          if (backup) {
            recordEventBackup(database, campaignId, BackupAutomationTriggers.JOURNAL_ENTRY, {
              campaignId,
              timestamp: new Date().toISOString(),
              sourceRevision: campaign.revision,
              dataSize: JSON.stringify(backup).length,
              notes: `Journal entry: ${journalEntry.title || "entry"} created`,
            });
          }
        }
      } catch (error) {
        console.error(`Journal backup failed for ${campaignId}:`, error.message);
      }
    },

    /**
     * Call after inventory change to trigger automatic backup
     * @param {string} campaignId
     * @param {string} accountId
     * @param {Object} change - Inventory change details
     */
    onInventoryChange(campaignId, accountId, change) {
      if (!campaignId || !accountId) return;

      try {
        const campaign = getRuntimeCampaign(database, accountId, campaignId);
        if (campaign) {
          const backup = exportRuntimeSave(database, accountId, campaignId);
          if (backup) {
            recordEventBackup(database, campaignId, BackupAutomationTriggers.INVENTORY_CHANGE, {
              campaignId,
              timestamp: new Date().toISOString(),
              sourceRevision: campaign.revision,
              dataSize: JSON.stringify(backup).length,
              notes: `Inventory: ${change.itemName || "item"} ${change.action || "modified"}`,
            });
          }
        }
      } catch (error) {
        console.error(`Inventory backup failed for ${campaignId}:`, error.message);
      }
    },

    /**
     * Call after character change approval to trigger automatic backup
     * @param {string} campaignId
     * @param {string} accountId
     * @param {string} characterName
     */
    onCharacterChange(campaignId, accountId, characterName) {
      if (!campaignId || !accountId) return;

      try {
        const campaign = getRuntimeCampaign(database, accountId, campaignId);
        if (campaign) {
          const backup = exportRuntimeSave(database, accountId, campaignId);
          if (backup) {
            recordEventBackup(database, campaignId, BackupAutomationTriggers.CHARACTER_CHANGE, {
              campaignId,
              timestamp: new Date().toISOString(),
              sourceRevision: campaign.revision,
              dataSize: JSON.stringify(backup).length,
              notes: `Character: ${characterName || "character"} change approved`,
            });
          }
        }
      } catch (error) {
        console.error(`Character backup failed for ${campaignId}:`, error.message);
      }
    },
  };
}

module.exports = {
  withAutomaticBackup,
  createMutationHandlers,
};
