(() => {
  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
    const result = await response.json();
    if (response.status === 401) location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) {
      const error = new Error(result.error || "Report service unavailable.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  const gmForm = document.querySelector("#gm-report-form");
  if (gmForm) {
    const select = document.querySelector("#runtime-campaign-select");
    const fields = gmForm.querySelector("fieldset");
    const status = document.querySelector("#gm-report-status");
    const reload = document.querySelector("#reload-situation-report");
    const preview = document.querySelector("#preview-situation-report");
    const publish = document.querySelector("#publish-situation-report");
    const withdraw = document.querySelector("#withdraw-situation-report");
    let campaignId = "";
    let report = null;
    let previewRevision = null;
    let generation = 0;
    let busy = false;

    function draft() {
      return { title: document.querySelector("#report-title").value,
        body: document.querySelector("#report-body").value,
        gameTime: document.querySelector("#report-game-time").value };
    }
    function controls() {
      fields.disabled = busy || !report;
      reload.disabled = busy || !campaignId;
      publish.disabled = !report || previewRevision !== report.revision;
      withdraw.disabled = !report?.published;
    }
    function showCopy(prefix, copy) {
      document.querySelector(`#${prefix}-title`).textContent = copy.title;
      document.querySelector(`#${prefix}-time`).textContent = copy.gameTime;
      document.querySelector(`#${prefix}-body`).textContent = copy.body;
    }
    function invalidatePreview() {
      previewRevision = null;
      document.querySelector("#situation-report-preview").hidden = true;
      controls();
    }
    function renderReport() {
      document.querySelector("#situation-report-published").hidden = !report?.published;
      if (report?.published) showCopy("report-published", report.published);
      controls();
    }
    async function load(id) {
      const token = ++generation;
      campaignId = id;
      report = null;
      invalidatePreview();
      renderReport();
      gmForm.reset();
      status.textContent = id ? "Loading report..." : "Select a runtime campaign.";
      if (!id) return;
      try {
        const result = await request(`/api/campaigns/${encodeURIComponent(id)}/situation-report`);
        if (token !== generation) return;
        report = result.report;
        document.querySelector("#report-title").value = report.draft.title;
        document.querySelector("#report-body").value = report.draft.body;
        document.querySelector("#report-game-time").value = report.draft.gameTime;
        status.textContent = report.published ? `Published / ${report.publishedAt}` : "Not published / draft retained.";
        renderReport();
      } catch (error) {
        if (token === generation) status.textContent = error.message;
      }
    }
    async function send(action, extra, id, token) {
      const result = await request(`/api/campaigns/${encodeURIComponent(id)}/situation-report`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedRevision: report.revision, ...extra })
      });
      if (token !== generation) return null;
      if (result.report) {
        report = result.report;
        invalidatePreview();
        renderReport();
        document.dispatchEvent(new CustomEvent("fieldbook:report-saved", { detail: report }));
      }
      return result;
    }
    async function act(action) {
      if (busy || !report) return;
      if (action === "withdraw" && !confirm("Withdraw this report from all assigned players?")) return;
      const id = campaignId;
      const token = generation;
      busy = true;
      controls();
      try {
        if (action === "draft" || (action === "preview" && JSON.stringify(draft()) !== JSON.stringify(report.draft))) {
          if (!await send("draft", { draft: draft() }, id, token)) return;
        }
        if (action === "preview") {
          const result = await send("preview", {}, id, token);
          if (!result) return;
          showCopy("report-preview", result.preview);
          document.querySelector("#situation-report-preview").hidden = false;
          previewRevision = result.revision;
        } else if (action !== "draft") {
          if (!await send(action, {}, id, token)) return;
        }
        if (token === generation) status.textContent = ({ draft: "Draft saved / player copy unchanged.", preview: "Draft preview ready / not published.", publish: "Report published to assigned players.", withdraw: "Report withdrawn / draft retained." })[action];
      } catch (error) {
        if (token === generation) {
          status.textContent = `Not saved: ${error.message}`;
          if (error.status === 409) { report = null; invalidatePreview(); }
        }
      } finally {
        busy = false;
        controls();
      }
    }
    gmForm.addEventListener("submit", (event) => { event.preventDefault(); act("draft"); });
    gmForm.addEventListener("input", invalidatePreview);
    preview.addEventListener("click", () => act("preview"));
    publish.addEventListener("click", () => act("publish"));
    withdraw.addEventListener("click", () => act("withdraw"));
    reload.addEventListener("click", () => {
      if (!report || JSON.stringify(draft()) === JSON.stringify(report.draft) || confirm("Discard unsaved draft edits and reload?")) load(select.value);
    });
    select.addEventListener("change", () => load(select.value));
    document.addEventListener("fieldbook:campaign-selected", (event) => load(event.detail.campaignId));
    load(select.value);
  }

  const sitrepTab = document.querySelector("#player-sitrep-tab");
  if (sitrepTab) {
    const select = document.querySelector("#player-campaign-select");
    const characterTab = document.querySelector("#player-character-tab");
    const panel = document.querySelector('[data-panel="situation"]');
    const copy = document.querySelector("#player-published-report");
    const status = document.querySelector("#player-report-status");
    let generation = 0;
    function clear() {
      copy.hidden = true;
      ["title", "body", "time", "published-at"].forEach((key) => { document.querySelector(`#player-report-${key}`).textContent = ""; });
    }
    async function load() {
      const token = ++generation;
      const id = select.value;
      if (!id) { clear(); status.textContent = "Select an assigned campaign."; return; }
      try {
        const result = await request(`/api/player/campaigns/${encodeURIComponent(id)}/situation-report`);
        if (token !== generation || select.value !== id) return;
        clear();
        if (!result.report) { status.textContent = "No situation report published."; return; }
        document.querySelector("#player-report-title").textContent = result.report.title;
        document.querySelector("#player-report-body").textContent = result.report.body;
        document.querySelector("#player-report-time").textContent = result.report.gameTime;
        document.querySelector("#player-report-published-at").textContent = `Published / ${result.publishedAt}`;
        copy.hidden = false;
        status.textContent = "";
      } catch (error) {
        if (token === generation) { clear(); status.textContent = `Report unavailable: ${error.message}`; }
      }
    }
    function view(target) {
      const mapTab = document.querySelector("#player-map-tab");
      document.querySelector("#player-seed-title").textContent = target === "situation" ? "Situation report"
        : target === "map" ? "Player map"
        : document.querySelector("#player-record-state").textContent.startsWith("Playable") ? "Playable character" : "Character seed";
      document.querySelector("#player-record-description").textContent = target !== "character" ? ""
        : document.querySelector("#player-record-state").textContent;
      document.querySelectorAll(".player-panel").forEach((item) => {
        item.hidden = item.dataset.panel !== target;
        item.classList.toggle("active", !item.hidden);
      });
      [sitrepTab, characterTab, mapTab].filter(Boolean).forEach((button) => button.removeAttribute("aria-current"));
      (target === "situation" ? sitrepTab : target === "map" ? mapTab : characterTab).setAttribute("aria-current", "page");
      if (target === "situation") { clear(); status.textContent = "Refreshing report..."; load(); }
    }
    sitrepTab.addEventListener("click", () => view("situation"));
    characterTab.addEventListener("click", () => view("character"));
    document.addEventListener("fieldbook:player-view", (event) => view(event.detail.view));
    select.addEventListener("change", () => { clear(); load(); });
    document.querySelector("#refresh-player-character").addEventListener("click", () => { clear(); load(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !panel.hidden) { clear(); load(); } });
    setInterval(() => { if (!document.hidden && !panel.hidden) load(); }, 15000);
  }
})();