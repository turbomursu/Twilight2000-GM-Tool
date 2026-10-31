(function () {
  "use strict";

  const SEED_STORE_KEY = "fieldbook-player-seeds-v1";
  const CAMPAIGN_STORE_KEY = "fieldbook-twilight-2000-v1";
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
  const toast = document.getElementById("toast");
  let seedStore;
  let selectedSeedId = null;
  let storageAvailable = true;
  let toastTimer;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function createId(prefix) {
    const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${value}`;
  }

  function readSeedStore() {
    const raw = localStorage.getItem(SEED_STORE_KEY);
    if (!raw) return { schemaVersion: 1, seeds: [] };
    const saved = JSON.parse(raw);
    if (!isRecord(saved) || saved.schemaVersion !== 1 || !Array.isArray(saved.seeds)) {
      throw new Error("The player seed store is not a supported version.");
    }
    return saved;
  }

  function readCampaignRecord() {
    try {
      const saved = JSON.parse(localStorage.getItem(CAMPAIGN_STORE_KEY));
      if (!isRecord(saved) || !isRecord(saved.setupPackage) || !isRecord(saved.setupPackage.campaign)
        || typeof saved.setupPackage.campaign.id !== "string" || typeof saved.setupPackage.campaign.name !== "string") return null;
      return saved;
    } catch (error) {
      return null;
    }
  }

  function currentCampaign(record) {
    if (!isRecord(record) || !isRecord(record.setupPackage) || !isRecord(record.setupPackage.campaign)) return null;
    const campaign = record.setupPackage.campaign;
    return typeof campaign.id === "string" && typeof campaign.name === "string"
      ? { id: campaign.id, name: campaign.name }
      : null;
  }

  function currentSeats(record) {
    return Array.isArray(record?.playerSeats) ? record.playerSeats.filter(isRecord) : [];
  }

  function selectedSeed() {
    return seedStore.seeds.find((seed) => seed.id === selectedSeedId) || null;
  }

  function assignedSeat(seedId, record) {
    return currentSeats(record).find((seat) => seat.seedId === seedId) || null;
  }

  function saveSeedStore() {
    try {
      localStorage.setItem(SEED_STORE_KEY, JSON.stringify(seedStore));
      storageState.textContent = "Local store saved";
      storageState.classList.remove("error");
      storageAvailable = true;
      return true;
    } catch (error) {
      storageState.textContent = "Local storage unavailable";
      storageState.classList.add("error");
      storageAvailable = false;
      return false;
    }
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
    const campaignRecord = readCampaignRecord();
    if (!seedStore.seeds.length) {
      const empty = document.createElement("div");
      empty.className = "empty-list";
      empty.textContent = "No player seeds yet.";
      seedList.append(empty);
      return;
    }
    seedStore.seeds.forEach((seed) => {
      const button = document.createElement("button");
      const seat = assignedSeat(seed.id, campaignRecord);
      button.className = "seed-row";
      button.type = "button";
      button.setAttribute("aria-current", String(seed.id === selectedSeedId));
      const player = document.createElement("strong");
      player.textContent = seed.playerName;
      const character = document.createElement("span");
      character.textContent = seed.character.characterName || "Character name not set";
      const status = document.createElement("span");
      status.className = seat ? "assigned" : "";
      status.textContent = seat ? `In ${currentCampaign(campaignRecord)?.name || "campaign"}` : "Independent / unassigned";
      button.append(player, character, status);
      button.addEventListener("click", () => selectSeed(seed.id));
      seedList.append(button);
    });
  }

  function clearForm() {
    form.reset();
    updateDiceDisplays();
  }

  function setFormVisible(isVisible) {
    blankState.hidden = isVisible;
    form.hidden = !isVisible;
  }

  function updateAssignmentControls() {
    const campaignRecord = readCampaignRecord();
    const campaign = currentCampaign(campaignRecord);
    const seed = selectedSeed();
    const seat = seed ? assignedSeat(seed.id, campaignRecord) : null;
    assignButton.disabled = !storageAvailable || !seed || !campaign;
    document.getElementById("delete-seed").disabled = !storageAvailable || !seed || Boolean(seat);
    if (!campaign) {
      assignButton.textContent = "Add to campaign";
      setStatus("Independent seed. Import a setup package into the GM runtime before assigning it to a campaign.", false);
      return;
    }
    if (seat) {
      assignButton.textContent = "Remove from campaign";
      setStatus(`Assigned to ${campaign.name} as a separate campaign copy. Editing this seed will not change the assigned copy.`, false);
      return;
    }
    assignButton.textContent = "Add to campaign";
    const seats = currentSeats(campaignRecord);
    setStatus(seats.length >= 4
      ? `${campaign.name} already has four player seats.`
      : `Independent seed. Active campaign: ${campaign.name} / ${seats.length} of 4 seats used.`, seats.length >= 4);
    assignButton.disabled = !storageAvailable || !seed || seats.length >= 4;
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
    form.elements.playerName.value = seed.playerName;
    CREATION_STEPS.forEach((name) => {
      form.elements[name].checked = Boolean(seed.creationSteps?.[name]);
    });
    document.getElementById("editor-title").textContent = seed.character.characterName || seed.playerName;
    document.getElementById("editor-subtitle").textContent = `SEED ${seed.id.slice(-8).toUpperCase()} / GM-ONLY TEMPLATE`;
    setFormVisible(true);
    updateDiceDisplays();
    updateAssignmentControls();
    renderSeedList();
  }

  function startNewSeed() {
    selectedSeedId = null;
    clearForm();
    document.getElementById("editor-title").textContent = "New player seed";
    document.getElementById("editor-subtitle").textContent = "UNASSIGNED / GM-ONLY TEMPLATE";
    setFormVisible(true);
    setStatus("This template has no campaign link until you explicitly assign it.", false);
    assignButton.disabled = true;
    document.getElementById("delete-seed").disabled = true;
    renderSeedList();
    form.elements.playerName.focus();
  }

  function readFormValue(name) {
    return String(new FormData(form).get(name) || "").trim();
  }

  function characterFromForm() {
    const values = {};
    [
      "characterName", "nationality", "age", "branch", "militaryRank", "specialties", "childhood",
      "careerTerms", "atWarTerm", "cuf", "startingGear", "appearance", "moralCode", "bigDream",
      "buddy", "howMetGroup", "gmNotes"
    ].forEach((name) => { values[name] = readFormValue(name); });
    values.age = values.age ? Number(values.age) : "";
    values.attributes = Object.fromEntries(ATTRIBUTE_NAMES.map((name) => [name, form.elements[name].value]));
    values.skills = Object.fromEntries(SKILL_GROUPS.flatMap((group) => group.skills.map((skill) => [skill, form.elements[skill].value])));
    return values;
  }

  function saveCurrentSeed(event) {
    event.preventDefault();
    if (!storageAvailable || !form.reportValidity()) return;
    const playerName = readFormValue("playerName");
    const character = characterFromForm();
    const now = new Date().toISOString();
    const existing = selectedSeed();
    const seed = {
      id: existing?.id || createId("seed"),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      playerName,
      character,
      creationSteps: Object.fromEntries(CREATION_STEPS.map((name) => [name, form.elements[name].checked]))
    };
    if (existing) seedStore.seeds = seedStore.seeds.map((item) => item.id === seed.id ? seed : item);
    else seedStore.seeds.unshift(seed);
    selectedSeedId = seed.id;
    if (!saveSeedStore()) return;
    document.getElementById("editor-title").textContent = character.characterName || playerName;
    document.getElementById("editor-subtitle").textContent = `SEED ${seed.id.slice(-8).toUpperCase()} / GM-ONLY TEMPLATE`;
    renderSeedList();
    updateAssignmentControls();
    showToast("Player seed saved.");
  }

  function assignSelectedSeed() {
    const seed = selectedSeed();
    const campaignRecord = readCampaignRecord();
    const campaign = currentCampaign(campaignRecord);
    if (!seed || !campaignRecord || !campaign) return;
    const seats = currentSeats(campaignRecord);
    const existingSeat = seats.find((seat) => seat.seedId === seed.id);
    if (existingSeat) {
      campaignRecord.playerSeats = seats.filter((seat) => seat.seedId !== seed.id);
      try {
        localStorage.setItem(CAMPAIGN_STORE_KEY, JSON.stringify(campaignRecord));
        showToast(`Removed ${seed.playerName} from ${campaign.name}.`);
      } catch (error) {
        setStatus("The campaign record could not be saved. No assignment was changed.", true);
      }
      updateAssignmentControls();
      renderSeedList();
      return;
    }
    if (seats.length >= 4) {
      updateAssignmentControls();
      return;
    }
    campaignRecord.playerSeats = [...seats, {
      id: createId("seat"),
      seedId: seed.id,
      playerName: seed.playerName,
      character: structuredClone(seed.character),
      assignedAt: new Date().toISOString()
    }];
    try {
      localStorage.setItem(CAMPAIGN_STORE_KEY, JSON.stringify(campaignRecord));
      showToast(`Added ${seed.playerName} to ${campaign.name}.`);
    } catch (error) {
      setStatus("The campaign record could not be saved. No assignment was changed.", true);
    }
    updateAssignmentControls();
    renderSeedList();
  }

  function deleteSelectedSeed() {
    const seed = selectedSeed();
    if (!seed || assignedSeat(seed.id, readCampaignRecord())) return;
    if (!window.confirm(`Delete the seed for ${seed.playerName}?`)) return;
    seedStore.seeds = seedStore.seeds.filter((item) => item.id !== seed.id);
    if (!saveSeedStore()) return;
    selectedSeedId = null;
    setFormVisible(false);
    renderSeedList();
    updateAssignmentControls();
    showToast("Player seed deleted.");
  }

  function initialize() {
    renderRatingFields();
    renderSkillFields();
    try {
      seedStore = readSeedStore();
    } catch (error) {
      storageAvailable = false;
      seedStore = { schemaVersion: 1, seeds: [] };
      storageState.textContent = "Seed store needs review";
      storageState.classList.add("error");
      setStatus(error.message, true);
    }
    if (storageAvailable) {
      storageState.textContent = "Local seed store ready";
      renderSeedList();
    }
    updateDiceDisplays();
    document.getElementById("new-seed").addEventListener("click", startNewSeed);
    document.getElementById("empty-new-seed").addEventListener("click", startNewSeed);
    form.addEventListener("submit", saveCurrentSeed);
    form.addEventListener("change", updateDiceDisplays);
    assignButton.addEventListener("click", assignSelectedSeed);
    document.getElementById("delete-seed").addEventListener("click", deleteSelectedSeed);
    if (!storageAvailable) {
      document.getElementById("new-seed").disabled = true;
      document.getElementById("empty-new-seed").disabled = true;
      form.hidden = true;
      blankState.hidden = false;
      blankState.querySelector("p").textContent = "The stored seed data could not be read safely. Existing data was left untouched.";
      blankState.querySelector("button").hidden = true;
    }
  }

  initialize();
})();