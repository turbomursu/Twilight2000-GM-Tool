# Phase 3.4: Map Publication & Visualization — Implementation Plan

**Status:** 🟡 **Starting**  
**Date Started:** 02 Nov 2026  
**Target Completion:** 05 Nov 2026 (3-4 days)  
**Depends On:** Phase 3.3 (Route UI) ✅ Complete

---

## Overview

Phase 3.4 brings map visualization to life by rendering routes, locations, and GM-controlled elements on the campaign map. This phase focuses on publication controls allowing GMs to decide what players see.

**Key Deliverables:**
1. Map visualization client (route rendering, location markers)
2. Publication control panel in GM dashboard
3. Backend API for publication state
4. Route polyline on map with stop markers
5. Location markers on map with labels
6. Party position tracking (GM-set marker)
7. Player interface map view
8. Publication state persistence and audit trail

---

## Current State Analysis

### ✅ Already Exists (Phase 3.1-3.3)
- Route backend (CRUD, 5 endpoints)
- Route UI (route-client.js, modal editor)
- Location backend (CRUD, 5 endpoints)
- Location UI (location-client.js, modal editor)
- Map initialization (map-publication-client.js)
- PMTiles offline basemap support
- Campaign bounds validation
- Leaflet map library integration
- Database schema (maps, locations, route_stops)

### ❌ What Phase 3.4 Adds
- Route rendering (polyline + stop markers)
- Location markers on map
- Publication control UI
- Publication state storage & API
- Party position marker + tracking
- Player map view with published content only
- Real-time sync between GM and players
- Audit trail for publication changes

---

## Architecture

### Component Structure

```
┌─────────────────────────────────────────────────────┐
│                    GM Dashboard                      │
├─────────────────────────────────────────────────────┤
│  Publication Control Panel        │  Map View       │
│  ┌──────────────────────────────┐ │ ┌─────────────┐│
│  │ ☑ Route Published            │ │ │  Route      ││
│  │ ☑ Locations Published        │ │ │  (polyline) ││
│  │ ☑ Position Published         │ │ │             ││
│  │ ☑ Faction Layers Visible     │ │ │  Locations  ││
│  │                              │ │ │  (markers)  ││
│  │ [Publish]  [Withdraw]        │ │ │             ││
│  │                              │ │ │  Position   ││
│  │ Publication Status:           │ │ │  (circle)   ││
│  │ - Route: PUBLISHED (rev 42)   │ │ │             ││
│  │ - Locations: PUBLISHED        │ │ │  Basemap    ││
│  │ - Position: WITHDRAWN         │ │ └─────────────┘│
│  └──────────────────────────────┘ │                 │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              Player Interface Map                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ☑ Published Route     ☑ Our Position               │
│  ☑ Published Locations   (if visible)               │
│                                                      │
│  ┌────────────────────────────────────────┐        │
│  │                                        │        │
│  │  Route (polyline)                      │        │
│  │  Stops (numbered markers)              │        │
│  │  Locations (named circles)             │        │
│  │  Position (large circle)               │        │
│  │                                        │        │
│  │  [Zoom In]  [Zoom Out]  [Center]      │        │
│  └────────────────────────────────────────┘        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Data Flow

```
GM Creates/Updates Route/Location
        ↓
Backend updates map_publications table
        ↓
Campaign revision incremented
        ↓
Publication control UI updated
        ↓
GM toggles "Route published"
        ↓
Backend updates publication_state
        ↓
WebSocket broadcast (or polling)
        ↓
Player maps refresh immediately
        ↓
Players see only published content
```

---

## Implementation Plan (Step by Step)

### Step 1: Publication Control Panel (6-8 hours)

**File:** index.html + new CSS section

**Components:**

1. **Publication Control UI (new section in Movement dashboard)**
   ```html
   <section id="map-publication-panel">
     <h3>Map Publication</h3>
     
     <!-- Publication toggles -->
     <label>
       <input type="checkbox" id="publish-route" />
       Route visible to players
     </label>
     
     <label>
       <input type="checkbox" id="publish-locations" />
       Locations visible to players
     </label>
     
     <label>
       <input type="checkbox" id="publish-position" />
       Party position visible to players
     </label>
     
     <label>
       <input type="checkbox" id="publish-factions" />
       Faction layers visible to players
     </label>
     
     <!-- Action buttons -->
     <div class="publication-actions">
       <button id="publish-all">Publish All</button>
       <button id="withdraw-all">Withdraw All</button>
     </div>
     
     <!-- Publication status -->
     <div id="publication-status">
       <h4>Published Content</h4>
       <div id="route-publication-status" class="status-item">
         Route: WITHDRAWN (rev 0)
       </div>
       <div id="locations-publication-status" class="status-item">
         Locations: WITHDRAWN (rev 0)
       </div>
       <div id="position-publication-status" class="status-item">
         Position: WITHDRAWN (rev 0)
       </div>
       <div id="publication-timestamp" class="status-timestamp">
         Last published: Never
       </div>
     </div>
   </section>
   ```

2. **Publication Control API (map-publication-client.js)**
   ```javascript
   async function getPublicationState(campaignId)
     // GET /api/campaigns/:id/map-publication
     // Returns: {route: {published, revision}, locations: {...}, position: {...}, factions: {...}, lastPublished, history: [...]}
   
   async function updatePublicationState(campaignId, state)
     // PUT /api/campaigns/:id/map-publication
     // state = {route: bool, locations: bool, position: bool, factions: bool}
   
   async function getPublicationHistory(campaignId, limit = 50)
     // GET /api/campaigns/:id/map-publication/history
     // Returns paginated history
   ```

3. **Event Handlers**
   - Checkboxes trigger updatePublicationState()
   - Publish/Withdraw buttons bulk update
   - Status UI updates after each change
   - Auto-refresh every 30 seconds or on change

### Step 2: Map Visualization (8-10 hours)

**File:** map-visualization-client.js (new, 400-500 lines)

**Features:**

1. **Route Rendering**
   ```javascript
   function renderRoute(map, stops) {
     // Draw polyline connecting all stops
     const latlngs = stops.map(stop => [stop.position.lat, stop.position.lng]);
     const polyline = L.polyline(latlngs, {
       color: '#344a40',
       weight: 3,
       opacity: 0.8,
       dashArray: '5, 5'  // dashed line
     }).addTo(map);
     
     // Draw stop markers (numbered)
     stops.forEach((stop, index) => {
       const marker = L.circleMarker([stop.position.lat, stop.position.lng], {
         radius: 20,
         fillColor: '#edf3eb',
         color: '#344a40',
         weight: 2,
         opacity: 1,
         fillOpacity: 0.9
       });
       
       marker.bindPopup(`
         <strong>#${index}: ${stop.name}</strong><br/>
         ${stop.detail}<br/>
         ${stop.kmFromPrevious.toFixed(1)} km from previous
       `);
       
       marker.addTo(map);
     });
   }
   ```

2. **Location Rendering**
   ```javascript
   function renderLocations(map, locations) {
     locations.forEach(location => {
       const marker = L.circleMarker(
         [location.position.lat, location.position.lng],
         {
           radius: 10,
           fillColor: '#487c87',
           color: '#2a5964',
           weight: 2,
           opacity: 1,
           fillOpacity: 0.8
         }
       );
       
       marker.bindPopup(`
         <strong>${location.name}</strong><br/>
         ${location.kind}<br/>
         ${location.gridReference}
       `);
       
       marker.addTo(map);
     });
   }
   ```

3. **Position Marker (GM-draggable)**
   ```javascript
   function createPositionMarker(map, position, onUpdate) {
     const marker = L.marker([position.lat, position.lng], {
       draggable: true,
       icon: L.icon({
         iconUrl: 'position-icon.svg',  // custom marker
         iconSize: [30, 30],
         iconAnchor: [15, 15]
       })
     });
     
     marker.on('dragend', (event) => {
       const newPos = event.target.getLatLng();
       onUpdate({lat: newPos.lat, lng: newPos.lng});
     });
     
     marker.addTo(map);
     return marker;
   }
   ```

4. **GM Map View**
   - Render route (published + unpublished in different styles)
   - Render locations (color-coded by visibility)
   - Render position marker (draggable)
   - Show publication state (badge on each item)
   - Layer control for toggling visibility
   - Export map as image

5. **Player Map View**
   - Render only published content
   - Hide publication status badges
   - Read-only (no dragging)
   - Simpler legend
   - Center on position button

### Step 3: Backend API (8-10 hours)

**File:** server/campaigns.cjs (new endpoints)

**Endpoints:**

1. **GET /api/campaigns/:id/map-publication**
   - Returns current publication state
   - Format:
     ```javascript
     {
       route: {published: true, revision: 42, timestamp: "2026-11-02T..."},
       locations: {published: false, revision: 0, timestamp: null},
       position: {published: true, revision: 38, timestamp: "2026-11-02T..."},
       factions: {published: false, revision: 0, timestamp: null},
       lastModifiedBy: "gm-user-id",
       lastModifiedAt: "2026-11-02T..."
     }
     ```

2. **PUT /api/campaigns/:id/map-publication**
   - Update publication state
   - Request body:
     ```javascript
     {
       route: true,
       locations: false,
       position: true,
       factions: false,
       expectedRevision: 42  // for conflict detection
     }
     ```
   - Response: Updated state + campaign revision
   - Errors: 404 (not found), 409 (revision conflict), 422 (invalid)

3. **GET /api/campaigns/:id/map-publication/history**
   - Paginated history of publication changes
   - Query params: ?limit=50&offset=0
   - Returns: Array of {who, when, changes, revision}

4. **PUT /api/campaigns/:id/party-position**
   - Update GM-controlled party position
   - Request body: {lat: number, lng: number, expectedRevision: number}
   - Response: {lat, lng, revision, publishedAt}
   - Errors: 422 (out of bounds), 409 (revision conflict)

5. **GET /api/campaigns/:id/party-position**
   - Get current party position
   - Returns: {lat, lng, revision, published: bool, timestamp}

**Database Schema:**

```sql
-- New table: map_publication_state
CREATE TABLE map_publication_state (
  campaign_id TEXT NOT NULL PRIMARY KEY,
  route_published BOOLEAN DEFAULT 0,
  route_revision INTEGER DEFAULT 0,
  locations_published BOOLEAN DEFAULT 0,
  locations_revision INTEGER DEFAULT 0,
  position_published BOOLEAN DEFAULT 0,
  position_revision INTEGER DEFAULT 0,
  factions_published BOOLEAN DEFAULT 0,
  factions_revision INTEGER DEFAULT 0,
  last_modified_by TEXT,
  last_modified_at DATETIME,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- New table: party_position
CREATE TABLE party_position (
  campaign_id TEXT NOT NULL PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  revision INTEGER NOT NULL,
  published BOOLEAN DEFAULT 0,
  published_at DATETIME,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- New table: publication_history (audit trail)
CREATE TABLE publication_history (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'publish', 'withdraw', 'update'
  target TEXT NOT NULL,  -- 'route', 'locations', 'position', 'factions'
  old_value BOOLEAN,
  new_value BOOLEAN,
  campaign_revision INTEGER,
  recorded_at DATETIME,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (actor) REFERENCES users(id)
);
```

**Backend Functions:**

```javascript
// server/runtime-store.cjs
function getMapPublicationState(campaignId)
function updateMapPublicationState(campaignId, state, userId)
function getPublicationHistory(campaignId, limit, offset)
function getPartyPosition(campaignId)
function updatePartyPosition(campaignId, lat, lng, expectedRevision)
function recordPublicationChange(campaignId, actor, action, target, oldVal, newVal, revision)
```

### Step 4: Client-Side Integration (6-8 hours)

**Files:** index.html, map-publication-client.js modifications

**Integration Points:**

1. **Campaign Selection**
   - Load publication state when campaign selected
   - Load map visualization with current data
   - Render publication controls

2. **Movement Dashboard**
   - Add Publication Control section
   - Add Publication Status display
   - Wire up checkboxes to API

3. **Map View**
   - Integrate map visualization
   - Show route + locations + position
   - Respond to publication state changes

4. **Real-Time Updates**
   - Poll for publication state changes (30s interval)
   - Refresh map visualization on change
   - Show "syncing..." indicator

5. **Player Interface**
   - Pass publication state to player map
   - Render only published elements
   - Hide GM-only data

### Step 5: Testing & Documentation (4-6 hours)

**Test Suite:**
- Publication state CRUD
- Conflict detection (revision mismatch)
- Campaign isolation
- Audit trail tracking
- Player visibility enforcement
- Map rendering (visual testing)
- Real-time sync (latency testing)

**Documentation:**
- PHASE3.4_STARTING_GUIDE.md
- PHASE3.4_IMPLEMENTATION_NOTES.md
- API reference
- Player vs. GM view differences

---

## Exit Checks

✅ **Phase 3.4 Complete When:**

- [ ] Publication control panel visible in GM dashboard
- [ ] Can toggle route published/withdrawn
- [ ] Can toggle locations published/withdrawn
- [ ] Can toggle position published/withdrawn
- [ ] Can toggle faction layers published/withdrawn
- [ ] Publication status updates in real-time
- [ ] Publication history displays audit trail
- [ ] Route renders as polyline on GM map
- [ ] Route stops show as numbered markers
- [ ] Locations render as colored circles
- [ ] Party position shows as draggable marker (GM)
- [ ] Party position shows as static marker (Player)
- [ ] Player map shows only published content
- [ ] GM notes never appear in player view
- [ ] Position updates appear <500ms
- [ ] Concurrent updates handled correctly
- [ ] Publication state persists after reload
- [ ] Campaign revision increments on publication
- [ ] All new tests passing
- [ ] Zero regressions from Phase 3.1-3.3
- [ ] Documentation complete

---

## Estimated Effort

| Task | Hours | Status |
|------|-------|--------|
| Publication Control UI | 7 | 🟡 Starting |
| Map Visualization | 9 | 🟡 Starting |
| Backend API | 9 | 🟡 Starting |
| Client Integration | 7 | 🟡 Starting |
| Testing & Docs | 5 | 🟡 Starting |
| **Total** | **37 hours** | **🟡 Starting** |

**Timeline:** 3-4 working days

---

## Dependencies

✅ Phase 3.1: Location Management  
✅ Phase 3.2: Route Backend  
✅ Phase 3.3: Route UI  
✅ Phase 3.4: Map Publication & Visualization

**Blocked By:** None  
**Can Proceed Immediately:** Yes ✅

---

## Next Phase (3.5 - Optional)

**Party Position Tracking** (if time permits)
- Full real-time position sync with WebSocket
- Position-based LOS and visibility
- Encounter auto-placement on route
- Travel time calculations

---

## Success Metrics

- ✅ Route visible on map as polyline with stops
- ✅ Locations visible as markers with labels
- ✅ GM can see all content, control publication
- ✅ Players see only published content
- ✅ Position updates in <500ms
- ✅ Publication state audited and recoverable
- ✅ Zero data leakage to players
- ✅ Map zoom/pan smooth for 1-4 concurrent users
- ✅ All tests passing (233+ total)
- ✅ Production-ready code

---

## References

- PHASE3.3_IMPLEMENTATION_COMPLETE.md (route UI, working)
- PHASE3.2_COMPLETION_SUMMARY.md (route backend, working)
- PHASE3.1_COMPLETION_SUMMARY.md (location backend, working)
- map-publication-client.js (existing map rendering)
- MILESTONE3_IMPLEMENTATION_PLAN.md (full Milestone 3 scope)
- server/runtime-store.cjs (database layer)
- server/campaigns.cjs (HTTP API)
