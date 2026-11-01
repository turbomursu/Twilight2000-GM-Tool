(() => {
  const workspace = document.querySelector(".comms-workspace");
  if (!workspace) return;
  const role = workspace.dataset.commsRole;
  const select = document.querySelector(role === "gm" ? "#runtime-campaign-select" : "#player-campaign-select");
  const form = document.querySelector("#comms-form");
  const fields = form.querySelector("fieldset");
  const input = document.querySelector("#comms-message");
  const list = document.querySelector("#comms-messages");
  const status = document.querySelector("#comms-status");
  const refresh = document.querySelector("#refresh-comms");
  let campaignId = "";
  let campaignGeneration = 0;
  let loadToken = 0;
  let authorized = false;
  let busy = false;

  function visible() { return role === "gm" ? workspace.classList.contains("active") : !workspace.hidden; }
  function path(id) { return `${role === "gm" ? "/api/campaigns" : "/api/player/campaigns"}/${encodeURIComponent(id)}/comms`; }
  function controls() { fields.disabled = busy || !authorized; refresh.disabled = busy || !campaignId; }
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
    const result = await response.json();
    if (response.status === 401) location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) throw new Error(result.error || "COMMS request failed.");
    return result;
  }
  function revision(result, id) {
    if (role === "gm" && Number.isSafeInteger(result.campaignRevision)) {
      document.dispatchEvent(new CustomEvent("fieldbook:comms-updated", { detail: { campaignId: id, campaignRevision: result.campaignRevision } }));
    }
  }
  function messageRow(message) {
    const row = document.createElement("li"); row.className = "comms-row"; row.dataset.messageId = message.id;
    row.dataset.signature = JSON.stringify(message);
    const sender = document.createElement("strong"); sender.textContent = message.sender.role === "gm" ? "GM" : `${message.sender.label} / PLAYER`;
    const time = document.createElement("time"); time.dateTime = message.sentAt; time.title = `Sent / ${message.sentAt}`;
    time.textContent = message.gameTime ? `${message.gameTime.gameDate} / Day ${message.gameTime.dayNumber}` : "Game time not set";
    const text = document.createElement("p"); text.textContent = message.text;
    row.append(sender, time, text); return row;
  }
  function render(messages) {
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    const existing = new Map([...list.children].map((row) => [row.dataset.messageId, row]));
    const ids = new Set(messages.map((message) => message.id));
    [...list.children].forEach((row) => { if (!ids.has(row.dataset.messageId)) row.remove(); });
    messages.forEach((message, index) => {
      let row = existing.get(message.id);
      if (!row || row.dataset.signature !== JSON.stringify(message)) {
        const replacement = messageRow(message); if (row) row.replaceWith(replacement); row = replacement;
      }
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
    });
    if (atBottom) list.scrollTop = list.scrollHeight;
  }
  async function load() {
    if (!campaignId) return false;
    const token = ++loadToken; const id = campaignId;
    try {
      const result = await request(path(id));
      if (token !== loadToken || id !== campaignId) return false;
      authorized = true; render(result.messages); revision(result, id);
      status.textContent = result.hasEarlier ? "Latest 200 messages / earlier messages archived." : result.messages.length ? `${result.messages.length} messages` : "No messages yet.";
      controls(); return true;
    } catch (error) {
      if (token === loadToken && id === campaignId) {
        authorized = false; list.replaceChildren(); status.textContent = `COMMS unavailable: ${error.message}`; controls();
      }
      return false;
    }
  }
  function selectCampaign(id) {
    if (id !== campaignId) { campaignId = id; campaignGeneration += 1; loadToken += 1; authorized = false; list.replaceChildren(); input.value = ""; }
    status.textContent = id ? "Loading COMMS..." : "Select a campaign."; controls();
    if (id && visible() && !busy) load();
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (busy || !authorized || !campaignId) return;
    const id = campaignId; const generation = campaignGeneration; const text = input.value;
    busy = true; controls();
    try {
      const result = await request(path(id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (id !== campaignId || generation !== campaignGeneration) return;
      input.value = ""; revision(result, id);
      const refreshed = await load();
      if (id === campaignId && generation === campaignGeneration) status.textContent = refreshed ? "Message sent." : `Message sent; ${status.textContent}`;
    } catch (error) {
      if (id === campaignId && generation === campaignGeneration) status.textContent = `Send not confirmed: ${error.message} Check the channel before retrying.`;
    } finally {
      busy = false; controls();
      if (generation !== campaignGeneration && campaignId && visible()) load();
    }
  });
  refresh.addEventListener("click", () => { if (!busy) load(); });
  select.addEventListener("change", () => selectCampaign(select.value));
  if (role === "gm") {
    document.addEventListener("fieldbook:campaign-selected", (event) => selectCampaign(event.detail.campaignId));
    document.addEventListener("click", (event) => { if (event.target.closest('[data-view="comms"]')) selectCampaign(select.value); });
  } else {
    document.querySelector("#player-comms-tab").addEventListener("click", () => document.dispatchEvent(new CustomEvent("fieldbook:player-view", { detail: { view: "comms" } })));
    document.addEventListener("fieldbook:player-view", (event) => { if (event.detail.view === "comms") selectCampaign(select.value); });
    document.querySelector("#refresh-player-character").addEventListener("click", () => { if (visible() && !busy) load(); });
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible() && !busy) load(); });
  setInterval(() => { if (!document.hidden && visible() && !busy) load(); }, 15000);
  selectCampaign(select.value);
})();