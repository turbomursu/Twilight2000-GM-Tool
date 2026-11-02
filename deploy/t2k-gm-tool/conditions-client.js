(() => {
  const numbers = [["damage", "Damage"], ["stress", "Stress"], ["temporaryRadiation", "Temporary radiation"], ["permanentRadiation", "Permanent radiation"]];
  const flags = [["starving", "Starving"], ["dehydrated", "Dehydrated"], ["sleepDeprived", "Sleep deprived"], ["hypothermic", "Hypothermic"]];
  const texts = [["coolnessUnderFire", "Coolness under fire / GM-entered"], ["criticalInjuries", "Critical injuries"], ["diseases", "Diseases"], ["notes", "Player-visible notes"]];
  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
    const result = await response.json();
    if (response.status === 401) location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) throw new Error(result.error || "Condition service unavailable."); return result;
  }
  const form = document.querySelector("#gm-condition-form");
  if (form) {
    const campaignSelect = document.querySelector("#runtime-campaign-select");
    const characterSelect = document.querySelector("#condition-character");
    const fields = document.querySelector("#gm-condition-fields");
    const status = document.querySelector("#gm-condition-status");
    const reload = document.querySelector("#reload-character-conditions");
    let campaignId = ""; let generation = 0; let loadToken = 0; let current = null; let data = null; let dirty = false; let busy = false;
    const inputs = {};
    function field(key, label, kind) {
      const wrapper = document.createElement("label"); const caption = document.createElement("span"); caption.textContent = label; wrapper.append(caption);
      const input = document.createElement(kind === "flag" ? "select" : kind === "text" ? "textarea" : "input"); input.name = key;
      if (kind === "flag") [["", "Not recorded"], ["true", "Present"], ["false", "Absent"]].forEach(([value, text]) => input.add(new Option(text, value)));
      else if (kind === "number") { input.type = "number"; input.min = "0"; input.max = "9999"; input.step = "1"; }
      else { input.maxLength = key === "gmNotes" ? 4000 : key === "coolnessUnderFire" ? 160 : 2000; wrapper.className = "wide"; }
      wrapper.append(input); fields.append(wrapper); inputs[key] = input;
    }
    numbers.forEach(([key, label]) => field(key, label, "number")); flags.forEach(([key, label]) => field(key, label, "flag"));
    texts.forEach(([key, label]) => field(key, label, "text")); field("gmNotes", "Private GM notes / never sent to players", "text");
    const actions = document.createElement("div"); actions.className = "wide report-actions";
    const save = document.createElement("button"); save.type = "submit"; save.className = "button button-primary"; save.textContent = "Save conditions";
    const clear = document.createElement("button"); clear.type = "button"; clear.className = "button button-danger"; clear.textContent = "Clear record";
    actions.append(save, clear); fields.append(actions);
    function visible() { return document.querySelector("#view-conditions").classList.contains("active"); }
    function controls() { fields.disabled = busy || !current; characterSelect.disabled = busy || !data?.characters?.length; reload.disabled = busy || !campaignId; clear.disabled = !current?.recorded; }
    function fill() {
      if (!current) { form.reset(); controls(); return; }
      numbers.forEach(([key]) => { inputs[key].value = current.conditions[key] ?? ""; });
      flags.forEach(([key]) => { inputs[key].value = current.conditions[key] === null ? "" : String(current.conditions[key]); });
      texts.forEach(([key]) => { inputs[key].value = current.conditions[key]; }); inputs.gmNotes.value = current.gmNotes; dirty = false; controls();
      status.textContent = current.recorded ? `GM record / ${current.updatedAt} / revision ${current.revision}` : "No condition record / values remain not recorded.";
    }
    function apply(result) {
      data = result.conditions; const selected = characterSelect.value; characterSelect.replaceChildren();
      data.characters.forEach((character) => characterSelect.add(new Option(character.displayLabel, character.characterId)));
      characterSelect.value = data.characters.some((character) => character.characterId === selected) ? selected : data.characters[0]?.characterId || "";
      current = data.characters.find((character) => character.characterId === characterSelect.value) || null; fill();
      document.dispatchEvent(new CustomEvent("fieldbook:conditions-updated", { detail: data }));
    }
    async function load() {
      if (!campaignId) return;
      const token = ++loadToken; const id = campaignId;
      try { const result = await request(`/api/campaigns/${encodeURIComponent(id)}/conditions`); if (token !== loadToken || id !== campaignId || dirty) return; apply(result); }
      catch (error) { if (token === loadToken && id === campaignId) { current = null; data = null; status.textContent = error.message; controls(); } }
    }
    function selectCampaign(id) {
      if (id === campaignId && dirty) return;
      if (id !== campaignId) { campaignId = id; generation += 1; loadToken += 1; data = null; current = null; dirty = false; form.reset(); characterSelect.replaceChildren(); }
      status.textContent = id ? "Loading conditions..." : "Select a runtime campaign."; controls();
      if (id && visible() && !busy && !dirty) load();
    }
    async function saveRecord(clearRecord = false) {
      if (!current || busy) return;
      if (clearRecord && !confirm("Clear public condition values and private GM notes?")) return;
      const token = generation; const id = campaignId;
      const body = { characterId: current.characterId, expectedRevision: current.revision };
      if (clearRecord) body.clear = true;
      else {
        body.conditions = Object.fromEntries(numbers.map(([key]) => [key, inputs[key].value.trim() ? Number(inputs[key].value) : null])
          .concat(flags.map(([key]) => [key, inputs[key].value === "" ? null : inputs[key].value === "true"]))
          .concat(texts.map(([key]) => [key, inputs[key].value])));
        body.gmNotes = inputs.gmNotes.value;
      }
      busy = true; controls();
      try { const result = await request(`/api/campaigns/${encodeURIComponent(id)}/conditions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (token !== generation || id !== campaignId) return; apply(result); status.textContent = clearRecord ? "Condition record cleared." : "Conditions saved / private GM notes excluded from player view.";
      } catch (error) { if (token === generation) status.textContent = `Save not confirmed: ${error.message} Reload before retrying a conflict.`; }
      finally { busy = false; controls(); if (token !== generation && campaignId && visible()) load(); }
    }
    form.addEventListener("submit", (event) => { event.preventDefault(); saveRecord(); }); form.addEventListener("input", () => { dirty = true; });
    clear.addEventListener("click", () => saveRecord(true));
    reload.addEventListener("click", () => { if (!dirty || confirm("Discard unsaved condition edits and reload?")) { dirty = false; load(); } });
    characterSelect.addEventListener("change", () => {
      if (dirty && !confirm("Discard unsaved edits and change character?")) { characterSelect.value = current.characterId; return; }
      generation += 1; current = data.characters.find((character) => character.characterId === characterSelect.value) || null; fill();
    });
    campaignSelect.addEventListener("change", () => selectCampaign(campaignSelect.value));
    document.addEventListener("fieldbook:campaign-selected", (event) => selectCampaign(event.detail.campaignId));
    document.addEventListener("click", (event) => { if (event.target.closest('[data-view="conditions"]') && !dirty) selectCampaign(campaignSelect.value); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && visible() && !busy && !dirty) load(); });
    setInterval(() => { if (!document.hidden && visible() && !busy && !dirty) load(); }, 15000); selectCampaign(campaignSelect.value);
  }
  const values = document.querySelector("#player-condition-values");
  if (values) {
    const select = document.querySelector("#player-campaign-select"); const status = document.querySelector("#player-condition-status");
    const refresh = document.querySelector("#refresh-character-conditions"); let generation = 0;
    function clear() { values.replaceChildren(); values.hidden = true; }
    function visible() { return !document.querySelector('[data-panel="character"]').hidden; }
    async function load() {
      const token = ++generation; const id = select.value; refresh.disabled = !id;
      if (!id) { clear(); status.textContent = "Select an assigned campaign."; return; }
      try {
        const result = await request(`/api/player/campaigns/${encodeURIComponent(id)}/conditions`); if (token !== generation || select.value !== id) return;
        clear(); if (!result.record) { status.textContent = "No GM condition record."; return; }
        [...numbers, ...flags, ...texts].forEach(([key, label]) => {
          const value = result.record.conditions[key]; const row = document.createElement("div"); if (texts.some(([field]) => field === key)) row.className = "wide";
          const heading = document.createElement("dt"); heading.textContent = label;
          const output = document.createElement("dd"); output.dataset.conditionField = key;
          output.textContent = value === null || value === "" ? "Not recorded" : value === true ? "Present" : value === false ? "Absent" : String(value);
          row.append(heading, output); values.append(row);
        });
        values.hidden = false; status.textContent = `GM record / ${result.record.updatedAt} / revision ${result.record.revision}`;
      } catch (error) { if (token === generation) { clear(); status.textContent = `Conditions unavailable: ${error.message}`; } }
    }
    select.addEventListener("change", () => { clear(); status.textContent = "Loading conditions..."; load(); });
    refresh.addEventListener("click", () => { clear(); load(); });
    document.querySelector("#refresh-player-character").addEventListener("click", () => { clear(); load(); });
    document.querySelector("#player-character-tab").addEventListener("click", () => { clear(); load(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && visible()) load(); });
    setInterval(() => { if (!document.hidden && visible()) load(); }, 15000); load();
  }
})();