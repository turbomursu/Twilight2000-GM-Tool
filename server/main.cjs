const { mkdirSync, readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const https = require("node:https");
const { createAppHandler } = require("./app.cjs");
const { createAuthHandler } = require("./auth.cjs");
const { openRuntimeDatabase } = require("./runtime-store.cjs");

function startServer(environment = process.env) {
  const certificatePath = environment.FIELDBOOK_TLS_CERT;
  const privateKeyPath = environment.FIELDBOOK_TLS_KEY;
  if (!certificatePath || !privateKeyPath) {
    throw new Error("HTTPS is required. Set FIELDBOOK_TLS_CERT and FIELDBOOK_TLS_KEY before starting the LAN service.");
  }
  const certificate = readFileSync(resolve(certificatePath));
  const privateKey = readFileSync(resolve(privateKeyPath));
  const databasePath = resolve(environment.FIELDBOOK_DB_PATH || "data/fieldbook.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = openRuntimeDatabase(databasePath);
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
  const port = Number(environment.FIELDBOOK_PORT || 8443);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    database.close();
    throw new Error("FIELDBOOK_PORT must be an integer between 1 and 65535.");
  }

  const appHandler = createAppHandler({ database, authHandler: handler });
  const server = https.createServer({ cert: certificate, key: privateKey }, appHandler);
  server.on("close", () => database.close());
  server.listen(port, host, () => process.stdout.write(`Fieldbook auth API listening on https://${host}:${port}\n`));
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