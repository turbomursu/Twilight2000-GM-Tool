(function (root) {
  "use strict";

  const contexts = new Set(["situation", "personnel", "movement", "conflicts"]);

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function assertKeys(value, expected, label) {
    if (!isRecord(value) || Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
      throw new Error(`${label} has an unsupported structure.`);
    }
  }

  function parseDice(dice) {
    if (typeof dice !== "string") throw new Error("Each table needs a supported dice expression.");
    const match = dice.match(/^([1-9]\d?)d(2|[1-9]\d?|100)$/i);
    if (!match) throw new Error("Dice expressions must use NdS notation, with 1-20 dice and 2-100 sides.");
    const count = Number(match[1]);
    const sides = Number(match[2]);
    if (count > 20 || count * sides > 1000) throw new Error("Dice totals must not exceed 1,000.");
    return { count, sides, min: count, max: count * sides };
  }

  function validateRollTableCatalog(input) {
    assertKeys(input, ["schemaVersion", "tables"], "Roll-table catalog");
    if (input.schemaVersion !== 1 || !Array.isArray(input.tables) || input.tables.length > 200) {
      throw new Error("Roll-table catalog must use schemaVersion 1 and contain no more than 200 tables.");
    }

    const ids = new Set();
    const names = new Set();
    const tables = input.tables.map((table, tableIndex) => {
      const label = `Table ${tableIndex + 1}`;
      assertKeys(table, ["id", "name", "contexts", "dice", "columns", "rows", "notes"], label);
      if (typeof table.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(table.id) || ids.has(table.id)) {
        throw new Error(`${label} needs a unique lowercase ID.`);
      }
      if (typeof table.name !== "string" || !table.name.trim() || table.name.trim().length > 100) {
        throw new Error(`${label} needs a name of 1-100 characters.`);
      }
      const normalizedName = table.name.trim().toLocaleLowerCase("en-US");
      if (names.has(normalizedName)) throw new Error(`Table name "${table.name.trim()}" is duplicated.`);
      ids.add(table.id);
      names.add(normalizedName);

      if (!Array.isArray(table.contexts) || table.contexts.some((context) => !contexts.has(context))
        || new Set(table.contexts).size !== table.contexts.length) {
        throw new Error(`${label} contexts must be unique values from situation, personnel, movement, or conflicts.`);
      }
      const { min: rollMin, max: rollMax } = parseDice(table.dice);
      if (!Array.isArray(table.columns) || table.columns.length < 2 || table.columns.length > 8
        || table.columns.some((column) => typeof column !== "string" || !column.trim() || column.trim().length > 60)
        || new Set(table.columns.map((column) => column.trim().toLocaleLowerCase("en-US"))).size !== table.columns.length) {
        throw new Error(`${label} needs 2-8 unique column labels.`);
      }
      if (!Array.isArray(table.rows) || table.rows.length < 1 || table.rows.length > 1000) {
        throw new Error(`${label} needs 1-1,000 result ranges.`);
      }
      const covered = new Set();
      const rows = table.rows.map((row, rowIndex) => {
        assertKeys(row, ["min", "max", "values"], `${label} range ${rowIndex + 1}`);
        if (!Number.isSafeInteger(row.min) || !Number.isSafeInteger(row.max)
          || row.min < rollMin || row.max > rollMax || row.min > row.max
          || !Array.isArray(row.values) || row.values.length !== table.columns.length
          || row.values.some((value) => typeof value !== "string" || value.length > 2000)) {
          throw new Error(`${label} range ${rowIndex + 1} must be within its dice total and include one text value per column.`);
        }
        for (let result = row.min; result <= row.max; result += 1) {
          if (covered.has(result)) throw new Error(`${label} has overlapping ranges for result ${result}.`);
          covered.add(result);
        }
        return { min: row.min, max: row.max, values: [...row.values] };
      });
      if (covered.size !== rollMax - rollMin + 1) throw new Error(`${label} ranges must cover every possible dice total without gaps.`);

      if (!Array.isArray(table.notes) || table.notes.length > 100
        || table.notes.some((note) => !isRecord(note) || Object.keys(note).sort().join(",") !== "label,text"
          || typeof note.label !== "string" || note.label.length > 200
          || typeof note.text !== "string" || note.text.length > 4000)) {
        throw new Error(`${label} notes must contain at most 100 label/text pairs.`);
      }
      return {
        id: table.id,
        name: table.name.trim(),
        contexts: [...table.contexts],
        dice: table.dice.toLowerCase(),
        columns: table.columns.map((column) => column.trim()),
        rows,
        notes: table.notes.map(({ label: noteLabel, text }) => ({ label: noteLabel.trim(), text: text.trim() }))
      };
    });

    return { schemaVersion: 1, tables };
  }

  function rollDice(dice, randomIndex) {
    const { count, sides } = parseDice(dice);
    if (typeof randomIndex !== "function") throw new Error("A random die source is required.");
    let total = 0;
    for (let die = 0; die < count; die += 1) {
      const index = randomIndex(sides);
      if (!Number.isSafeInteger(index) || index < 0 || index >= sides) throw new Error("The random die source returned an invalid result.");
      total += index + 1;
    }
    return total;
  }

  const api = { parseDice, rollDice, validateRollTableCatalog };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FieldbookRollTableContract = api;
})(typeof globalThis === "object" ? globalThis : this);
