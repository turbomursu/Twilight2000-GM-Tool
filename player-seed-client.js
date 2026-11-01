(() => {
  const campaignSelect = document.querySelector("#player-campaign-select");
  const status = document.querySelector("#player-seed-status");
  const form = document.querySelector("#player-seed-form");
  const fieldContainer = document.querySelector("#player-seed-fields");
  const finalizeButton = document.querySelector("#finalize-player-seed");
  const formNote = document.querySelector("#player-seed-form-note");
  const pendingSummary = document.querySelector("#player-change-request-summary");
  const saveButton = document.querySelector("#save-player-seed");
  const refreshButton = document.querySelector("#refresh-player-character");
  const recordTitle = document.querySelector("#player-seed-title");
  const recordEyebrow = document.querySelector("#player-record-eyebrow");
  const recordDescription = document.querySelector("#player-record-description");
  const recordName = document.querySelector("#player-record-name");
  const recordState = document.querySelector("#player-record-state");
  const emptyState = document.querySelector("#player-seed-empty");
  let selectedCampaignId = "";
  let currentCharacter = null;

  function showStatus(message, kind = "") {
    status.textContent = message;
    status.className = `player-seed-status${kind ? ` ${kind}` : ""}`;
  }

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
    } catch {
      throw new Error("The secure campaign service could not be reached.");
    }
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);
      throw new Error("Your session has expired.");
    }
    if (!response.ok) throw new Error(result.error || "The request could not be completed.");
    return result;
  }

  function updateFinalizeButton() {
    const controls = new Map([...fieldContainer.querySelectorAll("textarea")].map((input) => [input.dataset.fieldKey, input.value.trim()]));
    const missing = currentCharacter?.fields.some((field) => field.required
      && !(field.playerEditable ? controls.get(field.key) : field.value.trim()));
    finalizeButton.disabled = currentCharacter?.status !== "seed" || Boolean(missing);
    saveButton.disabled = currentCharacter?.status === "playable" && Boolean(currentCharacter.pendingChangeRequest);
  }

  function renderSeed(character) {
    currentCharacter = character;
    recordTitle.textContent = character.status === "seed" ? "Character seed" : "Playable character";
    recordEyebrow.textContent = `${character.displayLabel} / ${character.campaignName} / ${character.setting}`;
    recordDescription.textContent = character.status === "seed"
      ? "Complete the fields your GM left open, then finalize this character for the campaign."
      : "This is your assigned campaign character. Later edits are submitted to your GM for approval.";
    recordName.textContent = character.displayLabel;
    recordState.textContent = character.status === "seed" ? "Seed / completion required" : "Playable / changes require GM approval";
    if (document.querySelector("#player-sitrep-tab")?.getAttribute("aria-current") === "page") {
      recordTitle.textContent = "Situation report";
      recordDescription.textContent = "";
    }
    if (document.querySelector("#player-map-tab")?.getAttribute("aria-current") === "page") {
      recordTitle.textContent = "Player map";
      recordDescription.textContent = "";
    }
    if (document.querySelector("#player-comms-tab")?.getAttribute("aria-current") === "page") {
      recordTitle.textContent = "COMMS";
      recordDescription.textContent = "";
    }
    emptyState.hidden = true;
    form.hidden = false;
    finalizeButton.hidden = character.status !== "seed";
    saveButton.textContent = character.status === "seed" ? "Save progress" : "Submit changes for GM review";
    formNote.textContent = character.status === "seed"
      ? "Complete fields the GM left blank. Finalize when required fields are complete."
      : "Character is finalized. Changes are proposals and do not apply until the GM approves them.";
    fieldContainer.replaceChildren();
    pendingSummary.hidden = !character.pendingChangeRequest;
    pendingSummary.textContent = character.pendingChangeRequest
      ? `Awaiting GM review / submitted ${new Date(character.pendingChangeRequest.submittedAt).toLocaleString()}\n${character.pendingChangeRequest.fields.map((field) => `${field.label}: ${field.oldValue || "(blank)"} -> ${field.value || "(blank)"}`).join("\n")}`
      : "";

    character.fields.forEach((field) => {
      const label = document.createElement("label");
      label.className = "player-seed-field";
      const heading = document.createElement("span");
      heading.className = "player-seed-field-label";
      const editable = character.status === "playable" || field.playerEditable;
      heading.textContent = `${field.label}${field.required ? " / required" : ""}${character.status === "playable" ? " / propose change" : field.playerEditable ? " / complete" : " / GM set"}`;
      if (editable) {
        const input = document.createElement("textarea");
        input.value = field.value;
        input.maxLength = 2000;
        input.dataset.fieldKey = field.key;
        input.disabled = Boolean(character.pendingChangeRequest);
        input.addEventListener("input", updateFinalizeButton);
        label.append(heading, input);
      } else {
        const value = document.createElement("output");
        value.textContent = field.value;
        label.append(heading, value);
      }
      fieldContainer.append(label);
    });
    showStatus(character.status === "seed"
      ? `${character.displayLabel} / ${character.campaignName} / assigned seed`
      : `${character.displayLabel} / ${character.campaignName} / finalized character`, "success");
    updateFinalizeButton();
  }

  async function loadCharacter(campaignId) {
    selectedCampaignId = campaignId;
    form.hidden = true;
    fieldContainer.replaceChildren();
    emptyState.hidden = false;
    emptyState.textContent = "Loading assigned character…";
    showStatus("Loading assigned character…");
    try {
      const { character } = await request(`/api/player/campaigns/${encodeURIComponent(campaignId)}/character`);
      renderSeed(character);
      refreshButton.disabled = false;
    } catch (error) {
      showStatus(error.message, "error");
      emptyState.textContent = error.message;
      refreshButton.disabled = true;
    }
  }

  campaignSelect.addEventListener("change", () => {
    if (campaignSelect.value) loadCharacter(campaignSelect.value);
    else {
      selectedCampaignId = "";
      currentCharacter = null;
      form.hidden = true;
      fieldContainer.replaceChildren();
      emptyState.hidden = false;
      emptyState.textContent = "Choose an assigned campaign to load your character.";
      showStatus("Choose a campaign assigned by your GM.");
    }
  });
  refreshButton.addEventListener("click", () => {
    if (selectedCampaignId) loadCharacter(selectedCampaignId);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedCampaignId || currentCharacter?.status !== "seed") return;
    saveButton.disabled = true;
    try {
      const fields = [...fieldContainer.querySelectorAll("textarea")].map((input) => ({ key: input.dataset.fieldKey, value: input.value }));
      const result = await request(`/api/player/campaigns/${encodeURIComponent(selectedCampaignId)}/character`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });
      if (currentCharacter.status === "seed") {
        renderSeed(result.character);
        showStatus("Seed progress saved. Finalize when required fields are complete.", "success");
      } else {
        await loadCharacter(selectedCampaignId);
        showStatus("Changes sent to the GM for approval.", "success");
      }
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
  });

  finalizeButton.addEventListener("click", async () => {
    if (!selectedCampaignId || currentCharacter?.status !== "seed") return;
    finalizeButton.disabled = true;
    try {
      const fields = [...fieldContainer.querySelectorAll("textarea")].map((input) => ({ key: input.dataset.fieldKey, value: input.value }));
      if (fields.length) {
        const saved = await request(`/api/player/campaigns/${encodeURIComponent(selectedCampaignId)}/character`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields })
        });
        currentCharacter = saved.character;
      }
      const { character } = await request(`/api/player/campaigns/${encodeURIComponent(selectedCampaignId)}/character/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      renderSeed(character);
    } catch (error) {
      showStatus(error.message, "error");
      updateFinalizeButton();
    }
  });

  async function initialize() {
    try {
      const { campaigns } = await request("/api/player/campaigns");
      campaignSelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = campaigns.length ? "Select assigned campaign" : "No assigned campaigns";
      campaignSelect.append(placeholder);
      campaigns.forEach((campaign) => {
        const option = document.createElement("option");
        option.value = campaign.id;
        option.textContent = `${campaign.name} / ${campaign.setting}`;
        campaignSelect.append(option);
      });
      campaignSelect.disabled = campaigns.length === 0;
      const emptyMessage = campaigns.length ? "Choose an assigned campaign to load your character." : "No player seed is assigned to this account yet.";
      emptyState.hidden = false;
      emptyState.textContent = emptyMessage;
      showStatus(campaigns.length ? "Choose a campaign assigned by your GM." : "No player seed is assigned to this account yet.");
    } catch (error) {
      campaignSelect.disabled = true;
      showStatus(error.message, "error");
    }
  }

  initialize();
})();
