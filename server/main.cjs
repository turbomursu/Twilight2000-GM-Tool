const { mkdirSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const http = require("node:http");
const { createAppHandler } = require("./app.cjs");
const { createAuthHandler } = require("./auth.cjs");
const { openRuntimeDatabase } = require("./runtime-store.cjs");

function startServer(environment = process.env) {
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
  const port = Number(environment.FIELDBOOK_PORT || 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    database.close();
    throw new Error("FIELDBOOK_PORT must be an integer between 0 and 65535.");
  }

  const appHandler = createAppHandler({ database, authHandler: handler });
  const server = http.createServer(appHandler);
  server.on("close", () => database.close());
  server.listen(port, host, () => process.stdout.write(`Fieldbook LAN API listening on http://${host}:${server.address().port}\n`));
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