(function (root) {
  "use strict";

  const contract = root.FieldbookRollTableContract;
  const contextLabels = {
    situation: "Situation",
    personnel: "Personnel",
    movement: "Movement",
    conflicts: "Conflicts"
  };
  const dialog = document.getElementById("roll-tables-dialog");
  const select = document.getElementById("roll-table-select");
  const status = document.getElementById("roll-table-status");
  const detail = document.getElementById("roll-table-detail");
  const resultOutput = document.getElementById("roll-table-result");
  const rollButton = document.getElementById("roll-table-roll");
  const exportButton = document.getElementById("roll-table-export");
  const importButton = document.getElementById("roll-table-import");
  const fileInput = document.getElementById("roll-table-file");
  let catalog = null;
  let revision = null;
  let context = "situation";

  function setStatus(message, isError = false) {
    status.className = isError ? "feedback error" : "feedback";
    status.textContent = message;
  }

  async function request(method = "GET", body = null) {
    const response = await fetch("/api/roll-tables", {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`The server returned an unreadable response (${response.status}).`);
    }
    if (!response.ok) throw new Error(payload.error || `The request failed (${response.status}).`);
    return payload;
  }

  function currentTables() {
    return (catalog?.tables || []).filter((table) => !table.contexts.length || table.contexts.includes(context));
  }

  function activeTable() {
    return currentTables().find((table) => table.id === select.value) || null;
  }

  function clearResult() {
    resultOutput.hidden = true;
    resultOutput.replaceChildren();
  }

  function appendText(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function renderTable() {
    const tableData = activeTable();
    detail.replaceChildren();
    clearResult();
    rollButton.disabled = !tableData;
    if (!tableData) {
      appendText(detail, "p", catalog ? "No tables are available in this section." : "Load the shared catalog to continue.");
      return;
    }

    const table = document.createElement("table");
    table.className = "roll-table-results";
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    tableData.columns.forEach((column) => appendText(headerRow, "th", column));
    head.append(headerRow);
    const body = document.createElement("tbody");
    tableData.rows.forEach((row) => {
      const rowElement = document.createElement("tr");
      row.values.forEach((value) => appendText(rowElement, "td", value));
      body.append(rowElement);
    });
    table.append(head, body);
    detail.append(table);

    if (tableData.notes.length) {
      const notes = document.createElement("ul");
      notes.className = "roll-table-notes";
      tableData.notes.forEach((note) => {
        const item = document.createElement("li");
        appendText(item, "strong", note.label);
        appendText(item, "p", note.text);
        notes.append(item);
      });
      detail.append(notes);
    }
  }

  function renderOptions() {
    const tables = currentTables();
    select.replaceChildren();
    tables.forEach((table) => {
      const option = document.createElement("option");
      option.value = table.id;
      option.textContent = `${table.name} (${table.dice})`;
      select.append(option);
    });
    select.disabled = tables.length === 0;
    renderTable();
  }

  async function loadCatalog() {
    catalog = null;
    revision = null;
    select.replaceChildren();
    select.disabled = true;
    rollButton.disabled = true;
    exportButton.disabled = true;
    importButton.disabled = true;
    detail.replaceChildren();
    clearResult();
    setStatus("Loading shared catalog…");
    try {
      const response = await request();
      catalog = contract.validateRollTableCatalog(response.catalog);
      revision = response.revision;
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("The server returned an invalid catalog revision.");
      exportButton.disabled = false;
      importButton.disabled = false;
      renderOptions();
      setStatus(`${catalog.tables.length} shared table${catalog.tables.length === 1 ? "" : "s"} loaded. Revision ${revision}.`);
    } catch (error) {
      setStatus(`Could not load the shared catalog: ${error.message}`, true);
    }
  }

  function randomIndex(maximum) {
    if (!root.crypto?.getRandomValues) throw new Error("Secure browser randomness is unavailable; no roll was made.");
    const range = 0x100000000;
    const limit = Math.floor(range / maximum) * maximum;
    const value = new Uint32Array(1);
    do {
      root.crypto.getRandomValues(value);
    } while (value[0] >= limit);
    return value[0] % maximum;
  }

  function roll() {
    const table = activeTable();
    if (!table) return;
    try {
      const value = contract.rollDice(table.dice, randomIndex);
      const outcome = table.rows.find((row) => row.min <= value && value <= row.max);
      if (!outcome) throw new Error("The table has no result for the rolled total.");
      resultOutput.replaceChildren();
      appendText(resultOutput, "strong", `Rolled ${value} on ${table.dice}`);
      appendText(resultOutput, "p", outcome.values.slice(1).map((text, index) => `${table.columns[index + 1]}: ${text}`).join(" — "));
      resultOutput.hidden = false;
      setStatus("Roll completed. No campaign state was changed.");
    } catch (error) {
      setStatus(`Could not roll: ${error.message}`, true);
    }
  }

  function downloadJson(value, filename) {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importFile(file) {
    if (!file) return;
    try {
      const imported = contract.validateRollTableCatalog(JSON.parse(await file.text()));
      if (revision === null) throw new Error("Load the current catalog before importing.");
      const confirmation = `Replace the shared catalog for all GM accounts with ${imported.tables.length} table${imported.tables.length === 1 ? "" : "s"}?`;
      if (!root.confirm(confirmation)) return;
      setStatus("Saving shared catalog…");
      const response = await request("PUT", { expectedRevision: revision, catalog: imported });
      catalog = contract.validateRollTableCatalog(response.catalog);
      revision = response.revision;
      renderOptions();
      setStatus(`Shared catalog saved with ${catalog.tables.length} table${catalog.tables.length === 1 ? "" : "s"}. Revision ${revision}.`);
    } catch (error) {
      setStatus(`Could not import the catalog: ${error.message}`, true);
    } finally {
      fileInput.value = "";
    }
  }

  document.querySelectorAll('[data-action="open-roll-tables"]').forEach((button) => {
    button.addEventListener("click", () => {
      context = contextLabels[button.dataset.rollContext] ? button.dataset.rollContext : "situation";
      document.getElementById("roll-table-context-label").textContent =
        `Opened from ${contextLabels[context]}. Tables are shared across campaigns and GM accounts; players cannot access them.`;
      dialog.showModal();
      loadCatalog();
    });
  });
  document.querySelectorAll("[data-roll-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  select.addEventListener("change", renderTable);
  rollButton.addEventListener("click", roll);
  document.getElementById("roll-table-reload").addEventListener("click", loadCatalog);
  exportButton.addEventListener("click", () => {
    if (catalog) downloadJson(catalog, "roll-tables.json");
  });
  document.getElementById("roll-table-template").addEventListener("click", () => {
    downloadJson({ schemaVersion: 1, tables: [] }, "roll-tables-template.json");
  });
  importButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => importFile(fileInput.files?.[0]));
})(window);
