// Location Management Client Module
// Handles GM-side location creation, editing, deletion, and display
// Follows same pattern as personnel-client.js
const FieldbookMapCoordinates = globalThis.FieldbookMapCoordinates;

let locationState = {
  locations: [],
  runtimeCampaignId: null,
  bounds: null,
  sortBy: 'name',
  filterKind: null,
  filterVisibility: null
};

// ===== API Functions =====

async function loadLocationsForCampaign(campaignId, bounds) {
  if (!campaignId) return;
  locationState.runtimeCampaignId = campaignId;
  locationState.bounds = bounds;
  try {
    const response = await campaignApiRequest(`/api/campaigns/${campaignId}/locations`, { method: 'GET' });
    if (locationState.runtimeCampaignId !== campaignId) return;
    if (response && response.locations) {
      locationState.locations = response.locations;
      renderLocationList();
    }
  } catch (error) {
    console.error("Failed to load locations:", error);
    showToast("Failed to load locations: " + error.message);
  }
}

async function createLocationViaAPI(name, kind, mapPosition, overrides = {}) {
  if (!locationState.runtimeCampaignId) {
    throw new Error("No runtime campaign selected.");
  }
  
  const payload = {
    name,
    kind,
    mapPosition,
    description: overrides.description || "",
    gridRef: overrides.gridRef || "",
    visibilityEligibility: overrides.visibilityEligibility || "gm-only",
    isStartingLocation: overrides.isStartingLocation || false
  };
  
  try {
    const response = await campaignApiRequest(
      `/api/campaigns/${locationState.runtimeCampaignId}/locations`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
    
    if (response && response.location) {
      locationState.locations.push(response.location);
      locationState.locations.sort((a, b) => a.name.localeCompare(b.name));
      renderLocationList();
      return response.location;
    }
  } catch (error) {
    console.error("Failed to create location:", error);
    throw error;
  }
}

async function updateLocationViaAPI(locationId, updates) {
  if (!locationState.runtimeCampaignId) {
    throw new Error("No runtime campaign selected.");
  }
  
  try {
    const response = await campaignApiRequest(
      `/api/campaigns/${locationState.runtimeCampaignId}/locations/${locationId}`,
      { method: 'PUT', body: JSON.stringify(updates) }
    );
    
    if (response && response.location) {
      const index = locationState.locations.findIndex(l => l.id === locationId);
      if (index >= 0) {
        locationState.locations[index] = response.location;
        locationState.locations.sort((a, b) => a.name.localeCompare(b.name));
        renderLocationList();
      }
      return response.location;
    }
  } catch (error) {
    console.error("Failed to update location:", error);
    throw error;
  }
}

async function deleteLocationViaAPI(locationId) {
  if (!locationState.runtimeCampaignId) {
    throw new Error("No runtime campaign selected.");
  }
  
  try {
    await campaignApiRequest(
      `/api/campaigns/${locationState.runtimeCampaignId}/locations/${locationId}`,
      { method: 'DELETE' }
    );
    
    locationState.locations = locationState.locations.filter(l => l.id !== locationId);
    renderLocationList();
  } catch (error) {
    console.error("Failed to delete location:", error);
    throw error;
  }
}

// ===== Modal Handlers =====

function locationCoordinateControls() {
  const bounds = locationState.bounds;
  const image = FieldbookMapCoordinates.isImage(bounds);
  for (const [id, label, min, max] of [
    ["location-lat", image ? "Y / kilometres north from bottom-left" : "Latitude", image ? 0 : bounds?.south, image ? FieldbookMapCoordinates.heightKm(bounds) : bounds?.north],
    ["location-lng", image ? "X / kilometres east from bottom-left" : "Longitude", image ? 0 : bounds?.west, image ? bounds.widthKm : bounds?.east]
  ]) {
    document.querySelector(`label[for="${id}"]`).textContent = label;
    const input = document.getElementById(id);
    input.min = min ?? ""; input.max = max ?? "";
    input.placeholder = image ? "0" : id === "location-lat" ? "61.4" : "14.9";
  }
  return image;
}

function openLocationCreationForm() {
  const modal = document.getElementById("location-editor-modal");
  if (!modal) return;
  locationCoordinateControls();
  
  // Clear form for new location
  document.getElementById("location-name").value = "";
  document.getElementById("location-kind").value = "Settlement";
  document.getElementById("location-description").value = "";
  document.getElementById("location-gridref").value = "";
  document.getElementById("location-lat").value = "";
  document.getElementById("location-lng").value = "";
  document.getElementById("location-visibility").value = "gm-only";
  document.getElementById("location-notes").value = "";
  
  // Reset state and show
  modal.dataset.locationId = "";
  modal.dataset.isNew = "true";
  document.getElementById("location-editor-status").textContent = "";
  document.getElementById("location-editor-save").textContent = "Create location";
  
  modal.showModal();
}

function openLocationEditorModal(locationId) {
  const location = locationState.locations.find(l => l.id === locationId);
  if (!location) {
    showToast("Location not found");
    return;
  }
  
  const modal = document.getElementById("location-editor-modal");
  if (!modal) return;
  const image = locationCoordinateControls();
  
  // Populate form
  document.getElementById("location-name").value = location.name || "";
  document.getElementById("location-kind").value = location.kind || "Settlement";
  document.getElementById("location-description").value = location.description || "";
  document.getElementById("location-gridref").value = location.gridRef || "";
  document.getElementById("location-lat").value = (image ? location.mapPosition?.y : location.mapPosition?.lat) ?? "";
  document.getElementById("location-lng").value = (image ? location.mapPosition?.x : location.mapPosition?.lng) ?? "";
  document.getElementById("location-visibility").value = location.visibilityEligibility || "gm-only";
  document.getElementById("location-notes").value = location.gmNotes || "";
  
  // Set state
  modal.dataset.locationId = locationId;
  modal.dataset.isNew = "false";
  document.getElementById("location-editor-status").textContent = "";
  document.getElementById("location-editor-save").textContent = "Update location";
  
  modal.showModal();
}

async function handleLocationSave() {
  const modal = document.getElementById("location-editor-modal");
  const statusEl = document.getElementById("location-editor-status");
  const isNew = modal.dataset.isNew === "true";
  
  try {
    statusEl.textContent = "Saving...";
    
    const name = document.getElementById("location-name").value.trim();
    const kind = document.getElementById("location-kind").value;
    const description = document.getElementById("location-description").value.trim();
    const gridRef = document.getElementById("location-gridref").value.trim();
    const lat = parseFloat(document.getElementById("location-lat").value);
    const lng = parseFloat(document.getElementById("location-lng").value);
    const visibility = document.getElementById("location-visibility").value;
    const notes = document.getElementById("location-notes").value.trim();
    
    if (!name) {
      statusEl.textContent = "Error: Location name is required.";
      statusEl.style.color = "#c00";
      return;
    }
    
    if (!kind) {
      statusEl.textContent = "Error: Location type is required.";
      statusEl.style.color = "#c00";
      return;
    }
    
    if (isNaN(lat) || isNaN(lng)) {
      statusEl.textContent = FieldbookMapCoordinates.isImage(locationState.bounds) ? "Error: Valid x and y kilometres are required." : "Error: Valid latitude and longitude are required.";
      statusEl.style.color = "#c00";
      return;
    }
    
    const mapPosition = FieldbookMapCoordinates.fromLatLng({ lat, lng }, locationState.bounds);
    const payload = {
      name,
      kind,
      description,
      gridRef,
      mapPosition,
      visibilityEligibility: visibility,
      gmNotes: notes
    };
    
    if (isNew) {
      await createLocationViaAPI(name, kind, mapPosition, {
        description,
        gridRef,
        visibilityEligibility: visibility
      });
      statusEl.textContent = "Location created!";
      statusEl.style.color = "#293c2c";
      setTimeout(() => modal.close(), 800);
    } else {
      const locationId = modal.dataset.locationId;
      await updateLocationViaAPI(locationId, payload);
      statusEl.textContent = "Location updated!";
      statusEl.style.color = "#293c2c";
      setTimeout(() => modal.close(), 800);
    }
  } catch (error) {
    statusEl.textContent = "Error: " + error.message;
    statusEl.style.color = "#c00";
    console.error("Save failed:", error);
  }
}

// ===== Rendering =====

function renderLocationList() {
  const container = document.getElementById("location-list");
  if (!container) return;
  
  const filterKind = document.getElementById("location-filter-kind")?.value || "";
  const filterVis = document.getElementById("location-filter-visibility")?.value || "";
  
  let filtered = locationState.locations;
  if (filterKind) filtered = filtered.filter(l => l.kind === filterKind);
  if (filterVis) filtered = filtered.filter(l => l.visibilityEligibility === filterVis);
  
  filtered.sort((a, b) => {
    if (locationState.sortBy === 'kind') return a.kind.localeCompare(b.kind);
    return a.name.localeCompare(b.name);
  });
  
  if (filtered.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: var(--muted);">No locations yet. Create one to get started.</div>';
    return;
  }
  
  container.innerHTML = filtered.map(location => {
    const visibility = location.visibilityEligibility === 'players' ? 'Players' : 'GM Only';
    const visibilityBadge = location.visibilityEligibility === 'players' 
      ? '<span class="visibility-badge">Players</span>' 
      : '<span class="visibility-badge gm-only">GM Only</span>';
    
    return `
      <div class="location-card">
        <h3>${escapeHtml(location.name)}</h3>
        <div class="kind">${escapeHtml(location.kind)}</div>
        ${visibilityBadge}
        <div class="coords">
          ${FieldbookMapCoordinates.isImage(locationState.bounds)
            ? `<strong>km (bottom-left):</strong> x ${location.mapPosition?.x?.toFixed(2) ?? '?'}, y ${location.mapPosition?.y?.toFixed(2) ?? '?'}`
            : `<strong>Coords:</strong> ${location.mapPosition?.lat?.toFixed(2) ?? '?'}, ${location.mapPosition?.lng?.toFixed(2) ?? '?'}`}
        </div>
        ${location.gridRef ? `<div class="coords"><strong>Grid:</strong> ${escapeHtml(location.gridRef)}</div>` : ''}
        <div style="font-size: 9px; color: var(--muted); margin-bottom: 8px; line-height: 1.4;">
          ${escapeHtml(location.description)}
        </div>
        <div class="location-actions">
          <button class="button" type="button" data-action="edit-location" data-location-id="${location.id}">Edit</button>
          <button class="button" type="button" data-action="delete-location" data-location-id="${location.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Utility Functions =====

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ===== Export for use via window.locationClient =====

// Set up event listeners when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLocationEventListeners);
} else {
  setupLocationEventListeners();
}

function setupLocationEventListeners() {
  // Cancel button
  const cancelBtn = document.getElementById("location-editor-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      document.getElementById("location-editor-modal").close();
    });
  }
  
  // Save button
  const saveBtn = document.getElementById("location-editor-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", handleLocationSave);
  }
  
  // Filter controls
  const filterKind = document.getElementById("location-filter-kind");
  if (filterKind) {
    filterKind.addEventListener("change", renderLocationList);
  }
  
  const filterVis = document.getElementById("location-filter-visibility");
  if (filterVis) {
    filterVis.addEventListener("change", renderLocationList);
  }
}

window.locationClient = {
  loadLocationsForCampaign,
  openLocationCreationForm,
  openLocationEditorModal,
  handleLocationSave,
  renderLocationList,
  deleteLocationViaAPI,
  state: locationState
};
