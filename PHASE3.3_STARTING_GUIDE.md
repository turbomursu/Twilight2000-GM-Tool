# Phase 3.3: Route Management UI — Implementation Plan

**Status:** 🟡 **Starting**  
**Date Started:** 02 Nov 2026  
**Target Completion:** 04 Nov 2026 (2 days)  
**Depends On:** Phase 3.2 (Route Backend) ✅ Complete

---

## Overview

Phase 3.3 builds the user-facing UI for route management, making the Phase 3.2 backend accessible in the GM dashboard. This phase focuses on making routes manageable and visible, with core functionality completed before map visualization.

**Key Deliverables:**
1. Route client module (route-client.js, ~350 lines)
2. Route UI components (index.html modal, ~300 lines)
3. CSS styling (~100 lines)
4. Campaign lifecycle integration
5. Route display and editing
6. Test suite for client module

---

## Current State

### ✅ Already Available (Phase 3.2)
- Route CRUD API endpoints (5 endpoints)
- Route database functions (5 CRUD operations)
- Comprehensive input validation
- Atomic transactions
- Campaign isolation

### ✅ From Phase 3.1 (Reusable)
- Location selector pattern
- Modal dialog structure
- CSS design tokens
- Form validation approach
- Grid list rendering

### ❌ Still Needed (Phase 3.3)
- Client module (route-client.js)
- Route editor modal UI
- Route list/grid display
- Campaign integration
- Event handlers

---

## Phase 3.3 Deliverables

### 1. Route Client Module (route-client.js)

**File:** `route-client.js` (350-400 lines)

**State Object:**
```javascript
const routeState = {
  campaignId: null,
  route: [],           // Array of stops with full details
  selectedStopOrdinal: null,
  editingStop: null,
  draggedStopOrdinal: null,
  totalKm: 0,
  error: null
};
```

**API Wrapper Functions:**
```javascript
async loadRouteForCampaign(campaignId)
  // GET /api/campaigns/:id/route
  // Load route when campaign selected
  // Returns: { stops, totalKm, stopCount }

async createStopViaAPI(campaignId, locationId, detail, kmFromPrevious, ordinal)
  // POST /api/campaigns/:id/route/stops
  // Create new route stop
  // Returns: { stop }

async updateStopViaAPI(campaignId, ordinal, detail, kmFromPrevious)
  // PUT /api/campaigns/:id/route/stops/:ordinal
  // Update stop detail or distance
  // Returns: { stop }

async deleteStopViaAPI(campaignId, ordinal)
  // DELETE /api/campaigns/:id/route/stops/:ordinal
  // Remove stop from route
  // Returns: { success: true }

async reorderRouteViaAPI(campaignId, orderedLocationIds)
  // PUT /api/campaigns/:id/route/reorder
  // Reorder all stops
  // Returns: { success: true }
```

**Modal Handlers:**
```javascript
openRouteEditorModal()
  // Show route management dialog
  // Display current route stops
  // Show add/edit controls

handleAddStopToRoute()
  // Open "add new stop" form
  // Show location selector
  // Clear form fields

handleEditStop(ordinal)
  // Open edit mode for specific stop
  // Populate detail and km fields
  // Allow modification

handleDeleteStop(ordinal)
  // Remove stop from route
  // Confirm before deleting
  // Refresh display

handleSaveStop()
  // Validate form
  // Create or update via API
  // Refresh route display
  // Clear form

handleReorderStops(dragFrom, dragTo)
  // Handle drag-and-drop reordering
  // Update ordinal array
  // Call reorderRouteViaAPI
```

**Rendering Functions:**
```javascript
renderRouteList()
  // Display all stops in order
  // Show: ordinal, location name, detail, km
  // Include edit/delete buttons
  // Show total km at bottom

renderStopCard(stop, ordinal)
  // Single stop display
  // Show location name and grid ref
  // Show detail and distance
  // Include action buttons

renderRouteEditor()
  // Form for creating/editing stops
  // Location dropdown (populated from locations)
  // Detail input field
  // Distance input field
  // Save/cancel buttons

renderDistanceSummary()
  // Show: total km, stop count
  // Update in real-time
```

**Event Setup:**
```javascript
setupRouteEventListeners()
  // Attach handlers to all route-related elements
  // Connect form submissions
  // Wire up click handlers
  // Setup drag-and-drop (if implemented)
```

**Exported API:**
```javascript
window.routeClient = {
  loadRouteForCampaign,
  createStopViaAPI,
  updateStopViaAPI,
  deleteStopViaAPI,
  reorderRouteViaAPI,
  openRouteEditorModal,
  handleAddStopToRoute,
  handleEditStop,
  handleDeleteStop,
  handleSaveStop,
  handleReorderStops,
  renderRouteList,
  renderRouteEditor,
  setupRouteEventListeners,
  routeState
};
```

---

### 2. Route Editor Modal UI (index.html)

**Add to index.html (~300 lines):**

```html
<!-- Route Management Modal -->
<div id="route-editor-modal" class="modal" style="display: none;">
  <div class="modal-content">
    <h2>Route Management</h2>
    
    <!-- Route List -->
    <div id="route-stops-list" class="route-stops-grid">
      <!-- Rendered by routeClient.renderRouteList() -->
    </div>
    
    <!-- Stop Editor (Create/Edit) -->
    <div id="stop-editor-panel" style="display: none;">
      <h3 id="stop-editor-title">Add Stop</h3>
      <form id="stop-editor-form">
        <label>Location:
          <select id="stop-location-select" required>
            <option value="">Select a location...</option>
            <!-- Populated from campaign locations -->
          </select>
        </label>
        
        <label>Stop Detail:
          <input type="text" id="stop-detail-input" 
            placeholder="e.g., Refuel and resupply" 
            maxlength="160" required>
        </label>
        
        <label>Distance from previous (km):
          <input type="number" id="stop-km-input" 
            min="0" value="0" required>
        </label>
        
        <div id="stop-editor-status" class="form-feedback"></div>
        
        <div class="button-group">
          <button type="submit" class="btn btn-primary">Save Stop</button>
          <button type="button" class="btn btn-secondary" 
            data-action="close-stop-editor">Cancel</button>
        </div>
      </form>
    </div>
    
    <!-- Add Stop Button -->
    <button class="btn btn-primary" data-action="open-add-stop-form">
      + Add Stop to Route
    </button>
    
    <!-- Close Modal -->
    <button class="btn btn-secondary" data-action="close-route-editor">Done</button>
  </div>
</div>
```

**CSS Styling (~100 lines):**

```css
/* Route stops grid */
.route-stops-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  margin: 1rem 0;
  padding: 1rem;
  background: var(--muted-bg);
  border-radius: 0.25rem;
}

/* Stop card */
.stop-card {
  background: white;
  border: 1px solid var(--muted-border);
  padding: 1rem;
  border-radius: 0.25rem;
  position: relative;
}

.stop-card::before {
  content: attr(data-ordinal);
  display: inline-block;
  background: var(--forest);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.125rem;
  font-size: 0.875rem;
  margin-right: 0.5rem;
  font-weight: bold;
}

.stop-card .stop-location {
  font-weight: bold;
  font-family: var(--serif);
  margin-top: 0.5rem;
}

.stop-card .stop-detail {
  font-size: 0.875rem;
  color: var(--muted-text);
  margin: 0.25rem 0;
}

.stop-card .stop-km {
  font-size: 0.875rem;
  margin: 0.5rem 0;
  padding-top: 0.5rem;
  border-top: 1px solid var(--muted-border);
}

.stop-card .stop-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.stop-card .stop-actions button {
  flex: 1;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

/* Stop editor panel */
#stop-editor-panel {
  background: var(--muted-bg);
  border: 1px solid var(--muted-border);
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 0.25rem;
}

#stop-editor-form label {
  display: block;
  margin-bottom: 1rem;
}

#stop-editor-form input,
#stop-editor-form select {
  width: 100%;
  padding: 0.5rem;
  margin-top: 0.25rem;
  border: 1px solid var(--muted-border);
  border-radius: 0.25rem;
  font-family: var(--sans);
}

/* Distance summary */
.route-summary {
  margin: 1rem 0;
  padding: 1rem;
  background: var(--muted-bg);
  border-left: 3px solid var(--sky);
  border-radius: 0.25rem;
}

.route-summary .summary-stat {
  display: inline-block;
  margin-right: 2rem;
}

.route-summary .summary-label {
  font-size: 0.875rem;
  color: var(--muted-text);
}

.route-summary .summary-value {
  font-weight: bold;
  font-size: 1.25rem;
}
```

---

### 3. Campaign Integration (index.html)

**Add to main event listener:**
```javascript
// Route management
if (action === "open-route-editor") {
  routeClient.openRouteEditorModal();
}

if (action === "open-add-stop-form") {
  routeClient.handleAddStopToRoute();
}

if (action === "save-stop") {
  routeClient.handleSaveStop();
}

if (action.startsWith("edit-stop-")) {
  const ordinal = parseInt(action.split("-")[2], 10);
  routeClient.handleEditStop(ordinal);
}

if (action.startsWith("delete-stop-")) {
  const ordinal = parseInt(action.split("-")[2], 10);
  routeClient.handleDeleteStop(ordinal);
}

if (action === "close-stop-editor") {
  document.getElementById("stop-editor-panel").style.display = "none";
}

if (action === "close-route-editor") {
  document.getElementById("route-editor-modal").style.display = "none";
}
```

**Load route when campaign selected:**
```javascript
// In handleCampaignSelection()
if (campaignData) {
  // ... existing code ...
  
  // Load route
  routeClient.loadRouteForCampaign(campaignData.id)
    .then(() => {
      routeClient.renderRouteList();
    })
    .catch(err => {
      console.error("Failed to load route:", err);
      routeClient.routeState.error = err.message;
    });
}
```

**Integrate route into dashboard:**
```html
<!-- Add route section to main dashboard -->
<section id="route-section" class="dashboard-section">
  <h3>Campaign Route
    <button class="btn btn-sm" data-action="open-route-editor">Manage</button>
  </h3>
  <div id="route-display">
    <!-- Rendered by routeClient.renderRouteList() -->
  </div>
</section>
```

---

### 4. Location Selector Population

**Auto-populate location dropdown when route editor opens:**

```javascript
// In handleAddStopToRoute()
async function populateLocationSelector() {
  const campaignId = routeState.campaignId;
  if (!campaignId) return;
  
  try {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/locations`);
    if (!response.ok) throw new Error("Failed to load locations");
    
    const data = await response.json();
    const select = document.getElementById("stop-location-select");
    
    // Clear existing options
    select.innerHTML = '<option value="">Select a location...</option>';
    
    // Add locations, excluding already-used ones
    const usedLocationIds = new Set(routeState.route.map(s => s.locationId));
    
    data.locations.forEach(loc => {
      if (!usedLocationIds.has(loc.id)) {
        const option = document.createElement("option");
        option.value = loc.id;
        option.textContent = `${loc.name} (${loc.kind})`;
        select.appendChild(option);
      }
    });
  } catch (error) {
    console.error("Error loading locations:", error);
    routeState.error = error.message;
  }
}
```

---

## Implementation Plan (Step by Step)

### Step 1: Create route-client.js (3-4 hours)
1. Copy personnel-client.js as template
2. Implement routeState object
3. Implement API wrapper functions (loadRoute, createStop, updateStop, deleteStop, reorderRoute)
4. Implement modal handlers (open, add, edit, delete, save)
5. Implement render functions (list, card, editor, summary)
6. Implement event setup
7. Export via window.routeClient

### Step 2: Add UI to index.html (2-3 hours)
1. Create route editor modal (~200 lines)
2. Add CSS styling (~100 lines)
3. Add route display section (~50 lines)
4. Add event handlers to main click listener (~50 lines)
5. Integrate with campaign selection

### Step 3: Campaign Integration (1-2 hours)
1. Load route when campaign selected
2. Populate location selector
3. Display route summary
4. Handle form submissions
5. Update campaign when route changes

### Step 4: Testing (2-3 hours)
1. Create route-client tests
2. Test modal interactions
3. Test form validation
4. Test API calls
5. Test state management
6. ~20-25 new tests

---

## Exit Checks

**Phase 3.3 Complete When:**

- ✅ route-client.js module created
- ✅ All functions exported and accessible
- ✅ Route editor modal visible
- ✅ Can add stop to route
- ✅ Can edit stop details
- ✅ Can delete stop from route
- ✅ Can reorder stops
- ✅ Route displays in dashboard
- ✅ Location selector populated
- ✅ Distance summary shows total km
- ✅ Route loads when campaign selected
- ✅ Route saves when changes made
- ✅ Form validation working
- ✅ Error messages displayed
- ✅ CSS styling applied
- ✅ All new tests passing
- ✅ Zero regressions

---

## Files to Create/Modify

| File | Type | Size | Purpose |
|------|------|------|---------|
| route-client.js | Create | 350-400 lines | Client module |
| index.html | Modify | +350 lines | Modal, styling, integration |
| tests/route-client.test.cjs | Create | 400-500 lines | 20-25 tests |
| PHASE3.3_IMPLEMENTATION_NOTES.md | Create | ~8KB | Technical notes |

---

## Reusable Patterns (from Phase 3.1/3.2)

✅ **From personnel-client.js:**
- State object pattern
- API wrapper functions
- Modal handlers
- Rendering with HTML escaping
- Event listener setup
- Export via window namespace

✅ **From location-client.js:**
- Campaign integration
- List grid rendering
- Form validation
- Status message display
- Campaign isolation checks

✅ **From index.html CSS:**
- Grid layout system
- Card styling
- Button groups
- Form styling
- Color tokens
- Responsive design

---

## Timeline

| Task | Duration | Status |
|------|----------|--------|
| route-client.js | 3-4 hours | 🟡 Starting |
| UI components | 2-3 hours | 🟡 Starting |
| Integration | 1-2 hours | 🟡 Starting |
| Testing | 2-3 hours | 🟡 Starting |
| Documentation | 1 hour | 🟡 Starting |
| **Total** | **9-13 hours** | 🟡 **Starting** |

**Estimated Duration:** 1-2 full working days

---

## Success Criteria

✅ All route CRUD operations accessible via UI  
✅ Route displays in campaign dashboard  
✅ Can add, edit, delete, reorder stops  
✅ Location selector excludes already-used locations  
✅ Distance summary shows accurate totals  
✅ Form validation prevents invalid data  
✅ Error messages clear and actionable  
✅ All tests passing (250+ tests expected)  
✅ Zero regressions from Phase 3.1-3.2  
✅ Production-ready UI  

---

## Next Phase (3.4)

**Map Publication & Visualization** (estimated 3-4 days)
- Route preview on map (polyline rendering)
- Stop markers with labels
- Publication controls
- GM-only vs player-visible content
- Map visualization styling

Depends on: Phase 3.3 complete ✅
