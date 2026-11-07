(function () {
  "use strict";

  function initialize({ normalizePackage, request, onImported }) {
    const fileInput = document.getElementById("setup-package-file");
    const dialog = document.getElementById("setup-import-dialog");
    const status = document.getElementById("setup-import-status");
    const summary = document.getElementById("setup-import-summary");
    const apply = document.getElementById("apply-setup-import");
    const open = document.querySelector('[data-action="open-setup-import"]');
    const close = document.getElementById("close-setup-import");
    const cancel = document.getElementById("cancel-setup-import");
    let revision = 0;
    let pendingSource = null;
    let submitting = false;

    function feedback(message, kind = "") {
      status.className = `feedback ${kind}`.trim();
      status.textContent = message;
    }

    function reset() {
      revision += 1;
      pendingSource = null;
      apply.disabled = true;
      summary.hidden = true;
    }

    function dismiss() {
      if (submitting) return;
      reset();
      dialog.close();
    }

    open.addEventListener("click", async () => {
      if (submitting) return;
      reset();
      fileInput.value = "";
      if (typeof window.showOpenFilePicker === "function") {
        try {
          const [handle] = await window.showOpenFilePicker({
            startIn: "downloads", multiple: false,
            types: [{ description: "Campaign setup JSON", accept: { "application/json": [".json"] } }]
          });
          await readFile(await handle.getFile());
          return;
        } catch (error) {
          if (error.name === "AbortError") return;
          if (!["SecurityError", "NotAllowedError", "NotSupportedError"].includes(error.name)) {
            feedback(`Could not open the setup picker: ${error.message}`, "error");
            if (!dialog.open) dialog.showModal();
            return;
          }
        }
      }
      fileInput.click();
    });
    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dismiss();
    });
    dialog.addEventListener("close", reset);

    async function readFile(file) {
      if (submitting) return;
      if (!file) return;
      reset();
      const currentRevision = revision;
      feedback("Checking setup package...");
      if (!dialog.open) dialog.showModal();
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error("Setup packages must be smaller than 25 MB.");
        const source = await file.text();
        if (revision !== currentRevision) return;
        const setup = normalizePackage(JSON.parse(source));
        summary.textContent = [
          `Campaign: ${setup.campaign.name}`,
          `Setting: ${setup.campaign.setting}`,
          `Map: ${setup.map.name}`,
          `Factions: ${setup.factions.length}`,
          `Settlements: ${setup.settlements.length}`,
          `Terrain cells: ${Object.keys(setup.map.grid.terrainCells).length}`,
          `Initial influence layers: ${setup.factions.filter((faction) => faction.influenceCells.length).length}`
        ].join("\n");
        summary.hidden = false;
        pendingSource = source;
        feedback(`Validated ${file.name}. Import it as a new GM-owned runtime campaign.`, "success");
        apply.disabled = false;
      } catch (error) {
        if (revision !== currentRevision) return;
        feedback(error instanceof Error ? error.message : "Could not read this setup package.", "error");
      }
    }
    fileInput.addEventListener("change", () => readFile(fileInput.files?.[0]));

    apply.addEventListener("click", async () => {
      if (submitting || pendingSource === null) return;
      submitting = true;
      apply.disabled = true;
      open.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      feedback("Creating the runtime campaign...");
      try {
        let campaign;
        try {
          ({ campaign } = await request("/api/campaigns/import-setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: pendingSource
          }));
        } catch (error) {
          feedback(error instanceof Error ? error.message : "Could not create the runtime campaign.", "error");
          apply.disabled = false;
          return;
        }
        reset();
        if (!campaign || typeof campaign.id !== "string" || typeof campaign.name !== "string") {
          feedback("The service returned an incomplete import result. Reload the runtime campaign list before importing again.", "error");
          return;
        }
        feedback(`Runtime campaign created: ${campaign.name}. Loading it...`, "success");
        try {
          await onImported(campaign);
          dialog.close();
        } catch (error) {
          feedback(`Runtime campaign created: ${campaign.name}, but it could not be loaded. Select it from Runtime campaign; do not import it again. ${error instanceof Error ? error.message : "Reload the GM runtime."}`, "error");
        }
      } finally {
        submitting = false;
        open.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  window.FieldbookSetupImport = { initialize };
})();
