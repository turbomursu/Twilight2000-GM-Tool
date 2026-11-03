const { resolve } = require("node:path");
const { openRuntimeDatabase } = require("./runtime-store.cjs");
const { seedSampleRuntime } = require("./sample-data.cjs");

function parseArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--") || !argumentsList[index + 1] || argumentsList[index + 1].startsWith("--")) {
      throw new Error("Usage: node server/seed-sample.cjs --db <development-db-path> --gm <gm-username>");
    }
    options[argument.slice(2)] = argumentsList[index + 1];
    index += 1;
  }
  if (!options.db || !options.gm) throw new Error("Usage: node server/seed-sample.cjs --db <development-db-path> --gm <gm-username>");
  return options;
}

function seedSampleDatabase(argumentsList = process.argv.slice(2), environment = process.env) {
  const options = parseArguments(argumentsList);
  const databasePath = resolve(options.db);
  const liveDatabasePath = resolve(environment.FIELDBOOK_DB_PATH || "data/fieldbook.sqlite");
  if (databasePath.toLowerCase() === liveDatabasePath.toLowerCase()) {
    throw new Error("Refusing to seed the configured live database path. Choose a separate development database path.");
  }
  const database = openRuntimeDatabase(databasePath);
  try {
    const gm = database.prepare(`SELECT id FROM accounts
      WHERE login_identifier = ? COLLATE NOCASE AND global_role = 'gm' AND disabled = 0`).get(options.gm);
    if (!gm) throw new Error(`Active GM username '${options.gm}' was not found in ${databasePath}.`);
    return { databasePath, ...seedSampleRuntime(database, gm.id, { playerUsername: "sample-player" }) };
  } finally {
    database.close();
  }
}

if (require.main === module) {
  try {
    const result = seedSampleDatabase();
    process.stdout.write(`Seeded development campaign: ${result.campaignName} (${result.campaignId})\n`);
    process.stdout.write(`GM database: ${result.databasePath}\n`);
    process.stdout.write(`Player username: ${result.username} / seed status: ${result.seedStatus}\n`);
    if (result.activationToken) process.stdout.write(`One-time player activation token: ${result.activationToken}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { seedSampleDatabase };
