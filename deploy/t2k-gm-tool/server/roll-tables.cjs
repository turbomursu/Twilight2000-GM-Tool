const { validateRollTableCatalog } = require("../roll-table-contract.js");

class RollTableRevisionConflict extends Error {
  constructor() {
    super("The shared roll-table catalog changed. Reload it before importing again.");
    this.name = "RollTableRevisionConflict";
  }
}

function getRollTableCatalog(database) {
  const row = database.prepare("SELECT revision, catalog_json AS catalogJson FROM roll_table_catalog WHERE id = 1").get();
  if (!row) throw new Error("The shared roll-table catalog is unavailable.");
  return { revision: row.revision, catalog: JSON.parse(row.catalogJson) };
}

function replaceRollTableCatalog(database, expectedRevision, catalogInput) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("A valid catalog revision is required.");
  }
  const catalog = validateRollTableCatalog(catalogInput);
  const catalogJson = JSON.stringify(catalog);
  database.exec("BEGIN IMMEDIATE");
  try {
    const current = database.prepare("SELECT revision FROM roll_table_catalog WHERE id = 1").get();
    if (!current) throw new Error("The shared roll-table catalog is unavailable.");
    if (current.revision !== expectedRevision) throw new RollTableRevisionConflict();
    const revision = current.revision + 1;
    database.prepare("UPDATE roll_table_catalog SET revision = ?, catalog_json = ?, updated_at = ? WHERE id = 1")
      .run(revision, catalogJson, new Date().toISOString());
    database.exec("COMMIT");
    return { revision, catalog };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { RollTableRevisionConflict, getRollTableCatalog, replaceRollTableCatalog };
