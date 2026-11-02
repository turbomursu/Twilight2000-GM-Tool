# Phase 3.1: Location Management — Starting Implementation

**Status:** 🟡 **In Progress**  
**Date Started:** 02 Nov 2026  
**Target Completion:** 04 Nov 2026 (2 days)

---

## Current Database Schema Analysis

### Existing Tables
- ✅ `locations` — Location/waypoint data
  - Fields: runtime_campaign_id, id, name, kind, description, grid_ref, coordinates_json, map_position_json, visibility_eligibility, is_starting_location
  - Supports GM-only and player-visible locations
  - Linked to settlements via settlement_factions

- ✅ `route_stops` — Campaign route data
  - Fields: campaign_id, ordinal, location_id, detail, km_from_previous
  - Ordered route connecting locations
  - Linked to campaigns via campaigns.runtime_id

- ✅ `maps` — Campaign map data
  - Fields: bounds_json, center_json, zoom, atlas_json, annotations_json, attribution
  - Stores campaign bounds, initial view, and offline basemap info

### Database Structure Summary
```
campaigns
  ├── maps (1:1) — map bounds, center, basemap
  ├── locations (1:N) — waypoints/settlements
  │   └── settlements (1:1) — optional settlement details
  ├── route_stops (1:N) — ordered route waypoints
  └── factions (1:N) — with influence layers
```

---

## Phase 3.1 Deliverables

### 1. Location CRUD API Endpoints

**Implemented in: `server/campaigns.cjs`**

#### POST /api/campaigns/:id/locations
Create new location

**Request Body:**
```json
{
  "name": "Sälen",
  "kind": "Settlement",
  "description": "Small mountain village",
  "mapPosition": { "lat": 61.4, "lng": 14.9 },
  "gridRef": "A1",
  "visibilityEligibility": "players",
  "notes": "GM-only notes here"
}
```

**Response:**
```json
{
  "location": {
    "id": "loc_abc123",
    "name": "Sälen",
    "kind": "Settlement",
    "mapPosition": { "lat": 61.4, "lng": 14.9 },
    "description": "Small mountain village",
    "gridRef": "A1",
    "visibilityEligibility": "players",
    "notes": "GM-only notes here",
    "createdAt": "2026-11-02T17:11:00Z"
  }
}
```

**Validation:**
- ✓ mapPosition within campaign bounds
- ✓ name not empty (max 160 chars)
- ✓ kind not empty (max 80 chars)
- ✓ Campaign ownership enforced (GM only)

---

#### GET /api/campaigns/:id/locations
List all locations for campaign

**Response:**
```json
{
  "locations": [
    {
      "id": "loc_abc123",
      "name": "Sälen",
      "kind": "Settlement",
      "mapPosition": { "lat": 61.4, "lng": 14.9 },
      "description": "Small mountain village",
      "visibilityEligibility": "players"
    },
    ...
  ]
}
```

**Filter Parameters (query string):**
- `kind` — filter by location kind (Settlement, Checkpoint, Supply Cache, etc.)
- `visibility` — filter by gm-only or players
- `sort` — name, kind, distance (from origin)

---

#### PUT /api/campaigns/:id/locations/:locationId
Update location details

**Request Body:**
```json
{
  "name": "Sälen (updated)",
  "kind": "Settlement",
  "description": "Updated description",
  "mapPosition": { "lat": 61.41, "lng": 14.91 },
  "gridRef": "A1",
  "visibilityEligibility": "players",
  "notes": "Updated GM notes"
}
```

**Response:** Updated location object

**Validation:**
- ✓ Location must exist
- ✓ mapPosition within bounds
- ✓ Campaign ownership enforced
- ✓ Cannot move location if used in route (check route_stops)

---

#### DELETE /api/campaigns/:id/locations/:locationId
Delete location

**Response:**
```json
{ "success": true, "message": "Location deleted" }
```

**Validation:**
- ✓ Location must exist
- ✓ Campaign ownership enforced
- ✓ Check if location is in route_stops — if yes, return error "Cannot delete location used in route"
- ✓ Check if location is starting location — warn but allow deletion

**Side Effects:**
- Delete associated settlement (if any)
- Error if route depends on this location

---

### 2. Location Client Module

**File: `location-client.js`** (new, ~400-500 lines)

Follows same pattern as `personnel-client.js`:

```javascript
// State management
let locationState = {
  locations: [],
  runtimeCampaignId: null,
  sortBy: 'name',
  filterKind: null,
  filterVisibility: null
};

// Functions to export
loadLocationsForCampaign(campaignId)
createLocation(name, kind, mapPosition, overrides)
updateLocation(locationId, updates)
deleteLocation(locationId)
renderLocationList()
openLocationEditorModal(locationId)
openLocationCreationForm()

// Helper functions
escapeHtml(text)
formatCoordinates(position)
validateBounds(position, bounds)
```

**Export via `window.locationClient` namespace**

---

### 3. Location Editor Modal

**File: `index.html`** (add new modal)

```html
<dialog id="location-editor-modal" aria-labelledby="location-editor-title">
  <div class="dialog-head">
    <div>
      <div class="eyebrow">GM runtime / map</div>
      <h2 id="location-editor-title">Edit location</h2>
    </div>
    <button class="icon-button" type="button" data-action="close-location-editor" 
            aria-label="Close location editor">×</button>
  </div>
  <div class="dialog-form">
    <div class="field">
      <label for="location-name">Location Name *</label>
      <input id="location-name" type="text" maxlength="160" required placeholder="e.g., Sälen">
    </div>
    <div class="field">
      <label for="location-kind">Location Type</label>
      <select id="location-kind">
        <option value="Settlement">Settlement</option>
        <option value="Checkpoint">Checkpoint</option>
        <option value="Supply Cache">Supply Cache</option>
        <option value="Base">Military Base</option>
        <option value="Ruin">Ruin/Abandoned Site</option>
        <option value="Point of Interest">Point of Interest</option>
        <option value="Other">Other</option>
      </select>
    </div>
    <div class="field">
      <label for="location-description">Description</label>
      <input id="location-description" type="text" maxlength="300" placeholder="Brief description for players">
    </div>
    <div class="field">
      <label for="location-gridref">Grid Reference</label>
      <input id="location-gridref" type="text" maxlength="40" placeholder="e.g., A1, 12,34">
    </div>
    <div class="field">
      <label>Map Position *</label>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div>
          <label for="location-lat" style="display: block; font: 9px var(--mono); margin-bottom: 4px;">Latitude</label>
          <input id="location-lat" type="number" step="0.01" placeholder="61.4" required>
        </div>
        <div>
          <label for="location-lng" style="display: block; font: 9px var(--mono); margin-bottom: 4px;">Longitude</label>
          <input id="location-lng" type="number" step="0.01" placeholder="14.9" required>
        </div>
      </div>
    </div>
    <div class="field">
      <label for="location-visibility">Visibility</label>
      <select id="location-visibility">
        <option value="gm-only">GM Only</option>
        <option value="players">Players</option>
      </select>
    </div>
    <div class="field">
      <label for="location-notes">GM Notes (hidden from players)</label>
      <textarea id="location-notes" maxlength="1000" rows="3" 
                placeholder="Internal notes, threats, secrets"></textarea>
    </div>
    <p class="feedback" id="location-editor-status" role="status"></p>
    <div class="dialog-actions">
      <button class="button" type="button" id="location-editor-cancel">Cancel</button>
      <button class="button button-primary" type="button" id="location-editor-save">Save location</button>
    </div>
  </div>
</dialog>
```

---

### 4. Location List UI

**File: `index.html`** (add to Campaign/Situation view section)

**Location panel in dashboard:**
```html
<section class="panel" id="campaign-locations-panel">
  <div class="panel-head">
    <div>
      <div class="eyebrow">Campaign Map</div>
      <h2>Locations & Waypoints</h2>
    </div>
    <button class="button button-primary" id="create-location" type="button">
      <span aria-hidden="true">+</span> New location
    </button>
  </div>
  <div class="panel-body">
    <div class="location-controls">
      <select id="location-filter-kind" aria-label="Filter by location type">
        <option value="">All Types</option>
        <option value="Settlement">Settlement</option>
        <option value="Checkpoint">Checkpoint</option>
        <option value="Supply Cache">Supply Cache</option>
        <option value="Base">Military Base</option>
        <option value="Ruin">Ruin/Abandoned Site</option>
        <option value="Point of Interest">Point of Interest</option>
      </select>
      <select id="location-filter-visibility" aria-label="Filter by visibility">
        <option value="">All Visibility</option>
        <option value="gm-only">GM Only</option>
        <option value="players">Players</option>
      </select>
    </div>
    <div id="location-list" class="location-grid"></div>
  </div>
</section>
```

**CSS for location list:**
```css
.location-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.location-controls select {
  flex: 1;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--line);
  background: white;
  font-size: 11px;
}

.location-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.location-card {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 2px;
  background: white;
  cursor: pointer;
}

.location-card:hover {
  border-color: var(--forest);
  background: #f9faf6;
  box-shadow: 0 2px 4px #17231f22;
}

.location-card h3 {
  margin: 0 0 4px;
  font: 12px var(--serif);
  color: var(--ink);
}

.location-card .kind {
  display: inline-block;
  padding: 2px 6px;
  background: #e8ece5;
  border-radius: 2px;
  font: 9px var(--mono);
  color: var(--muted);
  margin-bottom: 8px;
}

.location-card .coords {
  font: 9px var(--mono);
  color: var(--muted);
  margin-bottom: 6px;
}

.location-card .visibility-badge {
  display: inline-block;
  padding: 2px 6px;
  background: #f0e9d8;
  border-radius: 2px;
  font: 8px var(--mono);
  color: #a97832;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.location-actions {
  display: flex;
  gap: 6px;
}

.location-actions button {
  flex: 1;
  font-size: 9px;
  padding: 6px 4px;
}
```

---

### 5. Event Handlers

**File: `index.html`** (add to main click listener)

```javascript
// Location management
if (action === "close-location-editor") {
  document.getElementById("location-editor-modal").close();
}

if (action === "open-location-create") {
  if (state.runtimeCampaignId) {
    window.locationClient.openLocationCreationForm();
  } else {
    showToast("Select a runtime campaign first.");
  }
}

if (action === "open-location-edit") {
  const locationId = button.dataset.locationId;
  window.locationClient.openLocationEditorModal(locationId);
}

if (action === "delete-location") {
  const locationId = button.dataset.locationId;
  if (confirm("Delete this location? Cannot undo.")) {
    window.locationClient.deleteLocation(locationId);
  }
}
```

---

### 6. Campaign Integration

**File: `index.html`** (in `applyRuntimeSnapshot` function)

```javascript
// Load locations when runtime campaign is selected
if (window.locationClient) {
  window.locationClient.loadLocationsForCampaign(runtime.campaign.id);
}
```

---

### 7. Test Coverage

**File: `test/milestone3-locations.test.cjs`** (new, ~200-300 lines)

```javascript
describe("Phase 3.1: Location Management", () => {
  // Test location creation with validation
  test("Create location with valid data", () => { ... });
  test("Create location rejects empty name", () => { ... });
  test("Create location rejects out-of-bounds coordinates", () => { ... });
  test("Create location validates campaign ownership", () => { ... });
  
  // Test location retrieval
  test("List locations for campaign", () => { ... });
  test("List locations filters by kind", () => { ... });
  test("List locations filters by visibility", () => { ... });
  
  // Test location update
  test("Update location changes name and description", () => { ... });
  test("Update location validates new coordinates within bounds", () => { ... });
  test("Update rejects if location not found", () => { ... });
  test("Update enforces campaign ownership", () => { ... });
  
  // Test location deletion
  test("Delete location removes from database", () => { ... });
  test("Delete location rejects if in route", () => { ... });
  test("Delete location enforces campaign ownership", () => { ... });
  test("Delete allows removal of starting location with warning", () => { ... });
  
  // Integration tests
  test("Location creation, update, retrieval, deletion cycle", () => { ... });
  test("Multiple locations persist correctly", () => { ... });
  test("Locations isolated by campaign", () => { ... });
});
```

---

## Implementation Checklist

### Code Changes
- [ ] Implement location API endpoints in `campaigns.cjs`
  - [ ] POST /api/campaigns/:id/locations
  - [ ] GET /api/campaigns/:id/locations
  - [ ] PUT /api/campaigns/:id/locations/:locationId
  - [ ] DELETE /api/campaigns/:id/locations/:locationId
- [ ] Create `location-client.js` module
  - [ ] State management
  - [ ] Load/create/update/delete functions
  - [ ] Rendering functions
  - [ ] Modal handlers
- [ ] Add location editor modal to `index.html`
  - [ ] HTML structure
  - [ ] Form fields
  - [ ] Event handlers
- [ ] Add location list UI to `index.html`
  - [ ] Location grid/list view
  - [ ] Filter controls
  - [ ] Quick actions
  - [ ] CSS styling
- [ ] Integrate into campaign flow
  - [ ] Auto-load locations when campaign selected
  - [ ] Add event handlers for create/edit/delete
  - [ ] Connect to modal close buttons
- [ ] Write comprehensive tests
  - [ ] All CRUD operations
  - [ ] Validation tests
  - [ ] Integration tests
  - [ ] Ownership/isolation tests

### Verification
- [ ] All 40+ Phase 3.1 tests passing
- [ ] All 136 existing tests still passing
- [ ] Can create location via API
- [ ] Can view location in UI
- [ ] Can edit location details
- [ ] Can delete location (with route check)
- [ ] Bounds validation working
- [ ] GM ownership enforced
- [ ] Player visibility settings respected

---

## Files to Modify/Create

| File | Type | Status |
|------|------|--------|
| `server/campaigns.cjs` | Modify | Add 4 location endpoints |
| `location-client.js` | Create | ~400 lines, client module |
| `index.html` | Modify | Add modal + list UI + handlers |
| `test/milestone3-locations.test.cjs` | Create | ~250 lines, tests |

---

## Next Phase Conditions

✅ **Phase 3.1 complete when:**
- All location CRUD endpoints implemented and tested
- Location editor modal integrated into UI
- Location list displays in GM dashboard
- Locations persist correctly
- All 40+ tests passing
- No regressions in existing tests

**Triggers Phase 3.2:** Route Management (can start after location endpoints are stable)

---

## Notes & Decisions

1. **Visibility Model:** Locations have GM-only or players settings
   - GM-only: Not shown to players even if published
   - Players: Can be shown to players if publication includes them

2. **Route Dependency:** Cannot delete location while in use in route
   - Prevents orphaned route stops
   - UI will show error message

3. **Grid References:** Optional `gridRef` field for hexagonal grid coordinates
   - Not required but useful for campaign planning
   - Format: "A1", "12,34" etc.

4. **Notes Field:** GM-only notes field for internal planning
   - Never published to players
   - Supports threat assessment, secrets, etc.

5. **Bounds Validation:** All coordinates validated against campaign bounds
   - Enforced at API layer
   - Prevents out-of-bounds locations
   - Error message shows valid bounds

---

**Status:** Ready to implement  
**Estimated Duration:** 1-2 days  
**Target Completion:** 04 Nov 2026
