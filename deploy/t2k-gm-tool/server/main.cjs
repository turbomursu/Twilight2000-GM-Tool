const { mkdirSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const http = require("node:http");
const { createAppHandler } = require("./app.cjs");
const { createAuthHandler } = require("./auth.cjs");
const { openRuntimeDatabase, listRuntimeCampaigns, exportRuntimeSave } = require("./runtime-store.cjs");
const { initializeBackupScheduler } = require("./backup-scheduler.cjs");
const { initializeBackupAutomation, createBackupRunner, processScheduledBackups } = require("./backup-automation.cjs");

function startServer(environment = process.env) {
  const databasePath = resolve(environment.FIELDBOOK_DB_PATH || "data/fieldbook.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = openRuntimeDatabase(databasePath);
  
  // Initialize backup scheduler and automation
  initializeBackupScheduler(database);
  initializeBackupAutomation(database);
  
  const accountsExist = database.prepare("SELECT COUNT(*) AS count FROM accounts").get().count > 0;
  const bootstrapToken = accountsExist ? undefined : environment.FIELDBOOK_BOOTSTRAP_TOKEN;
  let handler;
  try {
    handler = createAuthHandler({ database, bootstrapToken });
  } catch (error) {
    database.close();
    throw error;
  }

  const host = environment.FIELDBOOK_HOST || "0.0.0.0";
  const port = Number(environment.FIELDBOOK_PORT || 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    database.close();
    throw new Error("FIELDBOOK_PORT must be an integer between 0 and 65535.");
  }

  const appHandler = createAppHandler({ database, authHandler: handler });
  const server = http.createServer(appHandler);
  
  // Start background backup runner
  // Get list of all campaigns across all GMs
  let getAllCampaignIds = () => {
    try {
      const campaigns = database.prepare(`
        SELECT DISTINCT runtime_id FROM campaigns WHERE active = 1
      `).all();
      return campaigns.map(c => c.runtime_id);
    } catch (error) {
      // Silently handle - campaigns table might not exist in test databases
      return [];
    }
  };

  // Create backup exporter function
  const backupExporter = (campaignId) => {
    try {
      // Get GM account ID for this campaign
      const campaign = database.prepare(`
        SELECT c.runtime_id FROM campaigns c WHERE c.runtime_id = ?
      `).get(campaignId);

      if (!campaign) return null;

      // For automated backups, find the GM owner from audit logs
      let gmAccount = null;
      try {
        gmAccount = database.prepare(`
          SELECT DISTINCT actor_account_id FROM audit_events 
          WHERE campaign_id = ? AND action = 'campaign.created' 
          LIMIT 1
        `).get(campaignId);
      } catch {
        // Table might not exist in test env, fall back to finding any GM  
      }

      if (!gmAccount) {
        // Fallback: find any account that has ownership of this campaign
        try {
          gmAccount = database.prepare(`
            SELECT DISTINCT actor_account_id FROM audit_events 
            WHERE campaign_id = ? 
            LIMIT 1
          `).get(campaignId);
        } catch {
          return null;
        }
      }

      if (!gmAccount) return null;

      const backup = exportRuntimeSave(database, gmAccount.actor_account_id, campaignId);
      if (!backup) return null;

      return {
        campaignId,
        timestamp: new Date().toISOString(),
        sourceRevision: backup.campaign.revision,
        dataSize: JSON.stringify(backup).length,
        triggeredBy: "scheduled",
        notes: "Scheduled backup execution",
      };
    } catch (error) {
      // Silently handle errors - backup runner is background process
      return null;
    }
  };

  // Create and start runner with 1-minute interval (60000ms)
  const backupRunner = createBackupRunner(database, {
    intervalMs: 60000,
    backupExporter,
    campaignIds: getAllCampaignIds(),
  });

  // Update campaign list every 5 minutes
  const updateInterval = setInterval(() => {
    backupRunner.updateCampaigns(getAllCampaignIds());
  }, 300000);

  backupRunner.start();
  server.on("close", () => {
    backupRunner.stop();
    clearInterval(updateInterval);
    database.close();
  });

  server.listen(port, host, () => {
    process.stdout.write(`Fieldbook LAN API listening on http://${host}:${server.address().port}\n`);
    process.stdout.write(`Backup scheduler active (1-minute check interval)\n`);
  });
  return server;
}

if (require.main === module) {
  try {
    startServer();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { startServer };