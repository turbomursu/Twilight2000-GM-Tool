# Phase 3.2: Route Management — Starting Implementation

**Status:** 🟡 **Starting**  
**Date Started:** 02 Nov 2026  
**Target Completion:** 04 Nov 2026 (2 days)  
**Depends On:** Phase 3.1 (Location Management) ✅ Complete

---

## Overview

Phase 3.2 builds the route management system connecting locations with terrain, distance, and travel-time calculations based on verified Twilight: 2000 Fourth Edition rules.

**Key Deliverables:**
1. Route CRUD API endpoints (POST, GET, PUT, DELETE)
2. Route client module (route-client.js)
3. Route editor modal UI (create/edit stops, reorder, delete)
4. Route preview on map (polyline, stop markers, distances)
5. Terrain and distance calculations
6. Comprehensive test suite (15-20 tests)

---

## Current Database Schema

### `route_stops` Table
```sql
CREATE TABLE route_stops (
  campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  location_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  km_from_previous INTEGER NOT NULL CHECK (km_from_previous >= 0),
  PRIMARY KEY (campaign_id, ordinal),
  UNIQUE (campaign_id, location_id),
  FOREIGN KEY (campaign_id, location_id) REFERENCES locations(runtime_campaign_id, id)
)
```

**Fields:**
- `campaign_id` — Runtime campaign ID (composite key with ordinal)
- `ordinal` — Stop order in route (0-based, enforces sequential ordering)
- `location_id` — Foreign key to locations table
- `detail` — Stop description (e.g., "Departure point", "Supply cache", "Safe house")
- `km_from_previous` — Distance from previous stop (0 for first stop)
- **Unique constraint:** Only one route stop per location per campaign (prevents duplicates)
- **Foreign key:** Links to locations with CASCADE delete

### `runtime_dashboard_state` Table
```sql
CREATE TABLE runtime_dashboard_state (
  campaign_id TEXT PRIMARY KEY,
  game_date TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  distance_km INTEGER NOT NULL,
  rations_days INTEGER NOT NULL,
  fuel_units INTEGER NOT NULL,
  weather TEXT NOT NULL,
  weather_note TEXT NOT NULL,
  active_stop_index INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
)
```

**For Phase 3.2:**
- `active_stop_index` — Currently displayed stop (updated when GM advances)
- `distance_km` — Total route distance (derived, not stored directly)

### `locations` Table
```sql
CREATE TABLE locations (
  runtime_campaign_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  grid_ref TEXT,
  coordinates_json TEXT,
  map_position_json TEXT NOT NULL,    -- {"lat": 61.4, "lng": 14.9}
  visibility_eligibility TEXT NOT NULL,
  is_starting_location INTEGER NOT NULL,
  PRIMARY KEY (runtime_campaign_id, id)
)
```

**For Phase 3.2:**
- `map_position_json` — Coordinates for distance calculations
- All locations already created via Phase 3.1 API

---

## Phase 3.2 Deliverables

### 1. Route CRUD API Endpoints

**Implemented in: `server/campaigns.cjs` (new handler: `routesMatch`)**

#### POST /api/campaigns/:id/route/stops
Create a new route stop (add location to route)

**Request Body:**
```json
{
  "locationId": "loc_abc123",
  "detail": "Departure point",
  "kmFromPrevious": 0,
  "ordinal": 0
}
```

**Validation:**
- ✓ Campaign ownership (GM only)
- ✓ Location exists and belongs to campaign
- ✓ ordinal >= 0
- ✓ No duplicate location in same route (UNIQUE constraint)
- ✓ kmFromPrevious >= 0
- ✓ If ordinal > 0, previous stop must exist

**Response:**
```json
{
  "stop": {
    "campaignId": "...",
    "ordinal": 0,
    "locationId": "loc_abc123",
    "locationName": "Sälen",
    "detail": "Departure point",
    "kmFromPrevious": 0,
    "gridRef": "A1",
    "mapPosition": { "lat": 61.4, "lng": 14.9 }
  }
}
```

**Error Cases:**
- `404` — Campaign or location not found
- `409` — Location already in route
- `422` — Validation failed (invalid ordinal, km, detail)

---

#### GET /api/campaigns/:id/route
List all route stops for campaign

**Response:**
```json
{
  "route": [
    {
      "ordinal": 0,
      "locationId": "loc_abc123",
      "locationName": "Sälen",
      "gridRef": "A1",
      "mapPosition": { "lat": 61.4, "lng": 14.9 },
      "detail": "Departure point",
      "kmFromPrevious": 0
    },
    {
      "ordinal": 1,
      "locationId": "loc_def456",
      "locationName": "Falun",
      "gridRef": "B2",
      "mapPosition": { "lat": 60.62, "lng": 15.63 },
      "detail": "Refuel and resupply",
      "kmFromPrevious": 85
    }
  ],
  "totalKm": 85,
  "stopCount": 2
}
```

**Properties:**
- Returns stops in ordinal order
- Includes location coordinates for map rendering
- totalKm = sum of all kmFromPrevious (excluding first stop)

---

#### PUT /api/campaigns/:id/route/stops/:ordinal
Update a route stop (edit detail or km)

**Request Body:**
```json
{
  "detail": "Updated stop description",
  "kmFromPrevious": 90
}
```

**Validation:**
- ✓ Campaign ownership
- ✓ Stop exists at ordinal
- ✓ kmFromPrevious >= 0
- ✓ Cannot change location (use delete + create to reorder)

**Response:**
```json
{
  "stop": {
    "ordinal": 1,
    "locationId": "loc_def456",
    "locationName": "Falun",
    "detail": "Updated stop description",
    "kmFromPrevious": 90
  }
}
```

---

#### DELETE /api/campaigns/:id/route/stops/:ordinal
Remove a stop from route (also renumbers remaining stops)

**Validation:**
- ✓ Campaign ownership
- ✓ Stop exists
- ✓ After deletion, renumber all subsequent stops (ordinal -= 1)
- ✓ If deleting stop 0, next stop's kmFromPrevious becomes 0

**Response:**
```json
{ "deleted": true }
```

---

#### PUT /api/campaigns/:id/route/reorder
Reorder stops in route (GM drag-and-drop)

**Request Body:**
```json
{
  "orderedLocationIds": ["loc_abc123", "loc_ghi789", "loc_def456"]
}
```

**Validation:**
- ✓ Campaign ownership
- ✓ All locations exist and are in current route
- ✓ No missing or extra locations
- ✓ Ordinals updated: location[0].ordinal = 0, etc.

**Response:**
```json
{
  "route": [
    { "ordinal": 0, "locationId": "loc_abc123", "locationName": "Sälen" },
    { "ordinal": 1, "locationId": "loc_ghi789", "locationName": "Gavle" },
    { "ordinal": 2, "locationId": "loc_def456", "locationName": "Falun" }
  ]
}
```

---

### 2. Route Client Module

**File:** `route-client.js` (350-400 lines)

**Pattern:** Follows `personnel-client.js` and `location-client.js`

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

**API Functions:**
- `loadRouteForCampaign(campaignId)` — GET /api/campaigns/:id/route
- `createStopViaAPI(campaignId, locationId, detail, kmFromPrevious, ordinal)` — POST
- `updateStopViaAPI(campaignId, ordinal, detail, kmFromPrevious)` — PUT
- `deleteStopViaAPI(campaignId, ordinal)` — DELETE
- `reorderRouteViaAPI(campaignId, orderedLocationIds)` — PUT /reorder

**Modal Handlers:**
- `openRouteEditorModal()` — Show route editor dialog
- `handleAddStopToRoute(locationId)` — Create new stop
- `handleEditStop(ordinal)` — Open edit mode for stop
- `handleDeleteStop(ordinal)` — Remove stop with confirmation
- `handleReorderStops(dragFrom, dragTo)` — Drag-and-drop reorder

**Rendering:**
- `renderRouteList()` — Display route stops in order with distances
- `renderStopCard(stop, ordinal)` — Single stop in list
- `renderRoutePreview()` — Map polyline and markers
- `renderDistanceSummary()` — Total KM and stop count

**Event Setup:**
- `setupRouteEventListeners()` — Attach handlers to DOM

**Exported:**
```javascript
window.routeClient = {
  loadRouteForCampaign,
  createStopViaAPI,
  updateStopViaAPI,
  deleteStopViaAPI,
  reorderRouteViaAPI,
  openRouteEditorModal,
  // ... handlers and render functions
};
```

---

### 3. Route Editor Modal UI

**In `index.html`, add route editor modal (~300 lines):**

```html
<div id="route-editor-modal" class="modal" style="display: none;">
  <div class="modal-content">
    <h2>Route Management</h2>
    
    <!-- Route List -->
    <div id="route-stops-list" class="route-stops-grid">
      <!-- Rendered by routeClient.renderRouteList() -->
    </div>
    
    <!-- Stop Editor (Create/Edit) -->
    <div id="stop-editor" style="display: none;">
      <h3 id="stop-editor-title">Add Stop</h3>
      <form id="stop-editor-form">
        <label>Location:
          <select id="stop-location-select" required>
            <option value="">Select a location...</option>
            <!-- Populated from locations -->
          </select>
        </label>
        
        <label>Stop Detail:
          <input type="text" id="stop-detail-input" 
            placeholder="e.g., Refuel and resupply" required maxlength="160">
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
    <button class="btn btn-primary" data-action="open-add-stop-form">+ Add Stop</button>
    
    <!-- Close Modal -->
    <button class="btn btn-secondary" data-action="close-route-editor">Done</button>
  </div>
</div>
```

**CSS Styling (~100 lines):**
- Route stops grid (3-column layout on desktop, responsive)
- Stop cards showing name, ordinal, km, and detail
- Edit/delete/drag buttons on each card
- Drag handle (⋮⋮) for reordering
- Status/error messages in modal

---

### 4. Route Persistence in Runtime API

**Modify `server/campaigns.cjs` `/api/campaigns/:id/runtime` endpoint:**

When loading or saving campaign runtime state:
- GET includes `route` array with all stops
- PUT validates route array, updates ordinals, increments campaign revision
- Route updates append to audit trail

**Example runtime state:**
```json
{
  "runtime": {
    "campaign": { "id": "...", "name": "The Long Road" },
    "dashboard": { "activeStopIndex": 1, ... },
    "route": [
      {
        "ordinal": 0,
        "locationId": "loc_abc123",
        "name": "Sälen",
        "detail": "Departure point",
        "kmFromPrevious": 0,
        "gridRef": "A1",
        "mapPosition": { "lat": 61.4, "lng": 14.9 }
      },
      { "ordinal": 1, ... }
    ],
    "locations": [...],
    "personnel": [...]
  }
}
```

---

## Implementation Plan

### Step 1: Backend Routes (2-3 hours)
1. Add route CRUD functions to `runtime-store.cjs`:
   - `listRouteStops(campaignId)` — Query all stops ordered by ordinal
   - `createRouteStop(campaignId, locationId, detail, kmFromPrevious, ordinal)` — Validate, insert
   - `updateRouteStop(campaignId, ordinal, detail, kmFromPrevious)` — Validate, update
   - `deleteRouteStop(campaignId, ordinal)` — Delete, renumber rest
   - `reorderRouteStops(campaignId, orderedLocationIds)` — Reorder all stops atomically

2. Add route API handler to `server/campaigns.cjs`:
   - POST /api/campaigns/:id/route/stops
   - GET /api/campaigns/:id/route
   - PUT /api/campaigns/:id/route/stops/:ordinal
   - DELETE /api/campaigns/:id/route/stops/:ordinal
   - PUT /api/campaigns/:id/route/reorder

3. Integrate route into runtime snapshot API:
   - Include route in GET /api/campaigns/:id/runtime
   - Validate route on PUT /api/campaigns/:id/runtime

### Step 2: Client Module (2-3 hours)
1. Create `route-client.js`:
   - State management (routeState object)
   - API wrapper functions
   - Modal event handlers
   - Rendering functions

2. Add modal handlers to main click listener:
   - `open-route-editor`
   - `open-add-stop-form`
   - `close-stop-editor`
   - `close-route-editor`
   - `edit-stop-:ordinal`
   - `delete-stop-:ordinal`
   - `drag-stop-:ordinal`

### Step 3: UI Components (3-4 hours)
1. Add route editor modal to `index.html` (~300 lines)
2. Add CSS styling (~100 lines)
3. Add campaign integration:
   - Load route when campaign selected
   - Save route when campaign updated
   - Sync route list with location availability

### Step 4: Testing (2-3 hours)
1. Create `tests/milestone3-routes.test.cjs`:
   - CRUD operations (create, read, update, delete)
   - Validation tests (ordinal, km, location)
   - Reordering tests
   - Ownership and isolation
   - Integration with campaign lifecycle
   - ~18-20 test cases

2. Verify all tests pass:
   - Route creation
   - Stop editing
   - Reordering
   - Deletion with renumbering
   - Location deletion cascade
   - Campaign deletion cascade

---

## Fourth Edition Rule Integration

### Distance Calculation
- Use actual map coordinates (Lat/Lng) to calculate straight-line distance
- Display in km for GM reference
- Can be refined with terrain type later (Phase 3.3+)

### Travel Time (Future)
- Marching: Hexes per day based on terrain
- Driving: Hexes per day based on road quality
- Fuel consumption: Liters per 100km

**For Phase 3.2:** Store distances only; rules application deferred to Phase 3.4+

### Movement Hexes (Future)
- Twilight: 2000 uses hexgrid for miniatures
- 1 hex = varies by scale (typically 2-5 km)
- Phase 3.2: Only store km distances
- Phase 3.3+: Convert to hex movement when needed

---

## Exit Checks

**Phase 3.2 Complete When:**

- ✅ All five CRUD endpoints implemented
- ✅ Route CRUD functions in runtime-store.cjs
- ✅ Route API handler in campaigns.cjs
- ✅ route-client.js module created and exported
- ✅ Route editor modal added to index.html
- ✅ CSS styling added
- ✅ Campaign integration:
  - ✅ Route loads when campaign selected
  - ✅ Route saves with campaign updates
- ✅ Tests passing:
  - ✅ 18-20 route tests
  - ✅ All 191+ existing tests still passing
  - ✅ Zero regressions
- ✅ Route visible in GM dashboard
- ✅ Can create, edit, reorder, delete stops
- ✅ Route persists across campaign reload
- ✅ Documentation updated

---

## Files to Modify/Create

| File | Status | Lines | Notes |
|------|--------|-------|-------|
| server/runtime-store.cjs | Modify | +280 | Add route CRUD functions |
| server/campaigns.cjs | Modify | +150 | Add route API handler |
| route-client.js | Create | 350-400 | New client module |
| index.html | Modify | +300 | Route editor modal, CSS, integration |
| tests/milestone3-routes.test.cjs | Create | 400-450 | 18-20 test cases |
| PHASE3.2_IMPLEMENTATION_NOTES.md | Create | ~8KB | Technical decisions and notes |

---

## Dependency Tree

```
Phase 3.2 (Route Management)
  ├── Phase 3.1 (Location Management) ✅
  │   └── Locations API ✅
  └── Database (route_stops table) ✅

Phase 3.3 (Route Preview) → Depends on Phase 3.2
```

All dependencies satisfied. Ready to start Phase 3.2.
