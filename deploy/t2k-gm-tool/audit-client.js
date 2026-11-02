(() => {
  const view = document.querySelector("#view-audit");
  if (!view) return;
  const select = document.querySelector("#runtime-campaign-select");
  const rows = document.querySelector("#audit-rows");
  const status = document.querySelector("#audit-status");
  const refresh = document.querySelector("#audit-refresh");
  const newest = document.querySelector("#audit-newest");
  const older = document.querySelector("#audit-older");
  let campaignId = ""; let before = null; let nextBefore = null; let token = 0; let loading = false;
  const labels = {
    "conditions.save": "Conditions saved", "conditions.clear": "Conditions cleared",
    "inventory.add": "Item stocked", "inventory.update": "Item corrected", "inventory.remove": "Item removed",
    "inventory.approve.add": "Item addition approved", "inventory.approve.update": "Item change approved",
    "inventory.approve.remove": "Item removal approved", "inventory.reject": "Item proposal rejected",
    "report.draft": "Report draft saved", "report.publish": "Report published", "report.withdraw": "Report withdrawn",
    "map.draft": "Map draft saved", "map.publish": "Map published", "map.withdraw": "Map withdrawn",
    "campaign.restore": "Campaign restored", "clock.advance": "Time advanced six hours", "supplies.midday": "Midday rations processed"
  };
  function controls() {
    refresh.disabled = loading || !campaignId; newest.disabled = loading || !campaignId || before === null;
    older.disabled = loading || !nextBefore;
  }
  function cell(row, text) { const value = document.createElement("td"); if (text !== undefined) value.textContent = text; row.append(value); return value; }
  function revision(value) { return value.before === null && value.after === null ? "n/a" : `${value.before ?? "new"} -> ${value.after ?? "n/a"}`; }
  function render(events) {
    rows.replaceChildren();
    events.forEach((event) => {
      const row = document.createElement("tr"); row.dataset.auditEvent = event.id;
      const time = cell(row, event.recordedAt); const gameTime = document.createElement("small");
      gameTime.textContent = event.gameTime ? `${event.gameTime.gameDate}${event.gameTime.timeOfDay ? ` ${event.gameTime.timeOfDay}` : ""} / Day ${event.gameTime.dayNumber}` : "Game time not set"; time.append(gameTime);
      const actor = cell(row, event.actor.label); actor.title = event.actor.id;
      cell(row, labels[event.action] || event.action);
      const target = cell(row); const details = document.createElement("details"); const summary = document.createElement("summary");
      summary.textContent = event.target.label; const ids = document.createElement("p");
      ids.textContent = `Type: ${event.target.type}\nTarget: ${event.target.id}${event.target.characterId ? `\nCharacter: ${event.target.characterId}` : ""}${event.target.relatedId ? `\nRelated: ${event.target.relatedId}` : ""}\nEvent: ${event.id}`;
      details.append(summary, ids); target.append(details);
      cell(row, revision(event.revision)); cell(row, revision(event.campaignRevision)); cell(row, event.origin === "backup" ? "Recovered backup" : "Live");
      rows.append(row);
    });
  }
  async function load(cursor = null) {
    if (!campaignId) return;
    const requestToken = ++token; const id = campaignId; loading = true; controls(); status.textContent = "Loading audit history...";
    try {
      const query = new URLSearchParams({ limit: "50" }); if (cursor !== null) query.set("before", String(cursor));
      const response = await fetch(`/api/campaigns/${encodeURIComponent(id)}/audit?${query}`, { credentials: "same-origin", cache: "no-store" });
      const result = await response.json();
      if (requestToken !== token || campaignId !== id || select.value !== id) return;
      if (response.status === 401) location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);
      if (!response.ok) throw new Error(result.error || "Audit history unavailable.");
      before = cursor; nextBefore = result.nextBefore; render(result.events);
      status.textContent = result.events.length ? `${result.events.length} entries / ${cursor === null ? "newest" : "older history"}` : "No audit entries recorded.";
    } catch (error) { if (requestToken === token) { rows.replaceChildren(); nextBefore = null; status.textContent = error.message; } }
    finally { if (requestToken === token) { loading = false; controls(); } }
  }
  function selectCampaign(id) {
    if (id !== campaignId) { campaignId = id; token += 1; loading = false; before = null; nextBefore = null; rows.replaceChildren(); }
    status.textContent = id ? "Audit history ready." : "Select a runtime campaign."; controls();
    if (id && view.classList.contains("active")) load();
  }
  refresh.addEventListener("click", () => load(before)); newest.addEventListener("click", () => load()); older.addEventListener("click", () => load(nextBefore));
  select.addEventListener("change", () => selectCampaign(select.value));
  document.addEventListener("fieldbook:campaign-selected", (event) => selectCampaign(event.detail.campaignId));
  document.addEventListener("click", (event) => { if (event.target.closest('[data-view="audit"]')) selectCampaign(select.value); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && view.classList.contains("active") && !loading) load(before); });
  selectCampaign(select.value);
})();