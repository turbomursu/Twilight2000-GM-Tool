# Milestone 3: Shared Awareness — Map & Location System
## Implementation Plan

**Status:** 🟡 **In Progress**  
**Created:** 02 Nov 2026  
**Target:** Complete map/location/route system with publication controls

---

## Current State Analysis

### ✅ Already Implemented
- Route editor dialog (`route-editor-dialog`)
- Map editor dialog (`map-editor-dialog`)
- Database tables: `maps`, `locations`, `route_stops`
- Map publication functions in `map-publications.cjs`
- Offline basemap support (PMTiles)
- Map publication client in `map-publication-client.js`
- Leaflet integration for map rendering
- Campaign bounds validation

### ❌ Not Yet Implemented (Milestone 3 scope)
- [ ] **Location/Waypoint Management UI**
  - Create new location/waypoint
  - Edit location details (name, coords, type, notes)
  - Delete locations
  - List locations with filtering

- [ ] **Route Management UI**
  - Create route from locations
  - Edit route stops (reorder, distance, terrain)
  - Save route with persistence
  - Route preview on map

- [ ] **Map Publication Controls**
  - Toggle route visibility in publication
  - Toggle location visibility
  - Toggle faction layers
  - Publish/withdraw workflow
  - GM-only vs. player-visible settings

- [ ] **Party Position Tracking**
  - GM-set current position on map
  - Publish position to all players
  - Position indicator in player map view
  - Update frequency optimization (<500ms)

- [ ] **Map Marker Types & Display**
  - Friendly bases/strongpoints
  - Hostile positions
  - Objectives
  - Supply caches
  - Hazards/dangers
  - Visual differentiation (colors, icons, labels)

- [ ] **Player Map View Client**
  - Read-only map for players
  - Display published route/locations
  - Show party position if published
  - Zoom/pan controls (capped at 200%)
  - Center on party position button
  - Hide player-invisible content

- [ ] **Map Synchronization**
  - Broadcast position updates to all connected players
  - GM and player map views stay synchronized
  - Handle concurrent edits with campaign revision
  - Atomic map state changes

---

## Implementation Phases

### **Phase 3.1: Location Management** (Days 1-2)
*Establish location/waypoint system foundation*

**Deliverables:**
1. Location editor modal (create/edit/delete)
   - Name, type, coordinates
   - GM notes (hidden from players)
   - Player-visible description (optional)
   - Bounds validation

2. Location list in GM dashboard
   - List all locations for current campaign
   - Filter by type
   - Sort by name/distance
   - Quick edit/delete buttons

3. Database API for location CRUD
   - POST /api/campaigns/:id/locations (create)
   - GET /api/campaigns/:id/locations (list)
   - PUT /api/campaigns/:id/locations/:locationId (update)
   - DELETE /api/campaigns/:id/locations/:locationId (delete)

4. Tests
   - Location creation with validation
   - Bounds checking
   - Ownership enforcement
   - CRUD operations

**Exit Checks:**
- [ ] Can create location with name, coords, type
- [ ] Can edit location details
- [ ] Can delete location
- [ ] Locations persist to database
- [ ] Bounds validation prevents out-of-bounds coordinates
- [ ] GM ownership enforced
- [ ] All CRUD tests passing

---

### **Phase 3.2: Route Management** (Days 2-4)
*Build route editor connecting locations*

**Deliverables:**
1. Route management in GM dashboard
   - Currently integrated but needs refinement
   - Show route segments with distances
   - Reorder stops via drag/up-down buttons
   - Delete stops with confirmation

2. Route preview on map
   - Draw polyline connecting route stops
   - Show stop markers
   - Display distance between stops
   - Highlight current position

3. Terrain/distance calculation
   - Select terrain type for each segment
   - Calculate marching distance (hexes)
   - Calculate driving distance (hexes)
   - Calculate fuel consumption

4. Route persistence API
   - PUT /api/campaigns/:id/route (update entire route)
   - Handle route ordering
   - Update active stop index
   - Validate route completeness

5. Tests
   - Route creation from locations
   - Route reordering
   - Distance calculations
   - Persistence and recovery

**Exit Checks:**
- [ ] Route displays all stops with distances
- [ ] Can reorder stops
- [ ] Can add/remove stops
- [ ] Terrain selection available
- [ ] Distance calculations correct
- [ ] Route persists across campaign reload
- [ ] All route tests passing

---

### **Phase 3.3: Map Publication Controls** (Days 4-5)
*Implement GM publication workflow*

**Deliverables:**
1. Publication control panel (GM only)
   - Toggle "Route published" checkbox
   - Toggle "Locations published" checkbox
   - Toggle faction layer visibility
   - Toggle individual marker visibility
   - Publish/withdraw buttons
   - Current publication status display

2. Publication state storage
   - Map publication record in database
   - Track what is currently published
   - Track publication history
   - Audit trail for publication changes

3. GM map view enhancements
   - Show published vs. hidden content differently
   - Preview what players will see
   - Toggle preview mode
   - Conflict resolution for concurrent GM/player edits

4. API endpoints
   - PUT /api/campaigns/:id/map-publication (update publication state)
   - GET /api/campaigns/:id/map-publication (current publication)
   - Revision-based conflict detection

5. Tests
   - Publication state persistence
   - GM-only data excluded from player publication
   - Revision conflict handling
   - Publication history audit

**Exit Checks:**
- [ ] Publication controls visible in GM map panel
- [ ] Can publish/withdraw route
- [ ] Can publish/withdraw locations
- [ ] Can toggle marker visibility
- [ ] Publication state persists
- [ ] Players see only published content
- [ ] GM notes never published
- [ ] All publication tests passing

---

### **Phase 3.4: Party Position Tracking** (Days 5-6)
*Implement GM-controlled position on map*

**Deliverables:**
1. Position indicator in GM map
   - Draggable marker showing party position
   - Snap-to-location or free placement
   - Coordinates display
   - "Home" button to center on position

2. Position storage & update API
   - Store party position in campaign runtime state
   - GET /api/campaigns/:id/party-position
   - PUT /api/campaigns/:id/party-position (with revision)
   - Audit trail for position changes

3. Position publishing
   - Toggle "Position published" in publication controls
   - Include position in player map publication
   - Update frequency optimization

4. Player map view
   - Display party position as distinct marker
   - Show position if published
   - Hide position if not published
   - Follow position button (auto-center)

5. Real-time synchronization
   - WebSocket or polling for position updates
   - <500ms update latency target
   - Handle concurrent position updates
   - Atomic updates with campaign revision

6. Tests
   - Position update with validation
   - Publication state respected
   - Concurrent update handling
   - Player view isolation

**Exit Checks:**
- [ ] Can drag position marker in GM map
- [ ] Position updates appear on players' maps (<500ms)
- [ ] Players see position only if published
- [ ] Concurrent updates handled correctly
- [ ] Audit trail tracks position changes
- [ ] All position tests passing

---

### **Phase 3.5: Marker Types & Styling** (Days 6-7)
*Implement visual differentiation of map content*

**Deliverables:**
1. Marker type system
   - Friendly (green)
   - Hostile (red)
   - Objective (blue)
   - Supply/Cache (yellow)
   - Hazard (purple)
   - Neutral (gray)

2. Marker creation & editing
   - Add markers to map (click to place, drag to move)
   - Edit marker type, label, notes
   - Delete markers
   - Bulk operations (select multiple, change type)

3. Marker storage
   - Database table: map_markers
   - Marker: id, campaign_id, position, type, label, notes, published, created_at, updated_at
   - Index by campaign_id

4. Marker publication
   - Toggle marker visibility per type
   - GM notes not published
   - Player-visible labels only

5. Visual styling
   - Color-coded markers by type
   - Icons/symbols for differentiation
   - Hover tooltips
   - Label positioning to avoid overlap

6. API endpoints
   - POST /api/campaigns/:id/markers (create)
   - PUT /api/campaigns/:id/markers/:markerId (update)
   - DELETE /api/campaigns/:id/markers/:markerId (delete)
   - GET /api/campaigns/:id/markers (list with publication filtering)

7. Tests
   - Marker CRUD operations
   - Publication filtering
   - Bounds validation
   - Concurrent updates

**Exit Checks:**
- [ ] Can place markers on map
- [ ] Can select marker type
- [ ] Markers display with correct colors/icons
- [ ] Markers persist to database
- [ ] GM notes hidden from players
- [ ] Can toggle marker visibility
- [ ] All marker tests passing

---

### **Phase 3.6: Player Map View** (Days 7-8)
*Build read-only player interface for map*

**Deliverables:**
1. Player handset map view
   - Display published route
   - Display published locations
   - Display published markers
   - Display party position (if published)
   - Hide all GM-only content

2. Player map controls
   - Zoom: 1x to 2x (200% max per spec)
   - Pan: drag map
   - Reset: center on party position
   - Toggle layers (show/hide route, locations, markers)

3. Player map data fetching
   - GET /api/player/campaigns/:id/map-publication
   - Filtered to show only published content
   - No GM notes, no unpublished markers
   - Includes party position if published

4. Real-time updates in player view
   - Polling every 5 seconds or WebSocket
   - Position updates <500ms
   - Route/location changes reflected
   - Handles publication changes (content appears/disappears)

5. Tests
   - Player sees only published content
   - GM notes never visible
   - Zoom/pan functionality
   - Real-time update handling
   - Player isolation (cannot access other player's maps)

**Exit Checks:**
- [ ] Player map view displays published route
- [ ] Player map shows published locations
- [ ] Player sees published party position
- [ ] Player cannot see GM notes
- [ ] Zoom works (1x-2x)
- [ ] Pan/reset controls work
- [ ] Updates appear <500ms
- [ ] All player view tests passing

---

### **Phase 3.7: Synchronization & Conflict Resolution** (Days 8-9)
*Ensure consistent state across GM and players*

**Deliverables:**
1. Campaign revision tracking for map
   - Map publication has revision counter
   - Concurrent edit detection
   - Atomic updates with optimistic locking

2. Conflict resolution
   - Stale edit detection (map revision mismatch)
   - Reload current state on conflict
   - Preserve GM's unsaved draft
   - Notify GM of conflict

3. WebSocket optimization (optional for <500ms target)
   - Event-driven updates instead of polling
   - Broadcast map changes to all connected clients
   - Fallback to polling if WebSocket unavailable

4. Performance optimization
   - Lazy-load map assets
   - Only fetch visible region geometry
   - Batch marker/location updates
   - Compress publish payloads

5. Tests
   - Concurrent GM edits (both save same version)
   - Concurrent GM/player (both see consistent state)
   - Conflict resolution workflow
   - Update latency measurement
   - Fallback behavior

**Exit Checks:**
- [ ] Concurrent edits handled correctly
- [ ] Position updates <500ms latency
- [ ] Route/location updates <1s
- [ ] GM/player views stay synchronized
- [ ] All sync tests passing

---

### **Phase 3.8: Integration & Polish** (Days 9-10)
*Connect to existing systems and final testing*

**Deliverables:**
1. Integration with existing features
   - Personnel assignment to locations
   - Faction layer association with locations
   - Settlement linking to locations
   - Encounter placement on map

2. Player Interface integration
   - Handset map view in navigation
   - SITREP includes map publication status
   - Character sheet can show position context

3. GM Dashboard integration
   - Map panel shows publication status
   - Route panel shows current segment
   - Location list in main view
   - Marker overview

4. Documentation
   - Map publication workflow guide
   - Player map view instructions
   - API reference
   - Troubleshooting guide

5. End-to-end testing
   - Full campaign workflow: import setup → create locations → plan route → publish → players view
   - Multi-player synchronization test
   - Concurrent edit conflict test
   - Performance benchmarking

**Exit Checks:**
- [ ] Can complete full map workflow end-to-end
- [ ] All features integrated without conflicts
- [ ] All 136 existing tests still passing
- [ ] +40 new Milestone 3 tests passing
- [ ] Performance benchmarks met (<500ms position, <1s locations)
- [ ] Documentation complete

---

## Development Order & Dependencies

```
Phase 3.1 (Locations)
    ↓
Phase 3.2 (Routes) — can run parallel to 3.1 after day 1
    ↓
Phase 3.3 (Publication Controls) — depends on 3.1, 3.2
    ↓
Phase 3.4 (Party Position) — depends on 3.3
    ↓
Phase 3.5 (Markers) — can run parallel to 3.4
    ↓
Phase 3.6 (Player View) — depends on 3.3, 3.4, 3.5
    ↓
Phase 3.7 (Synchronization) — depends on 3.6
    ↓
Phase 3.8 (Integration & Polish) — final phase
```

**Estimated Duration:** 10 days (with some parallelization: ~8 calendar days)

---

## Exit Checks for Milestone 3 Completion

### Functional Requirements
- [ ] GM can create/edit/delete locations with coordinates and types
- [ ] GM can create route by selecting locations in order
- [ ] GM can adjust route distances and terrain
- [ ] GM can publish route/locations/markers to players
- [ ] GM can toggle what content is published
- [ ] GM can set party position on map
- [ ] GM can place and manage map markers (friendly, hostile, objective, supply, hazard)
- [ ] Players can view published map content
- [ ] Players see party position only if GM publishes it
- [ ] Players cannot see GM-only notes or unpublished markers

### Performance Requirements
- [ ] Party position updates visible in player map within 500ms
- [ ] Route/location changes visible to players within 1 second
- [ ] Map renders smoothly for 1-4 concurrent players
- [ ] Zoom and pan responsive (no lag)

### Data Integrity Requirements
- [ ] Campaign bounds enforced (no coordinates outside bounds)
- [ ] Map publication state consistent across GM and players
- [ ] Concurrent edits handled with conflict resolution
- [ ] Audit trail tracks all map changes
- [ ] Campaign revision incremented on publication changes
- [ ] Backups preserve map state atomically

### Integration Requirements
- [ ] Map features accessible from GM dashboard
- [ ] Player map view accessible from handset
- [ ] No conflicts with existing combat/weather/journal systems
- [ ] Audit trail covers location/route/marker/publication changes
- [ ] Player seat isolation maintained (players see only own character + published data)

### Test Coverage
- [ ] 40+ new tests for Milestone 3 features
- [ ] All 136 existing tests still passing
- [ ] End-to-end workflow tests
- [ ] Player isolation tests
- [ ] Concurrent edit tests
- [ ] Performance benchmarks documented

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| <500ms position update latency hard to achieve | Start with polling (5s), optimize to WebSocket if needed; document actual latency |
| Map rendering performance with many markers | Implement viewport-based lazy loading; cluster markers at low zoom |
| Concurrent edit conflicts complex | Use campaign revision counter; test extensively with multiple GMs |
| Player map view incompatible with existing design | Design player map early (Phase 3.6); validate with existing player interface |
| Bounds validation conflicts with existing setup | Review setup package bounds; ensure consistent enforcement |

---

## Next Steps

1. **Today (02 Nov):**
   - [ ] Review current code for locations/routes/maps
   - [ ] Identify any missing database migrations
   - [ ] Plan API endpoints
   - [ ] Create location-client.js module skeleton

2. **Tomorrow (03 Nov):**
   - [ ] Start Phase 3.1 (Location Management)
   - [ ] Implement location CRUD endpoints
   - [ ] Build location editor modal
   - [ ] Add location list UI

3. **Following:**
   - [ ] Phase 3.2 (Route Management)
   - [ ] Phase 3.3 (Publication Controls)
   - [ ] Phase 3.4 (Party Position)
   - [ ] Phase 3.5-3.8 (Markers, Player View, Sync, Integration)

---

**Document Status:** Ready for implementation  
**Next Review:** After Phase 3.1 completion
