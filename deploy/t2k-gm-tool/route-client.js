// Route Management Client Module
// Handles route CRUD operations and UI rendering for the GM dashboard

const routeState = {
  campaignId: null,
  route: [],                    // Array of route stops with full location details
  selectedStopOrdinal: null,
  editingStop: null,
  draggedStopOrdinal: null,
  totalKm: 0,
  stopCount: 0,
  error: null,
  isLoading: false
};

// ============================================================================
// API Wrapper Functions
// ============================================================================

async function loadRouteForCampaign(campaignId) {
  if (!campaignId) {
    routeState.error = "No campaign selected";
    return;
  }

  routeState.isLoading = true;
  routeState.error = null;
  routeState.campaignId = campaignId;

  try {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/route`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        routeState.error = "Campaign not found or access denied";
      } else {
        routeState.error = `Failed to load route (${response.status})`;
      }
      routeState.route = [];
      return;
    }

    const data = await response.json();
    routeState.route = data.stops || [];
    routeState.stopCount = routeState.route.length;
    routeState.totalKm = (data.stops || []).reduce((sum, stop) => {
      return sum + (parseFloat(stop.kmFromPrevious) || 0);
    }, 0);
  } catch (error) {
    routeState.error = error.message;
    routeState.route = [];
  } finally {
    routeState.isLoading = false;
  }
}

async function createStopViaAPI(locationId, detail, kmFromPrevious) {
  if (!routeState.campaignId) {
    throw new Error("No campaign selected");
  }

  if (!locationId) {
    throw new Error("Location required");
  }

  if (!detail || detail.trim() === "") {
    throw new Error("Stop detail required");
  }

  const km = parseFloat(kmFromPrevious) || 0;
  if (km < 0) {
    throw new Error("Distance must be non-negative");
  }

  try {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(routeState.campaignId)}/route/stops`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          detail: detail.trim(),
          kmFromPrevious: km
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 409) {
        throw new Error(errorData.message || "Location already in route");
      } else if (response.status === 422) {
        throw new Error(errorData.message || "Invalid input");
      } else if (response.status === 404) {
        throw new Error("Campaign or location not found");
      }
      throw new Error(`Failed to create stop (${response.status})`);
    }

    const data = await response.json();
    
    // Reload route to sync with backend
    await loadRouteForCampaign(routeState.campaignId);
    
    return data.stop;
  } catch (error) {
    routeState.error = error.message;
    throw error;
  }
}

async function updateStopViaAPI(ordinal, detail, kmFromPrevious) {
  if (!routeState.campaignId) {
    throw new Error("No campaign selected");
  }

  if (ordinal < 0 || !Number.isInteger(ordinal)) {
    throw new Error("Invalid stop ordinal");
  }

  if (!detail || detail.trim() === "") {
    throw new Error("Stop detail required");
  }

  const km = parseFloat(kmFromPrevious) || 0;
  if (km < 0) {
    throw new Error("Distance must be non-negative");
  }

  try {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(routeState.campaignId)}/route/stops/${ordinal}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          detail: detail.trim(),
          kmFromPrevious: km
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error("Stop not found");
      } else if (response.status === 422) {
        throw new Error(errorData.message || "Invalid input");
      }
      throw new Error(`Failed to update stop (${response.status})`);
    }

    const data = await response.json();
    
    // Reload route to sync with backend
    await loadRouteForCampaign(routeState.campaignId);
    
    return data.stop;
  } catch (error) {
    routeState.error = error.message;
    throw error;
  }
}

async function deleteStopViaAPI(ordinal) {
  if (!routeState.campaignId) {
    throw new Error("No campaign selected");
  }

  if (ordinal < 0 || !Number.isInteger(ordinal)) {
    throw new Error("Invalid stop ordinal");
  }

  try {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(routeState.campaignId)}/route/stops/${ordinal}`,
      { method: "DELETE" }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Stop not found");
      }
      throw new Error(`Failed to delete stop (${response.status})`);
    }

    // Reload route to sync with backend
    await loadRouteForCampaign(routeState.campaignId);
  } catch (error) {
    routeState.error = error.message;
    throw error;
  }
}

async function reorderRouteViaAPI(orderedLocationIds) {
  if (!routeState.campaignId) {
    throw new Error("No campaign selected");
  }

  if (!Array.isArray(orderedLocationIds) || orderedLocationIds.length === 0) {
    throw new Error("Invalid reorder list");
  }

  try {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(routeState.campaignId)}/route/reorder`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationIds: orderedLocationIds })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 409) {
        throw new Error(errorData.message || "Reorder mismatch with current route");
      } else if (response.status === 422) {
        throw new Error(errorData.message || "Invalid reorder list");
      } else if (response.status === 404) {
        throw new Error("Campaign not found");
      }
      throw new Error(`Failed to reorder route (${response.status})`);
    }

    // Reload route to sync with backend
    await loadRouteForCampaign(routeState.campaignId);
  } catch (error) {
    routeState.error = error.message;
    throw error;
  }
}

// ============================================================================
// Modal & Form Handlers
// ============================================================================

function openRouteEditorModal() {
  const modal = document.getElementById("route-editor-modal");
  if (!modal) {
    console.error("Route editor modal not found in DOM");
    return;
  }

  // Reset editor state
  routeState.selectedStopOrdinal = null;
  routeState.editingStop = null;

  // Hide editor panel initially
  const editorPanel = document.getElementById("stop-editor-panel");
  if (editorPanel) {
    editorPanel.style.display = "none";
  }

  // Render current route
  renderRouteList();

  // Show modal
  modal.style.display = "flex";
}

function closeRouteEditorModal() {
  const modal = document.getElementById("route-editor-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

async function handleAddStopToRoute() {
  const editorPanel = document.getElementById("stop-editor-panel");
  if (!editorPanel) {
    console.error("Stop editor panel not found in DOM");
    return;
  }

  // Reset form
  routeState.editingStop = null;
  routeState.selectedStopOrdinal = null;
  document.getElementById("stop-editor-title").textContent = "Add Stop to Route";
  document.getElementById("stop-location-select").value = "";
  document.getElementById("stop-detail-input").value = "";
  document.getElementById("stop-km-input").value = "0";
  document.getElementById("stop-editor-status").textContent = "";

  // Show panel
  editorPanel.style.display = "block";

  // Populate location selector
  await populateLocationSelector();
}

function handleEditStop(ordinal) {
  const editorPanel = document.getElementById("stop-editor-panel");
  if (!editorPanel) {
    console.error("Stop editor panel not found in DOM");
    return;
  }

  const stop = routeState.route.find(s => s.ordinal === ordinal);
  if (!stop) {
    routeState.error = "Stop not found";
    return;
  }

  // Set editing state
  routeState.editingStop = stop;
  routeState.selectedStopOrdinal = ordinal;

  // Populate form
  document.getElementById("stop-editor-title").textContent = 
    `Edit Stop #${ordinal} (${stop.locationName})`;
  document.getElementById("stop-location-select").value = stop.locationId;
  document.getElementById("stop-location-select").disabled = true;
  document.getElementById("stop-detail-input").value = stop.detail;
  document.getElementById("stop-km-input").value = stop.kmFromPrevious;
  document.getElementById("stop-editor-status").textContent = "";

  // Show panel
  editorPanel.style.display = "block";
}

async function handleDeleteStop(ordinal) {
  const stop = routeState.route.find(s => s.ordinal === ordinal);
  if (!stop) {
    routeState.error = "Stop not found";
    return;
  }

  if (!confirm(`Delete stop #${ordinal} (${stop.locationName})? This cannot be undone.`)) {
    return;
  }

  try {
    await deleteStopViaAPI(ordinal);
    renderRouteList();
    renderRouteSummary();
  } catch (error) {
    console.error("Error deleting stop:", error);
    const statusEl = document.getElementById("stop-editor-status");
    if (statusEl) {
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = "form-feedback error";
    }
  }
}

async function handleSaveStop() {
  try {
    const locationSelect = document.getElementById("stop-location-select");
    const detailInput = document.getElementById("stop-detail-input");
    const kmInput = document.getElementById("stop-km-input");
    const statusEl = document.getElementById("stop-editor-status");

    const locationId = locationSelect.value;
    const detail = detailInput.value;
    const km = kmInput.value;

    // Validate
    if (!locationId) {
      throw new Error("Please select a location");
    }
    if (!detail || detail.trim() === "") {
      throw new Error("Please enter stop detail");
    }
    if (km === "" || isNaN(km)) {
      throw new Error("Please enter valid distance");
    }
    if (parseFloat(km) < 0) {
      throw new Error("Distance must be non-negative");
    }

    // Show loading state
    statusEl.textContent = "Saving...";
    statusEl.className = "form-feedback";

    if (routeState.editingStop) {
      // Update existing
      await updateStopViaAPI(
        routeState.selectedStopOrdinal,
        detail,
        parseFloat(km)
      );
      statusEl.textContent = "Stop updated";
      statusEl.className = "form-feedback success";
    } else {
      // Create new
      await createStopViaAPI(locationId, detail, parseFloat(km));
      statusEl.textContent = "Stop created";
      statusEl.className = "form-feedback success";
    }

    // Clear form and hide panel after 1 second
    setTimeout(() => {
      const editorPanel = document.getElementById("stop-editor-panel");
      if (editorPanel) {
        editorPanel.style.display = "none";
      }
      renderRouteList();
      renderRouteSummary();
    }, 1000);
  } catch (error) {
    console.error("Error saving stop:", error);
    const statusEl = document.getElementById("stop-editor-status");
    if (statusEl) {
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = "form-feedback error";
    }
  }
}

// ============================================================================
// Rendering Functions
// ============================================================================

function renderRouteList() {
  const container = document.getElementById("route-stops-list");
  if (!container) {
    console.error("Route stops list container not found");
    return;
  }

  container.innerHTML = "";

  if (routeState.route.length === 0) {
    container.innerHTML = '<div class="empty-state">No stops in route yet</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  routeState.route.forEach(stop => {
    const card = document.createElement("div");
    card.className = "stop-card";
    card.setAttribute("data-ordinal", stop.ordinal);
    card.setAttribute("data-location-id", stop.locationId);

    const locationName = escapeHtml(stop.locationName || "Unknown");
    const gridRef = escapeHtml(stop.gridReference || "");
    const detail = escapeHtml(stop.detail || "");
    const km = parseFloat(stop.kmFromPrevious).toFixed(1);

    card.innerHTML = `
      <div class="stop-header">
        <span class="stop-ordinal">#${stop.ordinal}</span>
        <span class="stop-location">${locationName}</span>
      </div>
      <div class="stop-gridref">${gridRef}</div>
      <div class="stop-detail">${detail}</div>
      <div class="stop-km">
        <strong>${km} km</strong> from previous
      </div>
      <div class="stop-actions">
        <button class="btn btn-sm" data-action="edit-stop-${stop.ordinal}">Edit</button>
        <button class="btn btn-sm btn-danger" data-action="delete-stop-${stop.ordinal}">Delete</button>
      </div>
    `;

    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

function renderRouteSummary() {
  const container = document.getElementById("route-summary");
  if (!container) return;

  if (routeState.route.length === 0) {
    container.innerHTML = '<div class="summary-empty">No stops in route</div>';
    return;
  }

  const totalKm = routeState.totalKm.toFixed(1);
  const stopCount = routeState.stopCount;

  container.innerHTML = `
    <div class="route-summary">
      <div class="summary-stat">
        <div class="summary-label">Total Distance</div>
        <div class="summary-value">${totalKm} km</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Stops</div>
        <div class="summary-value">${stopCount}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-label">Avg per Leg</div>
        <div class="summary-value">${stopCount > 0 ? (routeState.totalKm / stopCount).toFixed(1) : '—'} km</div>
      </div>
    </div>
  `;
}

function renderRouteDisplay() {
  const container = document.getElementById("route-display");
  if (!container) return;

  if (routeState.route.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No route created yet</p>
        <button class="btn btn-primary btn-sm" data-action="open-route-editor">
          Create Route
        </button>
      </div>
    `;
    return;
  }

  const totalKm = routeState.totalKm.toFixed(1);
  let html = `<div class="route-preview">`;

  html += `<div class="route-summary">
    <strong>${routeState.stopCount} stops</strong> • 
    <strong>${totalKm} km</strong> total
  </div>`;

  html += `<div class="route-stops-compact">`;
  routeState.route.slice(0, 3).forEach(stop => {
    const locationName = escapeHtml(stop.locationName || "Unknown");
    html += `<div class="stop-compact">
      <span class="stop-number">${stop.ordinal}</span>
      <span class="stop-name">${locationName}</span>
    </div>`;
  });
  
  if (routeState.stopCount > 3) {
    html += `<div class="stop-compact">
      <span class="stop-name">+ ${routeState.stopCount - 3} more</span>
    </div>`;
  }

  html += `</div>`;
  html += `<button class="btn btn-primary btn-sm" data-action="open-route-editor">Manage</button>`;
  html += `</div>`;

  container.innerHTML = html;
}

async function populateLocationSelector() {
  const select = document.getElementById("stop-location-select");
  if (!select) return;

  try {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(routeState.campaignId)}/locations`
    );

    if (!response.ok) {
      throw new Error("Failed to load locations");
    }

    const data = await response.json();
    const usedLocationIds = new Set(routeState.route.map(s => s.locationId));

    // Re-enable select and clear
    select.disabled = false;
    select.innerHTML = '<option value="">Select a location...</option>';

    // Add available locations
    (data.locations || []).forEach(loc => {
      if (!usedLocationIds.has(loc.id)) {
        const option = document.createElement("option");
        option.value = loc.id;
        option.textContent = `${escapeHtml(loc.name)} (${escapeHtml(loc.kind)})`;
        select.appendChild(option);
      }
    });

    if (select.options.length === 1) {
      // No available locations
      select.innerHTML = '<option value="">All locations already in route</option>';
      select.disabled = true;
    }
  } catch (error) {
    console.error("Error loading locations:", error);
    routeState.error = error.message;
  }
}

// ============================================================================
// Event Setup
// ============================================================================

function setupRouteEventListeners() {
  document.addEventListener("click", (e) => {
    const action = e.target.getAttribute("data-action");
    if (!action) return;

    if (action === "open-route-editor") {
      e.preventDefault();
      openRouteEditorModal();
    }

    if (action === "open-add-stop-form") {
      e.preventDefault();
      handleAddStopToRoute();
    }

    if (action === "save-stop") {
      e.preventDefault();
      handleSaveStop();
    }

    if (action.startsWith("edit-stop-")) {
      e.preventDefault();
      const ordinal = parseInt(action.split("-")[2], 10);
      handleEditStop(ordinal);
    }

    if (action.startsWith("delete-stop-")) {
      e.preventDefault();
      const ordinal = parseInt(action.split("-")[2], 10);
      handleDeleteStop(ordinal);
    }

    if (action === "close-stop-editor") {
      e.preventDefault();
      document.getElementById("stop-editor-panel").style.display = "none";
      document.getElementById("stop-location-select").disabled = false;
    }

    if (action === "close-route-editor") {
      e.preventDefault();
      closeRouteEditorModal();
    }
  });

  // Save stop on form submission
  const form = document.getElementById("stop-editor-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSaveStop();
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Module Export
// ============================================================================

window.routeClient = {
  // State
  routeState,
  
  // API functions
  loadRouteForCampaign,
  createStopViaAPI,
  updateStopViaAPI,
  deleteStopViaAPI,
  reorderRouteViaAPI,
  
  // Modal handlers
  openRouteEditorModal,
  closeRouteEditorModal,
  handleAddStopToRoute,
  handleEditStop,
  handleDeleteStop,
  handleSaveStop,
  
  // Rendering
  renderRouteList,
  renderRouteSummary,
  renderRouteDisplay,
  populateLocationSelector,
  
  // Setup
  setupRouteEventListeners
};

console.log("✓ Route Client module loaded");
