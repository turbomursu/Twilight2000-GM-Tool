(() => {
  const workspace = document.querySelector(".inventory-workspace");
  if (!workspace) return;
  const gm = workspace.dataset.inventoryRole === "gm";
  const campaignSelect = document.querySelector(gm ? "#runtime-campaign-select" : "#player-campaign-select");
  const characterSelect = document.querySelector("#inventory-character");
  const status = document.querySelector("#inventory-status");
  const refresh = document.querySelector("#refresh-inventory");
  const form = document.querySelector("#inventory-item-form");
  const editor = document.querySelector("#inventory-editor");
  const accepted = document.querySelector("#inventory-accepted");
  const proposals = document.querySelector("#inventory-proposals");
  const locations = [["unassigned", "Unassigned"], ["combat-gear", "Combat gear"], ["backpack", "Backpack"], ["tiny-items", "Tiny items"]];
  const sources = [["UF", "UF / Unverified"], ["GM", "GM / GM-defined"], ["RB", "RB / Rule book"]];
  let campaignId = "";
  let generation = 0;
  let loadToken = 0;
  let data = null;
  let current = null;
  let target = null;
  let busy = false;
  const inputs = {};

  function element(tag, text, className) {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node;
  }
  function button(text, label, action) {
    const node = element("button", text, gm ? "button" : "item-button"); node.type = "button";
    node.title = label; node.setAttribute("aria-label", label); node.dataset.inventoryCommand = ""; node.addEventListener("click", action); return node;
  }
  function field(container, name, label, options = {}) {
    const wrapper = element("label", undefined, options.wide ? "wide" : ""); wrapper.append(element("span", label));
    const input = document.createElement(options.options ? "select" : options.multiline ? "textarea" : "input");
    input.name = name;
    if (options.options) options.options.forEach(([value, text]) => input.add(new Option(text, value)));
    else { input.type = options.type || "text"; if (options.maximum) input.maxLength = options.maximum; }
    if (options.required) input.required = true;
    wrapper.append(input); container.append(wrapper); return input;
  }
  inputs.name = field(editor, "name", "Item name", { maximum: 100, required: true });
  inputs.quantity = field(editor, "quantity", "Quantity", { type: "number", required: true });
  inputs.quantity.min = "0"; inputs.quantity.max = "1000000"; inputs.quantity.step = "1";
  inputs.carryLocation = field(editor, "carryLocation", "Carry location", { options: locations });
  inputs.sourceCategory = field(editor, "sourceCategory", gm ? "Reviewed source category" : "Claimed source category", { options: sources });
  inputs.sourceReference = field(editor, "sourceReference", "Source reference", { maximum: 240, wide: true });
  inputs.details = field(editor, "details", gm ? "Item details / player-visible" : "Item details / GM-managed", { maximum: 2000, multiline: true, wide: true });
  const confirmation = gm ? field(editor, "confirmSource", "I reviewed this source classification; UF remains unverified", { type: "checkbox", required: true, wide: true }) : null;
  const actions = element("div", undefined, "wide report-actions");
  const save = element("button", gm ? "Stock item" : "Submit item proposal", gm ? "button button-primary" : "item-button"); save.type = "submit";
  actions.append(save, button("Cancel edit", "Cancel item edit", resetEditor)); editor.append(actions);

  function visible() { return gm ? workspace.classList.contains("active") : !workspace.hidden; }
  function root(id = campaignId) { return `${gm ? "/api/campaigns" : "/api/player/campaigns"}/${encodeURIComponent(id)}/inventory`; }
  function controls() {
    editor.disabled = busy || !current; refresh.disabled = busy || !campaignId;
    if (characterSelect) characterSelect.disabled = busy || !data?.characters?.length;
    workspace.querySelectorAll("[data-inventory-command]").forEach((node) => { node.disabled = busy || !current || node.dataset.blocked === "true"; });
    workspace.querySelectorAll(".inventory-proposal fieldset").forEach((node) => { node.disabled = busy || !current; });
  }
  function resetEditor() {
    target = null; form.reset(); inputs.quantity.value = "1";
    document.querySelector("#inventory-editor-title").textContent = gm ? "Stock item" : "New item proposal";
    save.textContent = gm ? "Stock item" : "Submit item proposal";
  }
  function edit(item) {
    target = { id: item.id, revision: item.revision };
    Object.keys(inputs).forEach((key) => { inputs[key].value = item[key]; }); if (confirmation) confirmation.checked = false;
    document.querySelector("#inventory-editor-title").textContent = gm ? "Correct accepted item" : "Propose item / quantity change";
    save.textContent = gm ? "Save correction" : "Submit change proposal";
    form.scrollIntoView({ block: "nearest" });
  }
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options }); const result = await response.json();
    if (response.status === 401) location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) throw new Error(result.error || "Inventory request failed."); return result;
  }
  function apply(result) {
    data = result.inventory;
    if (gm) {
      const selected = characterSelect.value; characterSelect.replaceChildren();
      data.characters.forEach((character) => characterSelect.add(new Option(character.displayLabel, character.characterId)));
      characterSelect.value = data.characters.some((character) => character.characterId === selected) ? selected : data.characters[0]?.characterId || "";
      current = data.characters.find((character) => character.characterId === characterSelect.value) || null;
      document.dispatchEvent(new CustomEvent("fieldbook:inventory-updated", { detail: data }));
    } else {
      current = data; document.querySelector("#player-inventory-name").textContent = `${data.displayLabel} / Inventory`;
    }
    render(); controls();
  }
  async function load() {
    if (!campaignId) return false;
    const token = ++loadToken; const id = campaignId;
    try {
      const result = await request(root(id)); if (token !== loadToken || id !== campaignId) return false;
      apply(result); status.textContent = current ? `${current.items.length} accepted items / ${current.proposals.filter((proposal) => proposal.status === "pending").length} pending` : "No campaign characters assigned.";
      return true;
    } catch (error) {
      if (token === loadToken && id === campaignId) { data = null; current = null; accepted.replaceChildren(); proposals.replaceChildren(); status.textContent = `Inventory unavailable: ${error.message}`; controls(); }
      return false;
    }
  }
  async function mutate(url, body, message, clearEditor = false) {
    if (busy || !current) return;
    const id = campaignId; const token = generation; busy = true; controls();
    try {
      const result = await request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (token !== generation || id !== campaignId) return;
      if (clearEditor) resetEditor();
      let refreshed = true;
      if (gm) apply(result); else refreshed = await load();
      if (token === generation) status.textContent = refreshed ? message : `${message} Refresh unavailable; reload to see the result.`;
    } catch (error) { if (token === generation) status.textContent = `Save not confirmed: ${error.message} Refresh before retrying to avoid stale or duplicate changes.`; }
    finally { busy = false; controls(); if (token !== generation && campaignId && visible()) load(); }
  }
  function remove(item) {
    if (!confirm(gm ? "Remove this accepted item?" : "Submit an item removal proposal to the GM?")) return;
    const body = { kind: "remove", itemId: item.id, expectedItemRevision: item.revision };
    if (gm) body.characterId = current.characterId;
    mutate(gm ? root() : `${root()}/proposals`, body, gm ? "Item removed." : "Removal pending GM review.");
  }
  function render() {
    const expanded = new Set([...proposals.querySelectorAll("details[open]")].map((row) => row.dataset.inventoryProposal));
    accepted.replaceChildren(); proposals.replaceChildren(); if (!current) return;
    if (!current.items.length) accepted.append(element("p", "No accepted items."));
    current.items.forEach((item) => {
      const row = element("div", undefined, "inventory-row"); row.dataset.inventoryItem = item.id;
      row.append(element("strong", `${item.sourceCategory} / ${item.name}`));
      const tools = element("div", undefined, "report-actions"); tools.append(element("output", `Qty ${item.quantity}`));
      const pending = current.proposals.some((proposal) => proposal.status === "pending" && proposal.itemId === item.id);
      const editButton = button("\u270e", "Edit item or propose quantity change", () => edit(item));
      const removeButton = button("\u00d7", "Remove item or propose removal", () => remove(item));
      if (!gm && pending) { editButton.dataset.blocked = "true"; removeButton.dataset.blocked = "true"; }
      tools.append(editButton, removeButton); row.append(tools);
      row.append(element("p", `${locations.find(([key]) => key === item.carryLocation)[1]} / ${item.sourceCategory === "UF" ? "Unverified" : "GM-reviewed source"}\n${item.sourceReference || "No reference recorded"}${item.details ? `\n${item.details}` : ""}${pending ? "\nPending proposal" : ""}`));
      accepted.append(row);
    });
    if (!current.proposals.length) proposals.append(element("p", "No proposals."));
    current.proposals.forEach((proposal) => {
      const row = element(proposal.status === "pending" ? "section" : "details", undefined, "inventory-proposal"); row.dataset.inventoryProposal = proposal.id;
      if (expanded.has(proposal.id)) row.open = true;
      const name = proposal.item?.name || current.items.find((item) => item.id === proposal.itemId)?.name || "Item removal";
      row.append(element(proposal.status === "pending" ? "strong" : "summary", `${proposal.status.toUpperCase()} / ${proposal.kind} / ${name}`));
      if (proposal.item) row.append(element("p", `Claimed ${proposal.item.sourceCategory} / Qty ${proposal.item.quantity} / ${locations.find(([key]) => key === proposal.item.carryLocation)[1]}\n${proposal.item.sourceReference || "No reference claimed"}${proposal.item.details ? `\n${proposal.item.details}` : ""}`));
      row.append(element("p", `Submitted ${proposal.submittedAt}${proposal.reviewedAt ? ` / Reviewed ${proposal.reviewedAt}` : ""}${proposal.reviewNote ? `\n${proposal.reviewNote}` : ""}`));
      if (gm && proposal.status === "pending") {
        const reviewFields = element("fieldset", undefined, "inventory-editor");
        reviewFields.addEventListener("input", () => { reviewFields.dataset.dirty = "true"; });
        let category; let reference; let confirm;
        if (proposal.kind !== "remove") {
          category = field(reviewFields, "reviewSourceCategory", "Accepted source category", { options: sources }); category.value = proposal.item.sourceCategory;
          reference = field(reviewFields, "reviewSourceReference", "Accepted reference", { maximum: 240 }); reference.value = proposal.item.sourceReference;
          confirm = field(reviewFields, "reviewConfirmSource", "I reviewed the source claim; UF remains unverified", { type: "checkbox", wide: true });
        }
        const note = field(reviewFields, "reviewNote", "Player-visible review note", { maximum: 1000, wide: true });
        const reviewActions = element("div", undefined, "wide report-actions");
        reviewActions.append(button("Approve", "Approve inventory proposal", () => {
          const body = { decision: "approve", reviewNote: note.value };
          if (proposal.kind !== "remove") Object.assign(body, { sourceCategory: category.value, sourceReference: reference.value, confirmSource: confirm.checked });
          mutate(`${root()}/proposals/${encodeURIComponent(proposal.id)}/review`, body, "Proposal approved.");
        }), button("Reject", "Reject inventory proposal", () => mutate(`${root()}/proposals/${encodeURIComponent(proposal.id)}/review`, { decision: "reject", reviewNote: note.value }, "Proposal rejected.")));
        reviewFields.append(reviewActions); row.append(reviewFields);
      }
      proposals.append(row);
    });
  }
  function selectCampaign(id) {
    if (id !== campaignId) {
      campaignId = id; generation += 1; loadToken += 1; data = null; current = null; resetEditor(); accepted.replaceChildren(); proposals.replaceChildren();
      if (characterSelect) characterSelect.replaceChildren(); else document.querySelector("#player-inventory-name").textContent = "Inventory";
    }
    status.textContent = id ? "Loading inventory..." : "Select a campaign."; controls(); if (id && visible() && !busy) load();
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault(); if (busy || !current) return;
    const item = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, key === "quantity" ? Number(input.value) : input.value]));
    const body = target ? { kind: "update", itemId: target.id, expectedItemRevision: target.revision, item } : { kind: "add", item };
    if (gm) Object.assign(body, { characterId: current.characterId, confirmSource: confirmation.checked });
    mutate(gm ? root() : `${root()}/proposals`, body, gm ? "Accepted inventory saved." : "Proposal submitted / accepted inventory unchanged.", true);
  });
  function reviewDirty() { return Boolean(workspace.querySelector('.inventory-proposal fieldset[data-dirty="true"]')); }
  refresh.addEventListener("click", () => { if (!busy && (!reviewDirty() || confirm("Discard unsaved review fields and refresh?"))) load(); });
  campaignSelect.addEventListener("change", () => selectCampaign(campaignSelect.value));
  if (gm) {
    characterSelect.addEventListener("change", () => { current = data?.characters.find((character) => character.characterId === characterSelect.value) || null; generation += 1; resetEditor(); render(); controls(); });
    document.addEventListener("fieldbook:campaign-selected", (event) => selectCampaign(event.detail.campaignId));
    document.addEventListener("click", (event) => { if (event.target.closest('[data-view="inventory"]')) selectCampaign(campaignSelect.value); });
  } else {
    document.querySelector("#player-inventory-tab").addEventListener("click", () => document.dispatchEvent(new CustomEvent("fieldbook:player-view", { detail: { view: "inventory" } })));
    document.addEventListener("fieldbook:player-view", (event) => { if (event.detail.view === "inventory") selectCampaign(campaignSelect.value); });
    document.querySelector("#refresh-player-character").addEventListener("click", () => { if (visible() && !busy) load(); });
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible() && !busy && !reviewDirty()) load(); });
  setInterval(() => { if (!document.hidden && visible() && !busy && !reviewDirty()) load(); }, 15000);
  resetEditor(); selectCampaign(campaignSelect.value);
})();