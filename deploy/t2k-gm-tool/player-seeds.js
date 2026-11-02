(function () {
  "use strict";

  const ATTRIBUTE_NAMES = ["Strength", "Agility", "Intelligence", "Empathy"];
  const SKILL_GROUPS = [
    { attribute: "Strength", skills: ["Close Combat", "Heavy Weapons", "Stamina"] },
    { attribute: "Agility", skills: ["Driving", "Ranged Combat", "Mobility"] },
    { attribute: "Intelligence", skills: ["Recon", "Survival", "Tech"] },
    { attribute: "Empathy", skills: ["Command", "Medical Aid", "Persuasion"] }
  ];
  const RATING_DICE = { A: "D12", B: "D10", C: "D8", D: "D6" };
  const CREATION_STEPS = ["step-nationality", "step-attributes", "step-careers", "step-war", "step-personal"];
  const form = document.getElementById("seed-form");
  const seedList = document.getElementById("seed-list");
  const blankState = document.getElementById("blank-state");
  const storageState = document.getElementById("storage-state");
  const assignmentNote = document.getElementById("assignment-note");
  const assignButton = document.getElementById("assign-seed");
  const campaignSelect = document.getElementById("assignment-campaign");
  const temporaryPasswordOutput = document.getElementById("temporary-password");
  const legacyDrafts = document.getElementById("legacy-drafts");
  const toast = document.getElementById("toast");
  let seedStore = { seeds: [] };
  let campaigns = [];
  let selectedSeedId = null;
  let storageAvailable = true;
  let toastTimer;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  async function apiRequest(path, options = {}) {
    let response;
    try {
      response = await fetch(path, { credentials: "same-origin", ...options });
    } catch (error) {
      throw new Error("The GM service is unavailable. Open this page through the authenticated Fieldbook server.");
    }
    if (response.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);
      throw new Error("Sign in again to manage player seeds.");
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `GM service returned ${response.status}.`);
    return body;
  }

  function createId(prefix) {
    const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${value}`;
  }

  function textList(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20);
  }

  function normalizeCareerTerm(value, index) {
    const term = isRecord(value) ? value : {};
    const promotion = isRecord(term.promotion) ? term.promotion : {};
    const aging = isRecord(term.aging) ? term.aging : {};
    const warCheck = isRecord(term.warCheck) ? term.warCheck : {};
    const text = (input) => typeof input === "string" ? input : "";
    const yearsAged = aging.yearsAged === "" || aging.yearsAged === null || aging.yearsAged === undefined
      ? null
      : Number(aging.yearsAged);
    return {
      id: typeof term.id === "string" && term.id ? term.id : createId("term"),
      termNumber: index + 1,
      career: text(term.career),
      skillAdvances: textList(term.skillAdvances),
      promotion: {
        skill: text(promotion.skill),
        roll: text(promotion.roll),
        outcome: text(promotion.outcome)
      },
      specialties: textList(term.specialties),
      aging: {
        yearsAged: Number.isSafeInteger(yearsAged) && yearsAged >= 0 ? yearsAged : null,
        effect: text(aging.effect)
      },
      warCheck: {
        roll: text(warCheck.roll),
        outcome: text(warCheck.outcome)
      },
      injuryOutcome: text(term.injuryOutcome),
      notes: text(term.notes)
    };
  }

  function selectedSeed() {
    return seedStore.seeds.find((seed) => seed.id === selectedSeedId) || null;
  }

  function selectedCampaign() {
    return campaigns.find((campaign) => campaign.id === campaignSelect.value) || null;
  }

  function assignedToCampaign(seed, campaignId) {
    return seed?.assignments?.find((assignment) => assignment.campaignId === campaignId) || null;
  }

  function setStatus(message, isError) {
    assignmentNote.textContent = message;
    assignmentNote.classList.toggle("error", Boolean(isError));
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function prepareLegacyDraftExport() {
    let raw;
    try {
      raw = localStorage.getItem("fieldbook-player-seeds-v1");
    } catch (error) {
      return;
    }
    if (!raw) return;
    legacyDrafts.hidden = false;
    document.getElementById("download-legacy-drafts").addEventListener("click", () => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      link.download = "fieldbook-local-player-seeds.json";
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  function makeFieldLabel(text, htmlFor) {
    const label = document.createElement("label");
    label.textContent = text;
    label.htmlFor = htmlFor;
    return label;
  }

  function makeRatingSelect(name, ratings) {
    const select = document.createElement("select");
    select.name = name;
    select.id = name;
    select.dataset.rating = name;
    const unrecorded = new Option("Not recorded", "");
    select.add(unrecorded);
    ratings.forEach((rating) => select.add(new Option(rating, rating)));
    return select;
  }

  function renderRatingFields() {
    const attributes = document.getElementById("attribute-fields");
    ATTRIBUTE_NAMES.forEach((name) => {
      const field = document.createElement("div");
      field.className = "rating-field";
      const selectId = `attribute-${name.toLowerCase()}`;
      const label = makeFieldLabel(name, selectId);
      const select = makeRatingSelect(name, ["A", "B", "C", "D"]);
      select.id = selectId;
      const output = document.createElement("output");
      output.dataset.attributeDie = name;
      output.textContent = "Not recorded";
      field.append(label, select, output);
      attributes.append(field);
    });
  }

  function renderSkillFields() {
    const container = document.getElementById("skill-fields");
    SKILL_GROUPS.forEach((group) => {
      const section = document.createElement("section");
      section.className = "skill-group";
      const heading = document.createElement("h4");
      heading.textContent = group.attribute;
      section.append(heading);
      group.skills.forEach((skill) => {
        const row = document.createElement("label");
        row.className = "skill-line";
        const name = document.createElement("span");
        name.textContent = skill;
        const select = makeRatingSelect(skill, ["A", "B", "C", "D", "F"]);
        select.setAttribute("aria-label", `${skill} rating`);
        const output = document.createElement("output");
        output.dataset.skillDie = skill;
        output.dataset.attribute = group.attribute;
        output.textContent = "Not recorded";
        row.append(name, select, output);
        section.append(row);
      });
      container.append(section);
    });
  }

  function updateDiceDisplays() {
    ATTRIBUTE_NAMES.forEach((name) => {
      const rating = form.elements[name].value;
      const output = document.querySelector(`[data-attribute-die="${name}"]`);
      output.textContent = RATING_DICE[rating] || "Not recorded";
    });
    document.querySelectorAll("[data-skill-die]").forEach((output) => {
      const skill = output.dataset.skillDie;
      const attribute = output.dataset.attribute;
      const rating = form.elements[skill].value;
      const attributeDie = RATING_DICE[form.elements[attribute].value];
      if (rating === "F") output.textContent = attributeDie ? `F / ${attributeDie}` : "F / attribute unset";
      else output.textContent = RATING_DICE[rating] || "Not recorded";
    });
    const cufDie = document.getElementById("cuf-die");
    cufDie.textContent = RATING_DICE[form.elements.cuf.value] || "Not recorded";
  }

  function renderSeedList() {
    seedList.replaceChildren();
    document.getElementById("seed-count").textContent = `${seedStore.seeds.length} ${seedStore.seeds.length === 1 ? "template" : "templates"}`;
    if (!seedStore.seeds.length) {
      const empty = document.createElement("div");
      empty.className = "empty-list";
      empty.textContent = "No player seeds yet.";
      seedList.append(empty);
      return;
    }
    seedStore.seeds.forEach((seed) => {
      const button = document.createElement("button");
      button.className = "seed-row";
      button.type = "button";
      button.setAttribute("aria-current", String(seed.id === selectedSeedId));
      const player = document.createElement("strong");
      player.textContent = `${seed.displayLabel} / ${seed.username}`;
      const character = document.createElement("span");
      character.textContent = seed.character.characterName || "Character name not set";
      const status = document.createElement("span");
      status.className = seed.assignments?.length ? "assigned" : "";
      status.textContent = seed.assignments?.length
        ? `Assigned / ${seed.assignments.map((assignment) => assignment.campaignName).join(", ")}`
        : "Independent / unassigned";
      button.append(player, character, status);
      button.addEventListener("click", () => selectSeed(seed.id));
      seedList.append(button);
    });
  }

  function clearForm() {
    form.reset();
    renderCareerTerms([]);
    renderLegacyCareerNotes("");
    updateDiceDisplays();
  }

  function setFormVisible(isVisible) {
    blankState.hidden = isVisible;
    form.hidden = !isVisible;
  }

  async function updateAssignmentControls() {
    const campaign = selectedCampaign();
    const seed = selectedSeed();
    const assignment = seed && campaign ? assignedToCampaign(seed, campaign.id) : null;
    assignButton.disabled = !storageAvailable || !seed || !campaign;
    document.getElementById("delete-seed").disabled = !storageAvailable || !seed || Boolean(seed.assignments?.length);
    if (seed && seed.assignments?.length) {
      setStatus("This template has campaign assignments. The GM can edit the template independently; assigned campaign characters remain unchanged.", false);
    }
    if (!campaign) {
      assignButton.textContent = "Add to campaign";
      if (!seed?.assignments?.length) setStatus("Choose a campaign to assign this independent player template.", false);
      return;
    }
    if (assignment) {
      assignButton.textContent = "Already assigned";
      assignButton.disabled = true;
      setStatus(`${seed.displayLabel} is already assigned to ${campaign.name}.`, false);
      return;
    }
    if (!seed) return;
    assignButton.textContent = `Add to ${campaign.name}`;
    try {
      const { seeds } = await apiRequest(`/api/campaigns/${encodeURIComponent(campaign.id)}/player-seeds`);
      if (selectedSeedId !== seed.id || campaignSelect.value !== campaign.id) return;
      const seatsFull = seeds.length >= 4;
      assignButton.disabled = !storageAvailable || seatsFull;
      setStatus(seatsFull ? `${campaign.name} already has four player seats.` : `${campaign.name} / ${seeds.length} of 4 seats used.`, seatsFull);
    } catch (error) {
      if (selectedSeedId === seed.id && campaignSelect.value === campaign.id) {
        assignButton.disabled = true;
        setStatus(error.message, true);
      }
    }
  }

  function selectSeed(seedId) {
    const seed = seedStore.seeds.find((item) => item.id === seedId);
    if (!seed) return;
    selectedSeedId = seed.id;
    clearForm();
    Object.entries(seed.character).forEach(([name, value]) => {
      if (form.elements[name]) form.elements[name].value = value ?? "";
    });
    ATTRIBUTE_NAMES.forEach((name) => {
      form.elements[name].value = seed.character.attributes?.[name] || "";
    });
    SKILL_GROUPS.forEach((group) => group.skills.forEach((skill) => {
      form.elements[skill].value = seed.character.skills?.[skill] || "";
    }));
    const lifePath = isRecord(seed.character.lifePath) ? seed.character.lifePath : {};
    renderCareerTerms(Array.isArray(lifePath.careerTerms) ? lifePath.careerTerms : []);
    renderLegacyCareerNotes(lifePath.legacyCareerNotes);
    form.elements.username.value = seed.username;
    form.elements.username.disabled = true;
    form.elements.displayLabel.value = seed.displayLabel;
    CREATION_STEPS.forEach((name) => {
      form.elements[name].checked = Boolean(seed.creationSteps?.[name]);
    });
    document.getElementById("editor-title").textContent = seed.character.characterName || seed.displayLabel;
    document.getElementById("editor-subtitle").textContent = `SEED ${seed.id.slice(-8).toUpperCase()} / GM-ONLY TEMPLATE`;
    temporaryPasswordOutput.hidden = true;
    temporaryPasswordOutput.textContent = "";
    setFormVisible(true);
    updateDiceDisplays();
    updateAssignmentControls();
    renderSeedList();
  }

  function startNewSeed() {
    selectedSeedId = null;
    clearForm();
    form.elements.username.disabled = false;
    temporaryPasswordOutput.hidden = true;
    temporaryPasswordOutput.textContent = "";
    document.getElementById("editor-title").textContent = "New player seed";
    document.getElementById("editor-subtitle").textContent = "UNASSIGNED / GM-ONLY TEMPLATE";
    setFormVisible(true);
    setStatus("This template has no campaign link until you explicitly assign it.", false);
    assignButton.disabled = true;
    document.getElementById("delete-seed").disabled = true;
    renderSeedList();
    form.elements.username.focus();
  }

  function makeTermField(index, key, labelText, value, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = `field${options.full ? " full" : ""}`;
    const id = `career-term-${index}-${key.replace(/[^a-z0-9]+/gi, "-")}`;
    const label = makeFieldLabel(labelText, id);
    let control;
    if (options.choices) {
      control = document.createElement("select");
      options.choices.forEach(([choiceValue, choiceLabel]) => control.add(new Option(choiceLabel, choiceValue)));
    } else if (options.multiline) {
      control = document.createElement("textarea");
      control.rows = 2;
      if (options.placeholder) control.placeholder = options.placeholder;
    } else {
      control = document.createElement("input");
      control.type = options.type || "text";
      if (options.type === "number") {
        control.min = "0";
        control.max = "99";
        control.step = "1";
      }
    }
    control.id = id;
    control.dataset.termField = key;
    control.value = value ?? "";
    wrapper.append(label, control);
    return wrapper;
  }

  function linesFromField(card, key) {
    return (card.querySelector(`[data-term-field="${key}"]`)?.value || "")
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20);
  }

  function readCareerTermsFromForm() {
    return [...document.querySelectorAll("[data-career-term]")].map((card, index) => {
      const read = (key) => card.querySelector(`[data-term-field="${key}"]`)?.value.trim() || "";
      return normalizeCareerTerm({
        id: card.dataset.termId,
        career: read("career"),
        skillAdvances: linesFromField(card, "skillAdvances"),
        promotion: { skill: read("promotion.skill"), roll: read("promotion.roll"), outcome: read("promotion.outcome") },
        specialties: linesFromField(card, "specialties"),
        aging: { yearsAged: read("aging.yearsAged"), effect: read("aging.effect") },
        warCheck: { roll: read("warCheck.roll"), outcome: read("warCheck.outcome") },
        injuryOutcome: read("injuryOutcome"),
        notes: read("notes")
      }, index);
    });
  }

  function renderCareerTerms(terms) {
    const container = document.getElementById("career-terms-list");
    container.replaceChildren();
    if (!terms.length) {
      const empty = document.createElement("p");
      empty.className = "assignment-note";
      empty.textContent = "No career terms recorded.";
      container.append(empty);
      return;
    }
    terms.forEach((value, index) => {
      const term = normalizeCareerTerm(value, index);
      const card = document.createElement("section");
      card.className = "career-term";
      card.dataset.careerTerm = "true";
      card.dataset.termId = term.id;
      const head = document.createElement("header");
      head.className = "career-term-head";
      const title = document.createElement("h4");
      title.textContent = `Term ${index + 1}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-danger";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove career term ${index + 1}`);
      remove.addEventListener("click", () => {
        const remaining = readCareerTermsFromForm();
        remaining.splice(index, 1);
        renderCareerTerms(remaining);
      });
      head.append(title, remove);
      const fields = document.createElement("div");
      fields.className = "fields";
      fields.append(
        makeTermField(index, "career", "Career / term", term.career),
        makeTermField(index, "skillAdvances", "Skill advances / one per line", term.skillAdvances.join("\n"), { multiline: true, placeholder: "Record the skill and resulting rating manually." }),
        makeTermField(index, "promotion.skill", "Promotion skill", term.promotion.skill),
        makeTermField(index, "promotion.roll", "Promotion roll / result", term.promotion.roll),
        makeTermField(index, "promotion.outcome", "Promotion outcome", term.promotion.outcome, { choices: [["", "Not recorded"], ["success", "Success"], ["failure", "Failure"], ["not-applicable", "Not applicable"]] }),
        makeTermField(index, "specialties", "Specialties / one per line", term.specialties.join("\n"), { multiline: true }),
        makeTermField(index, "aging.yearsAged", "Years aged this term", term.aging.yearsAged, { type: "number" }),
        makeTermField(index, "aging.effect", "Aging effect / outcome", term.aging.effect, { multiline: true }),
        makeTermField(index, "warCheck.roll", "War check roll / target", term.warCheck.roll),
        makeTermField(index, "warCheck.outcome", "War check outcome", term.warCheck.outcome, { choices: [["", "Not recorded"], ["no-outbreak", "War did not break out"], ["war-broke-out", "War broke out"], ["not-applicable", "Not applicable"]] }),
        makeTermField(index, "injuryOutcome", "Injury / other outcomes", term.injuryOutcome, { multiline: true, full: true }),
        makeTermField(index, "notes", "GM notes for this term", term.notes, { multiline: true, full: true })
      );
      card.append(head, fields);
      container.append(card);
    });
  }

  function renderLegacyCareerNotes(value) {
    const field = document.getElementById("legacy-career-notes-field");
    const textarea = document.getElementById("legacy-career-notes");
    textarea.value = value || "";
    field.hidden = !textarea.value;
  }

  function readFormValue(name) {
    return String(new FormData(form).get(name) || "").trim();
  }

  function characterFromForm() {
    const values = {};
    [
      "characterName", "nationality", "age", "branch", "militaryRank", "specialties", "childhood",
      "atWarTerm", "cuf", "startingGear", "appearance", "moralCode", "bigDream",
      "buddy", "howMetGroup", "gmNotes"
    ].forEach((name) => { values[name] = readFormValue(name); });
    values.age = values.age ? Number(values.age) : "";
    values.attributes = Object.fromEntries(ATTRIBUTE_NAMES.map((name) => [name, form.elements[name].value]));
    values.skills = Object.fromEntries(SKILL_GROUPS.flatMap((group) => group.skills.map((skill) => [skill, form.elements[skill].value])));
    values.lifePath = {
      careerTerms: readCareerTermsFromForm(),
      legacyCareerNotes: readFormValue("legacyCareerNotes")
    };
    values.creationSteps = Object.fromEntries(CREATION_STEPS.map((name) => [name, form.elements[name].checked]));
    return values;
  }

  async function saveCurrentSeed(event) {
    event.preventDefault();
    if (!storageAvailable || !form.reportValidity()) return;
    const existing = selectedSeed();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    setStatus("Saving GM-owned template…", false);
    try {
      const payload = {
        username: existing?.username || readFormValue("username"),
        displayLabel: readFormValue("displayLabel"),
        character: characterFromForm()
      };
      const path = existing ? `/api/player-seeds/${encodeURIComponent(existing.id)}` : "/api/player-seeds";
      const { seed, temporaryPassword } = await apiRequest(path, {
        method: existing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      seedStore.seeds = existing
        ? seedStore.seeds.map((item) => item.id === seed.id ? seed : item)
        : [seed, ...seedStore.seeds];
      selectedSeedId = seed.id;
      document.getElementById("editor-title").textContent = seed.character.characterName || seed.displayLabel;
      document.getElementById("editor-subtitle").textContent = `SEED ${seed.id.slice(-8).toUpperCase()} / GM-ONLY TEMPLATE`;
      if (temporaryPassword) {
        temporaryPasswordOutput.textContent = `Username: ${seed.username}\nTemporary password: ${temporaryPassword}\nShare through a secure channel. The player must change it at first login.`;
        temporaryPasswordOutput.hidden = false;
      }
      form.elements.username.disabled = true;
      storageState.textContent = "GM service saved";
      renderSeedList();
      await updateAssignmentControls();
      showToast(existing ? "Player seed updated." : "Player seed and player login created.");
    } catch (error) {
      setStatus(error.message, true);
      showToast("Player seed was not saved.");
    } finally {
      submit.disabled = false;
    }
  }

  async function assignSelectedSeed() {
    const seed = selectedSeed();
    const campaign = selectedCampaign();
    if (!seed || !campaign || assignedToCampaign(seed, campaign.id)) return;
    assignButton.disabled = true;
    setStatus(`Adding ${seed.displayLabel} to ${campaign.name}…`, false);
    try {
      await apiRequest(`/api/campaigns/${encodeURIComponent(campaign.id)}/player-seeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seedId: seed.id })
      });
      const { seeds } = await apiRequest("/api/player-seeds");
      seedStore.seeds = seeds;
      renderSeedList();
      await updateAssignmentControls();
      showToast(`Added ${seed.displayLabel} to ${campaign.name}.`);
    } catch (error) {
      setStatus(error.message, true);
      assignButton.disabled = false;
    }
  }

  async function deleteSelectedSeed() {
    const seed = selectedSeed();
    if (!seed || seed.assignments?.length) return;
    if (!window.confirm(`Delete the player template for ${seed.username}? The player login will remain and can be assigned a new template later.`)) return;
    try {
      await apiRequest(`/api/player-seeds/${encodeURIComponent(seed.id)}`, { method: "DELETE" });
      seedStore.seeds = seedStore.seeds.filter((item) => item.id !== seed.id);
      selectedSeedId = null;
      setFormVisible(false);
      renderSeedList();
      await updateAssignmentControls();
      showToast("Player seed deleted.");
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function initialize() {
    prepareLegacyDraftExport();
    renderRatingFields();
    renderSkillFields();
    renderCareerTerms([]);
    updateDiceDisplays();
    document.getElementById("new-seed").addEventListener("click", startNewSeed);
    document.getElementById("empty-new-seed").addEventListener("click", startNewSeed);
    form.addEventListener("submit", saveCurrentSeed);
    form.addEventListener("change", updateDiceDisplays);
    assignButton.addEventListener("click", assignSelectedSeed);
    campaignSelect.addEventListener("change", updateAssignmentControls);
    document.getElementById("delete-seed").addEventListener("click", deleteSelectedSeed);
    document.getElementById("add-career-term").addEventListener("click", () => {
      const terms = readCareerTermsFromForm();
      terms.push(normalizeCareerTerm({}, terms.length));
      renderCareerTerms(terms);
    });
    try {
      const [seedResponse, campaignResponse] = await Promise.all([
        apiRequest("/api/player-seeds"),
        apiRequest("/api/campaigns")
      ]);
      seedStore.seeds = seedResponse.seeds;
      campaigns = campaignResponse.campaigns;
      campaignSelect.replaceChildren(new Option(campaigns.length ? "Choose campaign" : "No campaigns available", ""));
      campaigns.forEach((campaign) => campaignSelect.add(new Option(`${campaign.name} / ${campaign.setting}`, campaign.id)));
      campaignSelect.disabled = campaigns.length === 0;
      storageState.textContent = "GM service connected";
      storageState.classList.remove("error");
      storageAvailable = true;
      renderSeedList();
      updateAssignmentControls();
    } catch (error) {
      storageAvailable = false;
      storageState.textContent = "GM service unavailable";
      storageState.classList.add("error");
      setStatus(error.message, true);
      document.getElementById("new-seed").disabled = true;
      document.getElementById("empty-new-seed").disabled = true;
      campaignSelect.disabled = true;
      form.hidden = true;
      blankState.hidden = false;
      blankState.querySelector("p").textContent = "Sign in to the GM service to create and assign server-owned player templates.";
      blankState.querySelector("button").hidden = true;
    }
  }

  initialize();
})();