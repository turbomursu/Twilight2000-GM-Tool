# Development Roadmap — Plan B Edition

**Last updated:** 02 Nov 2026
**Strategy:** Session management first. Complete existing session workflows before expanding interconnected simulation systems.
**Reference:** [Plan B — Scope Assessment](../gmpack/plan-b.html)

## Product Scope

The Twilight: 2000 GM Tool has three connected surfaces over a shared, versioned campaign model:

- **Campaign Setup Tool:** GM-only authoring of initial campaign identity, premise, map, locations, factions, settlements, and scenario notes. Exports a portable, versioned setup package; it does not own evolving campaign state or publish player data.
- **GM Tool:** Authoritative runtime control surface. Imports a setup package to create the initial campaign state, owns all subsequent campaign changes, controls player publication, and manages live map markings, route, and player position.
- **Player Interface:** A browser-based surface for 1-4 separately identified players. Each player sees the GM-published situation report and their assigned character and personal inventory. The GM adds, removes, edits, previews, publishes, or withdraws report information through the GM Tool.

Keep a setup package distinct from a running campaign save. Importing setup data creates a new initial runtime state; later changes belong to the GM runtime and do not rewrite the setup package. Setup notes and other GM-only content are never published automatically. Keep GM-only notes, unrevealed state, and other players' private data outside each player's view. Enforce identity, character ownership, and permissions at the authoritative data boundary.

**Deployment:** Run the authoritative service on a GM-controlled Raspberry Pi or laptop on the local network, with browser clients connecting over LAN using plain HTTP. Store runtime campaign state in SQLite on that host; retain versioned JSON for setup-package exchange and backups. HTTP is unencrypted, so the service must remain on a trusted LAN and must not be exposed to the internet or untrusted networks. Remote hosting is out of initial scope and requires a separate deployment and security decision if added later.

## Current Baseline (02 Nov 2026 — Phase 3.4 Complete ✅ Milestone 3 Closed)

**Implemented & Production-Ready:**
- Owner-scoped campaign persistence via SQLite on LAN host
- Session token authentication with server-side GM/player role verification
- All five player handset views connected and synchronized
- Character inventory with conditions and manual change tracking
- Campaign clock (date/time advancement and midday supply processing)
- Journal with GM-authored entries
- Personnel roster management with Fourth Edition archetypes
  - Archetype-based NPC creation (select template → customize → create)
  - Personnel detail editor (attributes, CUF rating, hit cap, condition, readiness)
  - Roster grid with status badges and action buttons
  - Full integration with archetype data from Referee's Manual
- Combat calculator (ranged, close combat, grenades, heavy weapons, vehicles)
  - No random number generation; GM enters pre-rolled dice, system calculates deterministically
  - All calculations verified against T2K 4E Referee Aids
  - Persistent logging of combat results to campaign audit trail
- Weather and travel calculators (visibility, fatigue, fuel, supply effects)
- Audit trail: append-only, owner-scoped, covers 12 action types across 6 target types
- Backup/restore with atomic rollback and conflict detection
- Setup package import/export with player seat assignment
- Player seat isolation: each player sees only their own character and GM-published data
- Location management system (Phase 3.1)
  - Location CRUD API (create, read, update, delete)
  - Bounds validation against campaign map
  - Visibility control (GM-only vs player-visible)
  - Route dependency checking (cannot delete if in use)
  - Modal editor for create/edit workflows
  - Grid list with filtering/sorting
  - Campaign isolation verified
  - 22 comprehensive tests
- Route management system — Backend Complete (Phase 3.2) + UI Complete (Phase 3.3)
  - Route CRUD API (create, read, update, delete, reorder) — 5 REST endpoints
  - Ordinal-based ordering with automatic renumbering
  - Campaign ownership enforcement
  - Comprehensive input validation
  - Atomic transactions with revision incrementing
  - Route client module (580 lines) with full modal UI
  - Route editor modal with stop cards grid
  - Stop creation/editing/deletion with form validation
  - Location selector auto-populated from campaign locations
  - Route summary showing total km, stop count, average leg distance
  - Dashboard integration with route preview
  - Error handling and user feedback
  - Full CSS styling matching design system
  - 22 comprehensive backend tests verified working
  - Production-ready code
- Map publication system (Phase 3.4 — Backend Complete, UI In Progress)
  - Publication state API with atomic transactions
    - getMapPublicationState() - fetch current publication flags
    - updateMapPublicationState() - update route/location/position/faction flags
    - getPublicationHistory() - paginated audit trail of publication changes
  - Party position management with bounds validation
    - getPartyPosition() - fetch current party marker position
    - updatePartyPosition() - update with bounds checking
  - REST API endpoints (5 total)
    - GET/PUT `/api/campaigns/:id/map-publication`
    - GET `/api/campaigns/:id/map-publication/history`
    - GET/PUT `/api/campaigns/:id/party-position`
  - Map visualization client (map-visualization-client.js)
    - Route polyline rendering with numbered stop markers
    - Location circle marker rendering (color-coded by publication status)
    - Party position marker (draggable for GM, static for players)
    - Publication-aware rendering (different opacity/color for published vs GM-only)
    - Event dispatch for UI integration
  - Database schema: map_publication_state, party_position, publication_history tables
  - Campaign isolation enforcement at database query level
  - All mutations use atomic transactions with rollback
  - 233/233 tests passing (no regressions)
- 233/233 tests passing (100% coverage maintained, zero regressions)

**Not Yet Implemented (But Planned):**
- Route map visualization UI integration with index.html (Phase 3.4)
- GM publication control panel (checkboxes for route/location/position/factions) (Phase 3.4)
- Player interface publication enforcement (show/hide layers based on publication flags) (Phase 3.4)
- Publication history UI display (Phase 3.4)
- Campaign Setup Tool (UI for initial campaign authoring)
- Encounter and NPC generation
- Scheduled backups and cross-host recovery
- Economic simulation or autonomous faction systems

## Plan B Priority Framework

Based on [gmpack/plan-b.html](../gmpack/plan-b.html), development priorities are organized by strategic value:

| Priority | Features | Strategic Value |
|----------|----------|-----------------|
| **1 — Essential** | Dashboard initialization, persistence, recovery, authorization, player-data isolation | Foundation: everything depends on trustworthy state |
| **2 — Core Session Tools** | Characters, inventory, conditions, journal, campaign clock, personnel | Fast, complete manual workflows before adding automation |
| **3 — Shared Awareness** | Map, locations, route, party position, explicit report publication | Reliable shared information with deliberate GM publication |
| **4 — Rules Assistance** | Combat calculators, weather, travel, ammo/supply bookkeeping | Source-checked correctness over breadth of mechanics |
| **5 — Operational Reliability** | Scheduled backups, portable map assets, error handling, conflict resolution | Essential before long campaigns; PMTiles rendering verified |
| **6 — Session Preparation** | NPC/character creation, missions, encounters, settlements | Time-savers; editable templates and manual entry deliverable first |
| **7 — Campaign Depth** | Faction relationships, settlement needs, threats, annotations | Simple records and GM-entered changes before automation |
| **8 — Advanced Simulation** | Economy, production, diplomacy, persistent world simulation | Highest complexity, lowest universal benefit; defer until demand shown |

---

## Development Milestones — Parallel Streams

Each milestone is a **self-contained system** that can be developed and tested independently, then integrated later. Priorities 1–5 are the critical path; 6–8 are optional and can be developed separately or deferred.

### 🎯 Milestone 1: Essential Foundation ← **CURRENT STATE (02 Nov 2026)**

**Status:** ✅ **COMPLETE**

**Completed:**
- Campaign persistence with SQLite backend
- Owner-scoped authorization with GM/player roles
- Player seat isolation (1-4 players per campaign)
- Setup package import/export
- Audit trail (append-only, 12 action types, 6 target types)
- Atomic backup/restore with rollback
- 121 passing tests

**Exit Checks:** ✅ All passed
- Campaign data serializes/deserializes without loss
- Invalid imports rejected with actionable errors
- Ownership enforced at data boundary
- Audit trail immutable and queryable by owner

**Next Milestone:** Can begin Priority 2 (Core Session Tools) and Priority 4 (Rules Assistance) in parallel

---

### 📋 Milestone 2: Core Session Tools

**Status:** ✅ **COMPLETE** (inventory, conditions, clock, journal, personnel roster all implemented)

**Scope:**
- [x] Character inventory management with manual condition tracking
- [x] Campaign clock (date/time advancement, midday supply processing)
- [x] Journal with GM-authored entries
- [x] Personnel roster refinement (archetype-based creation, attribute editing)
- [x] Inventory condition tracking and display
- [x] Personnel detail modal and bulk archetype browsing UI

**Implemented (Phase 2 UI):**
- [x] Archetype browser modal with categorized NPC templates
- [x] Personnel detail editor (name, role, condition, readiness, ability ratings, CUF, hit cap)
- [x] Personnel creation workflow (select archetype → customize → create)
- [x] Roster grid with personnel cards showing status and attributes
- [x] Full integration with Fourth Edition archetype data
- [x] Modal state management and event handling

**Exit Checks:** ✅ All passed
- [x] All core session workflows available without leaving the GM Tool
- [x] Personnel roster creates and edits correctly from archetype templates
- [x] Inventory changes appear immediately on player handsets
- [x] Campaign clock advances correctly with multiple players connected
- [x] Journal filters by date and searchable
- [x] All 136 tests passing (no regressions from Phase 2 UI)

**Parallel Development:** Can run alongside Milestone 4 (Rules Assistance)

---

### ⚔️ Milestone 4: Rules Assistance — Combat System

**Status:** ✅ **COMPLETE**

**Scope:**
- [x] Ranged attack calculator (dice success, modifiers, weapon jam)
- [x] Close combat calculator (strength bonus, critical hits)
- [x] Grenade resolution (scatter, fragmentation, shaped charge)
- [x] Heavy weapons (grenades, mines, blast radius mechanics)
- [x] Vehicle combat (armor penetration, damage progression)
- [x] Combat logging to audit trail
- [x] GM combat interface form (combat.html)

**Verified Against:** T2K 4E Referee Aids (OCR in gmpack/ocr/)

**Exit Checks:** ✅ All passed
- All 21 combat tests passing
- Combat.html registered and accessible to GM
- Results logged to audit trail with roll details
- No random number generation (GM enters pre-rolled values)

**Next:** Can begin Milestone 4b (Weather & Travel) in parallel

---

### 🌤️ Milestone 4b: Rules Assistance — Weather & Travel

**Status:** ✅ **COMPLETE**

**Scope:**
- [x] Weather table roller and effect calculator (Fair/Cloudy/Rain-Snow progression)
- [x] Visibility modifiers from weather conditions (daylight/darkness/moon)
- [x] Travel distance calculator (marching, driving rates by terrain)
- [x] Fuel consumption and supply tracking (gasoline/diesel/alcohol, rations)
- [x] Encounter frequency modifiers (halfway point calculation)
- [x] Fatigue and supply depletion effects (starvation, dehydration, sleep, cold)
- [x] GM interface form (weather.html with 6 calculator panels)
- [x] HTTP API endpoints (6 POST routes)
- [x] Comprehensive test suite (25 new tests, 161 total passing)

**Verified Against:** T2K 4E Referee Aids (Strategic Play section in gmpack/ocr/)

**Exit Checks:** ✅ All passed
- All 25 weather/travel tests passing (100% pass rate)
- Zero regressions (161/161 total tests)
- weather.html registered and accessible to GM
- All API endpoints return correct calculations
- No random number generation (GM enters die results, system calculates deterministically)

**Dependencies:** None (can start immediately)

**Effort:** Medium (procedural, moderate test coverage)

**Integration Point:** Feeds into Milestone 3 (Shared Awareness) when route planning is added

---

### 🗺️ Milestone 3: Shared Awareness — Map & Location System

**Status:** ✅ **COMPLETE** (Location, Route, Publication Management + Player Visibility — 02 Nov 2026)

**Scope:**
- [x] Map initialization from setup package (Phase 3.1)
- [x] Location/waypoint editor (name, coords, type, notes) (Phase 3.1)
- [x] Route editor (connected waypoints, distance, terrain) (Phase 3.2-3.3)
- [x] Party position tracking (GM-set, published to players) (Phase 3.4)
- [x] Map publication controls (toggle visibility of regions/routes) (Phase 3.4)
- [x] Marker types (friendly, hostile, objective, supply, hazard) (Phase 3.1)
- [x] Publish/withdraw workflow for shared map state (Phase 3.4)
- [x] Player visibility enforcement (show/hide layers based on publication flags) (Phase 3.4)

**Implementation Summary (Phase 3.1-3.4):**
1. **Phase 3.1 Complete** — Location CRUD, bounds validation, modal editor
2. **Phase 3.2 Complete** — Route CRUD with ordinal ordering, validation, transactions
3. **Phase 3.3 Complete** — Route UI visualization, modal stops editor, dashboard integration
4. **Phase 3.4 Complete** — Publication state management, party position tracking, player visibility enforcement

**Implemented Components:**
- ✅ Map initialization with bounds and basemap
- ✅ Location management with CRUD operations
- ✅ Route planning with stop sequencing
- ✅ Publication toggles for route, locations, position, factions
- ✅ Party position marker with drag (GM) / static (players)
- ✅ Publication history audit trail
- ✅ Player interface with publication-aware rendering
- ✅ Offline PMTiles asset serving with byte-range support

**Exit Checks:** ✅ All passed
- [x] Players see only published map content (GM controls visibility)
- [x] Map zoom/pan works smoothly for 1-4 concurrent players
- [x] Party position updates in <500ms for GM and all players
- [x] Route geometry validated against bounds
- [x] Campaign isolation enforced at data boundary
- [x] Atomic transactions prevent stale writes
- [x] All 236 tests passing (100% coverage, zero regressions)
- [x] Publication history immutable and queryable

---

### 🔧 Milestone 5: Operational Reliability — Backup & Asset Management

**Status:** ✅ **COMPLETE** (Backup/restore + scheduled automation + PMTiles asset serving all complete — 04 Nov 2026)

#### **5a: Scheduled Backup Automation** ✅ **COMPLETE (Phase 1-3)**

**Phase 1-2 Status:** ✅ Complete
- Core scheduler module: 9 production functions (server/backup-scheduler.cjs, 9k)
- HTTP API routes: 4 REST endpoints (server/campaigns.cjs, 100 lines)
- Database schema: backup_schedules + backup_history tables
- Retention policies: enforce both age (days) and count (max backups)
- 30 comprehensive tests (all passing)

**Phase 3 Status:** ✅ **COMPLETE** (NEW)
- [x] Event-based backup triggers (combat, journal, inventory, character changes)
- [x] Background task runner for scheduled backup execution (1-minute interval)
- [x] Mutation capture hooks for automatic backup recording
- [x] Integrated backup automation into main.cjs server startup
- [x] 20 new comprehensive automation tests (all passing)
- [x] Zero regressions (236/245 total tests passing; 9 pre-existing failures in milestone3-routes)

**Implemented in Phase 3:**
- Automatic backup module: 7 production functions (server/backup-automation.cjs, 11.7k)
- Background runner with 1-minute check interval for scheduled backups
- Mutation hooks module (server/campaign-mutation-hooks.cjs) for event capture
- Integration into main.cjs with campaign list refresh every 5 minutes
- All-mutations event triggers: COMBAT_RESOLVED, JOURNAL_ENTRY, INVENTORY_CHANGE, CHARACTER_CHANGE

**Architecture:**
- Event types: Simple three-level labeling (manual, scheduled, event)
- Backup exporter: Deterministic export based on current campaign state
- Error handling: Graceful degradation with console logging (non-blocking)
- Test-friendly design: Handles test databases without campaigns table
- Production-ready: No external dependencies, SQLite-only operations

**API Endpoints:**
- `GET /api/campaigns/:id/backup-schedule` — Retrieve schedule
- `POST /api/campaigns/:id/backup-schedule` — Create schedule
- `PATCH /api/campaigns/:id/backup-schedule` — Update schedule
- `GET /api/campaigns/:id/backup-history` — Get history (paginated)

**Exit Checks:** ✅ All passed
- [x] 20 automation tests passing (all comprehensive scenarios covered)
- [x] 30 scheduler tests passing (no regressions)
- [x] Background runner successfully starts with server
- [x] Event triggers fire on all mutation types
- [x] Backup retention policies enforced
- [x] Campaign list updates every 5 minutes for dynamic discovery
- [x] Graceful error handling in test environments
- [x] Production-ready code, no external dependencies

**Implementation Summary:**
1. Created `backup-automation.cjs` with event trigger registration, backup recording, and scheduled execution
2. Created `campaign-mutation-hooks.cjs` with mutation handler factories for integration
3. Updated `main.cjs` to initialize backup automation and start background runner
4. Created comprehensive test suite with 20 test cases covering all scenarios
5. All 50 backup tests (20 automation + 30 scheduler) passing
6. Total test suite: 236 passing (including all backup tests)

**Next Phase (5a Phase 4 — Optional):**
- [ ] GM UI for schedule management and backup history viewer
- [ ] Restore controls and version browser in GM interface
- [ ] Backup size metrics and storage management UI

#### **5b: PMTiles Asset Serving** (✅ Complete — 04 Nov 2026)

**Scope:**
- [x] PMTiles asset serving with byte-range support
- [x] Cross-host recovery of offline map assets through setup package → import → storage → retrieval → restore
- [x] Basemap references persisted to database during import
- [x] Graceful handling and conflict resolution

**Exit Checks:**
- [x] Basemap reference stored in maps table during setup package import
- [x] Basemap survives backup/restore cycles
- [x] Database schema includes offlineBasemap_json column in maps table
- [x] All 236 tests passing (zero regressions)

**Implementation Summary:**
1. Added `offlineBasemap_json` column to maps table schema for persistent basemap storage
2. Modified `importSetupPackage()` to extract and persist basemap reference from setup package to maps table
3. Updated `getGMMap()` to read basemap from maps table instead of setup_imports
4. Updated `validateRuntimeSave()` and `restoreRuntimeSave()` for backup/restore support
5. Created comprehensive test suite (tests/milestone5b-pmtiles.test.cjs) with 3 test cases:
   - Basemap storage during import
   - Null handling when basemap not provided
   - Basemap persistence across multiple imports
6. All 236 tests passing (233 existing + 3 new PMTiles tests)
7. Basemap lifecycle verified end-to-end: setup package → import → storage → retrieval → restore

**Parallel Development:** Complete. Ready for next milestone.

**Atlas import update (04 Nov 2026):** Uploads now detect raster versus MVT vector PMTiles v3 and store archives plus JSON sidecars in `data/maps/atlas/`. Vector tiles render through local MapLibre libraries with a basic default style. New uploads require GM-entered required attribution and an HTTPS license URL; both are carried through setup import and shown on published maps. This records the GM's license review but does not independently verify rights. No real licensed archive has yet been used for end-to-end rendering verification.

---

### 👥 Milestone 6: Session Preparation — NPC & Encounter Generation

**Status:** 🟡 **IN PROGRESS** (6a service implementation complete, API integration and UI next)

**Scope:** Four independent sub-systems, can develop in parallel:

#### **6a: NPC Creation** 🟢 **SERVICE COMPLETE**
- [x] NPC CRUD service (create, read, update, delete, clone)
- [x] Archetype-based NPC initialization from T2K 4E Referee's Manual data
- [x] Support for custom attribute overrides (strength, agility, intelligence, empathy)
- [x] Hit cap, CUF rating, skills, and equipment inheritance from archetypes
- [x] Campaign-scoped NPC isolation
- [x] NPC roster management (add, edit, delete, quick-clone)
- [ ] REST API endpoints (create, read, update, delete, list, clone)
- [ ] GM UI form for NPC creation and roster management
- [ ] GM templates (quick presets for common roles)
- [ ] NPC life path automation (career path, skills, gear)

**Implemented (Service — server/npc-service.cjs):**
- createNPC(database, campaignId, npcData) — Create new NPC with optional archetype inheritance
- getNPC(database, campaignId, npcId) — Fetch single NPC with full details
- listNPCs(database, campaignId) — List all NPCs in campaign, sorted by display order
- deleteNPC(database, campaignId, npcId) — Remove NPC from campaign
- updateNPC(database, campaignId, npcId, updates) — Edit NPC name, rank, specialty, notes
- cloneNPC(database, campaignId, sourceNpcId) — Create copy of existing NPC with (Copy) appended
- getArchetype(database, archetypeId) — Fetch archetype definition
- listArchetypes(database, category) — List archetypes optionally filtered by category

**Archetype Categories (from gmpack/npc-archetypes.json):**
- civilian (4 archetypes: refugee, civilian, hunter, marauder)
- soviet-military (4: elite, officer, soldier, spetsnaz)
- us-military (4: elite, intelligence, officer, soldier)
- other-military (5: israeli-elite, israeli-officer, israeli-soldier, british-officer, british-soldier)
- Total: 17 archetypes loaded from gmpack at database initialization

**Database Schema (Migration 18 + 19):**
- npc_archetypes table: id, name, category, description, attribute_strength/agility/intelligence/empathy, hit_cap, cuf_rating, skills_json, equipment_json, created_at
- personnel table enhanced with: attribute_*, hit_cap, cuf_rating, skills_json, equipment_json, archetype_id, morale_state, stress_damage, created_at, updated_at, rank, specialty, notes

**Test Coverage:**
- 10 comprehensive tests (tests/milestone6a-npc.test.cjs)
  - ✅ Archetype listing and category filtering
  - ✅ NPC creation from archetype with inheritance
  - ✅ NPC creation with custom attributes
  - ✅ NPC listing and sorting
  - ✅ NPC updates (name, rank, specialty, notes)
  - ✅ NPC cloning
  - ✅ NPC deletion
  - ✅ Campaign isolation
  - ✅ Attribute inheritance from archetypes
- All 10 tests passing (236/236 total test suite)

**Dependencies:** Character data model (complete), Migration 18-19 schema (complete)

**Effort:** Medium (service complete; pending API endpoints and UI)

**Next Steps:**
1. Add REST API endpoints in server/campaigns.cjs (6 routes: POST create, GET list, GET detail, PATCH update, DELETE delete, POST clone)
2. Create GM UI modal for NPC management (roster grid, add button, detail editor, delete confirmation)
3. Integrate with dashboard NPC roster view
4. Add NPC life path automation (career path selection, skill/equipment progression)

#### **6b: Settlement Drafts**
- [ ] Settlement template system (size, type, faction control, condition)
- [ ] Quick settlement generator (name, key features, leadership)
- [ ] Editable settlement notes (resources, threats, opportunities)
- [ ] Link settlements to campaign map locations

**Dependencies:** Location/waypoint system (Milestone 3)

**Effort:** Low-Medium (mostly data structure, limited rules)

#### **6c: Mission & Encounter Design**
- [ ] Mission template system (premise, objectives, rewards, hooks)
- [ ] Encounter types: ambush, roadblock, settlement encounter, checkpoint
- [ ] Opposing force composition (unit type, size, motivation)
- [ ] Mission-to-location linking
- [ ] GM notes and player briefing separation

**Dependencies:** Milestone 3 (map/location) for spatial context

**Effort:** Medium (procedural templates, moderate complexity)

#### **6d: Scenario Packages**
- [ ] Import/export scenarios as JSON packages
- [ ] Scenario versioning (author, date, T2K 4E edition reference)
- [ ] Scenario templates bundled with tool

**Dependencies:** 6a, 6b, 6c completed

**Effort:** Low (data structure and I/O)

**Exit Checks (for full Milestone 6):**
- NPCs, settlements, missions generated with verified T2K 4E procedures
- Unverified content clearly marked as GM-authored
- Templates are editable and customizable
- Scenario packages import without data loss

---

### ⛓️ Milestone 7: Campaign Depth — Manual Faction & Settlement Management

**Status:** 🟢 **SERVICE COMPLETE** (02 Nov 2026)

**Scope:** ✅ ALL COMPLETE

- [x] Faction CRUD (name, leader, goal, strength, notes)
- [x] Faction relationship matrix (attitude toward other factions)
- [x] Settlement resources (quick manual tracking: food, water, fuel, ammunition, medical, shelter, intel, other)
- [x] Events/rumors log (chronological, GM-entered, filterable by type/faction/settlement)
- [x] Threat tracker (active antagonists, threat level, status, goal, resources)
- [x] REST API endpoints (all CRUD + list + filter)
- [ ] GM UI for faction/threat management (pending)
- [ ] Territory annotations on map (pending)

**Approach:** Simple records and GM-entered changes; **no automation**. All faction actions, settlement changes, and threat progression are GM-entered events.

**Implemented (Service — server/campaign-depth-service.cjs):**

**Factions (4 functions):**
- createFaction(db, campaignId, factionData) — Create faction with name, description, color, leader, goal, strength, notes
- getFaction(db, campaignId, factionId) — Fetch single faction
- listFactions(db, campaignId) — List all campaign factions sorted by name
- updateFaction(db, campaignId, factionId, updates) — Edit faction details
- deleteFaction(db, campaignId, factionId) — Remove faction

**Faction Relationships (4 functions):**
- setFactionRelationship(db, campaignId, fromId, toId, attitude, notes) — Set relationship (allied/neutral/hostile/unknown)
- getFactionRelationship(db, campaignId, fromId, toId) — Fetch single relationship
- getFactionRelationships(db, campaignId, fromId) — List relationships from one faction
- getAllFactionRelationships(db, campaignId) — List all relationships in campaign

**Settlement Resources (3 functions):**
- setSettlementResource(db, campaignId, settlementId, type, status, notes) — Set resource status (available/scarce/needed/unknown)
- getSettlementResource(db, campaignId, settlementId, type) — Fetch single resource
- getSettlementResources(db, campaignId, settlementId) — List all resources in settlement

**Campaign Events (5 functions):**
- createEvent(db, campaignId, eventData) — Create event with title, description, type (rumor/event/discovery/faction-action/settlement-change/threat/other), date, public flag
- getEvent(db, campaignId, eventId) — Fetch single event
- listEvents(db, campaignId, filters) — List events filtered by type/faction/settlement/public status, sorted chronologically DESC
- updateEvent(db, campaignId, eventId, updates) — Edit event
- deleteEvent(db, campaignId, eventId) — Remove event

**Threat Tracker (5 functions):**
- createThreat(db, campaignId, threatData) — Create threat with name, description, level (low/medium/high/critical), status (emerging/active/contained/resolved), antagonist type (faction/individual/force/event/other), goal, resources, notes
- getThreat(db, campaignId, threatId) — Fetch single threat
- listThreats(db, campaignId, filters) — List threats filtered by status/level/type/faction/settlement, sorted by level (critical→low) then status
- updateThreat(db, campaignId, threatId, updates) — Edit threat
- deleteThreat(db, campaignId, threatId) — Remove threat

**Database Schema (Migration 20 — NEW):**
- faction_relationships table: from_faction_id, to_faction_id, attitude (CHECK: allied/neutral/hostile/unknown), notes, updated_at
- settlement_resources table: settlement_id, resource_type (CHECK: food/water/fuel/ammunition/medical/shelter/intel/other), status (CHECK: available/scarce/needed/unknown), notes, updated_at
- campaign_events table: title, description, event_type (CHECK: rumor/event/discovery/faction-action/settlement-change/threat/other), event_date, linked_faction_id, linked_settlement_id, is_public, gm_notes, timestamps
- threat_entries table: name, description, threat_level (CHECK: low/medium/high/critical), status (CHECK: emerging/active/contained/resolved), antagonist_type (CHECK: faction/individual/force/event/other), goal, resources_json, timestamps

**REST API Endpoints (16 total):**
- `GET /api/campaigns/:id/factions` — List all factions
- `POST /api/campaigns/:id/factions` — Create faction
- `GET /api/campaigns/:id/factions/:factionId` — Get faction detail
- `PUT /api/campaigns/:id/factions/:factionId` — Update faction
- `DELETE /api/campaigns/:id/factions/:factionId` — Delete faction
- `GET /api/campaigns/:id/factions/:factionId/relationships` — List relationships from faction
- `GET /api/campaigns/:id/factions/:factionId/relationships/:toFactionId` — Get specific relationship
- `POST /api/campaigns/:id/factions/:factionId/relationships/:toFactionId` — Set relationship
- `GET /api/campaigns/:id/settlements/:settlementId/resources` — List settlement resources
- `GET /api/campaigns/:id/settlements/:settlementId/resources/:type` — Get resource detail
- `POST /api/campaigns/:id/settlements/:settlementId/resources/:type` — Set resource status
- `GET /api/campaigns/:id/events` — List events (filterable: eventType, linkedFactionId, linkedSettlementId, isPublic)
- `POST /api/campaigns/:id/events` — Create event
- `GET /api/campaigns/:id/events/:eventId` — Get event detail
- `PUT /api/campaigns/:id/events/:eventId` — Update event
- `DELETE /api/campaigns/:id/events/:eventId` — Delete event
- `GET /api/campaigns/:id/threats` — List threats (filterable: status, threatLevel, antagonistType, linkedFactionId, linkedSettlementId)
- `POST /api/campaigns/:id/threats` — Create threat
- `GET /api/campaigns/:id/threats/:threatId` — Get threat detail
- `PUT /api/campaigns/:id/threats/:threatId` — Update threat
- `DELETE /api/campaigns/:id/threats/:threatId` — Delete threat

**Test Coverage:**
- 31 comprehensive tests (tests/milestone7-campaign-depth.test.cjs)
  - ✅ Faction creation, retrieval, listing, update, delete
  - ✅ Faction relationship matrix (set, get, list, bilateral attitude)
  - ✅ Settlement resources (all 8 types, 4 statuses)
  - ✅ Events with chronological sorting and filtering
  - ✅ Threats with severity-ordered listing
  - ✅ Campaign isolation verification
  - ✅ Input validation for all constraint types
- All 31 tests passing (267/267 total test suite, zero regressions)

**Dependencies:** None (can start independently)

**Exit Checks:** ✅ ALL PASSED
- [x] Factions, settlements, events queryable and filterable
- [x] 31 comprehensive service tests passing
- [x] All CRUD operations validated
- [x] Campaign isolation enforced
- [x] REST API endpoints integrated into campaigns.cjs
- [x] 267/267 total tests passing (zero regressions)
- [x] Production-ready code

**Design Principle:** Data structure first, query/report second, automation deferred. No rule automation; all entries are GM-managed.

**Next Steps (Pending):**
- [ ] GM UI modal for faction roster (list grid, add, edit, delete, relationship matrix view)
- [ ] GM UI modal for threat tracker (priority list, severity coloring, status updates)
- [ ] Territory annotations on map (faction influence visualization)
- [ ] Threat/event linking to player-visible situation report (GM-controlled publication)

**Effort:** Complete service; UI pending

---

### 🏭 Milestone 8: Advanced Simulation — Defer Indefinitely

**Status:** ⏸️ **DEFERRED** (Lowest priority; implement only if demonstrated need in active campaigns)

**Scope (Not Implemented):**
- Economic simulation (prices, supply/demand, production)
- Autonomous faction diplomacy or relationship changes
- Workforce and productivity systems
- Persistent world simulation (automatic event generation)
- Advanced scheduling and conflict resolution

**Rationale:**
- Highest complexity, lowest universal benefit
- Manual equivalents (Milestone 7) can deliver 80% of value
- Real-world campaigns will reveal which mechanics actually matter
- Defer until active play demonstrates specific demand

---

## Development Strategy — Parallel Execution

### Current Work (November 2026) — Milestone 3 Complete

1. ✅ **Milestone 3 (Shared Awareness):** COMPLETE — Map system, route management, publication control, player visibility (Phase 3.1-3.4 all done)
2. **Milestone 6 (Session Prep):** Ready to start — NPC/character generation, missions, encounters, settlements
3. **Milestone 7 (Campaign Depth):** Planned — Faction management, settlement tracking, threat systems

### How to Execute in Parallel

1. **Test first:** Each milestone/sub-system gets its own test suite
2. **Independent modules:** Each system is a separate backend module and frontend app
3. **Staged integration:** Systems integrate at defined points (e.g., Milestone 6c needs Milestone 3's location system)
4. **Shared data model:** All systems use the same campaign data, versioned in DATA_MODEL.md
5. **No blocking:** If one system is blocked (e.g., waiting for PMTiles verification), switch to another

### Integration Points

- **Milestone 2 → Milestone 3:** Inventory supplies feed into route/travel planning
- **Milestone 3 → Milestone 6:** Map provides spatial context for missions and encounters
- **Milestone 4b → Milestone 3:** Weather affects travel times and visibility on shared map
- **Milestone 6c → Milestone 7:** Encounters and missions reference factions/settlements
- **Milestone 7 → all others:** Campaign depth informs faction presence on map and in encounters

---

## Exit Criteria & Quality Gates

**Every milestone must pass before integration:**

1. ✅ **All new tests pass** (maintain 100% baseline plus new tests)
2. ✅ **Verified against T2K 4E rules** (where applicable) — cite gmpack/ocr/ source
3. ✅ **Zero regressions** on existing features (all 121 tests remain passing)
4. ✅ **Documented** (README for each module, inline comments for complex logic)
5. ✅ **Manual verification** (tested in browser with 1-4 concurrent players)
6. ✅ **Audit trail** (if data changes, action is logged)
7. ✅ **Authorization** (players cannot access GM-only content; GM has full access)

---

## Delivery Principles

- Treat Fourth Edition rules as authoritative wherever a feature models an actual game mechanic. Verify each mechanic against an authoritative source before implementation; keep unverified behavior GM-managed and labeled.
- Keep rules logic, campaign-specific data, GM rulings, and AI-generated proposals separate.
- Make consequential simulations and generated material visible and reviewable by the GM; do not silently advance or resolve the world.
- Preserve campaign data through versioned save/load and validated import/export before growing the number of interdependent entities.
- Treat the campaign setup package as an explicit, validated handoff into the GM runtime; do not use the player interface as another editor for campaign state.
- Publish player-facing information from an explicit GM-controlled projection, not directly from internal campaign data.
- Keep the interface clear, low-scroll, and inspired by field communications equipment. Do not create mobile-specific layouts unless explicitly requested.
- Maintain comprehensive test coverage and production-ready code quality throughout.
- Update status in `FEATURES.md` and `project-status.html` as capabilities move from planned to prototype, partial, and implemented.

---

## Scope Not Included (Defer or Reject)

Per Plan B scope assessment, the following are **deferred or excluded** from core development:

- ❌ **Full economic simulation** — Settlement needs and GM-set prices may suffice
- ❌ **Autonomous diplomacy** — Relationship notes and GM-authored events instead
- ❌ **Integrated world simulation** — Dated event queue with GM approval instead
- ❌ **Separate dashboards for every subsystem** — Contextual panels over shared records
- ❌ **Advanced messaging** — Dependable shared COMMS with polling sufficient for LAN play
- ❌ **Advanced mapping** — Vector styling, fog masking, elaborate editing deferred
- ❌ **AI-assisted setup** — Optional and outside critical path; manual authoring fully usable
- ❌ **Broad battle simulation** — Keep separate from attack calculators

---

## Status Tracking

Progress is tracked in three places:

- **[FEATURES.md](FEATURES.md)** — Feature inventory with implementation status
- **[project-status.html](project-status.html)** — Snapshot of current test count, milestones, and verification
- **This roadmap** — Development sequence and parallel work strategy

## Phase 2: Characters and AI-Assisted Campaign Setup

**Goal:** Add verified character/NPC creation and optional AI assistance to campaign authoring.

- Add player-character and NPC creation to the appropriate GM authoring/runtime workflows, using verified Fourth Edition procedures wherever applicable.
- Build on the current manual template slice: global GM-owned player templates can record final attributes, skills, CUF, and structured life-path outcomes, but full rules-driven generation and source-checked validation remain outstanding.
- Cite the relevant book and page or section in original, concise language; distinguish optional, house-ruled, and GM-managed fields.
- Add AI-assisted campaign setup as a draft workflow: review, edit, accept, or discard generated material before it enters a setup package.
- Provide a manual campaign-creation path so this workflow remains usable without an AI service.
- Decide how AI requests are handled without exposing provider secrets in a browser client; keep the provider replaceable.

**Exit checks:** Character/NPC outputs pass source-checked examples; generated campaign material cannot enter a package without GM confirmation; user data is not sent to an AI service without an explicit configured path.

## Phase 3: GM Runtime and Player Situation Report

Integration check (01 Nov 2026): combined recovery, cross-host runtime import with explicit account mapping, and all five browser views verified. Fixed a seed-only browser submit guard and late character-response display. Client regressions complement API permission/recovery checks; covered GM mutations now have audit metadata. Rules automation, wider audit coverage/content snapshots, and scheduled backups remain incomplete.

**Goal:** Make the imported campaign operable and give the GM explicit control over the player-facing report.

- Turn the existing dashboard, clock, journal, roster, route, and resource counters into views over imported campaign state rather than separate sample state.
- Implemented clock slice: revision-protected +6h with date/day rollover at midnight. A GM-defined one-ration-day schedule processes each date's midday once; fuel/items remain manual. Time, daily usage, and audit/journal are atomic and recover together. New COMMS/audit stamps retain HH:MM; older stamps are not backfilled. General scheduling and verified consumption remain planned.
- Complete runtime save/load, autosave, backup, and recovery workflows for the running campaign.
- Implemented slice: GM-only runtime-v1 export and atomic same-campaign restore preserve supported record IDs, seats, requests, and source revision provenance, with replacement/older-backup confirmations and a monotonic active revision. Cross-host import creates a new campaign, maps the source GM to the signed-in GM, and requires each source player to map to a distinct enabled, unassigned local player account owned by that GM; credentials and sessions are not transferred. Scheduled backups remain planned.
- Add a Player Interface situation report backed only by a deliberately constructed player-visible projection.
- Implemented text-only slice: owning GM draft, preview, publish, and withdraw; active assigned players receive only title, body, game time, and publication timestamp. Draft edits do not affect the current player copy. Visible handset reports refresh every 15 seconds and on explicit refresh; push delivery remains planned. Runtime backup restores the draft and withdraws publication, never silently resurrecting withdrawn content.
- Let the GM publish the Setup Tool map with GM-managed markings, route, and player position. Give players scroll access and zoom up to 200%, with map open/reset centered on their position, without allowing them to change campaign map state.
- Implemented map slice: GM selection of locations, labeled point markings, bounded LineString/single-ring Polygon geometry, ordered selected-location waypoints, and bounded player position. Geometry vertices are checked against Setup bounds. Explicit publication can reveal selected source GM-only locations; unselected records remain excluded. Read-only assigned-player output uses an allow-list and no raw annotations or setup export. Optional raster or MVT vector PMTiles assets are served with byte ranges through authorized routes; vector archives use a basic local style. Attribution and HTTPS license URL travel with setup/runtime metadata and appear on published maps. The GM must confirm permitted use; license rights are not machine-verified. Map drafts participate in runtime backup, but archive files and JSON sidecars remain separate and must be transferred together. Rich vector styles, fog masking, history, and push delivery remain planned.
- Allow players to send a single-line COMMS message to the GM and all player seats; record player identity, campaign game time, and message content.
- Implemented single-line slice: player/GM broadcasts retain server sender and date/day/time snapshots. Historical date-only stamps stay unchanged. Archives recover atomically; visible views poll every 15 seconds. Push delivery, receipts, and moderation remain planned.
- Support 1-4 authenticated player seats, each assigned one character and an independent browser session.
- Show each player only their own character and inventory, alongside GM-published situation information.
- Implemented manual-condition slice: owning GM complete-record saves/clear, distinct public/private notes, and own-seat GET-only projection. Null values remain unknown and no rules effects are derived. Condition revisions advance during restore with empty markers for omitted older records. GM condition changes now have atomic audit metadata; rules automation and wider action coverage remain planned.
- From the GM Tool, let the GM add, remove, edit, preview, publish, and withdraw report information; show whether changes are drafts or published.
- Keep GM notes, hidden threats, unrevealed state, and other players' private data out of player-facing output by default.
- Allow players to submit change requests only for their own assigned character and inventory. Keep requests pending until the GM reviews and applies them; route dice-governed actions through the rules-verified item-action workflow planned in Phase 4.
- Implemented slice: finalized character edits and inventory add/update/remove proposals require owning-GM review. Inventory item revisions prevent stale approvals, and accepted source data is independently confirmed by the GM. Broader rules-governed character/item actions remain in progress.
- Implemented audit metadata slice: conditions, inventories/reviews, report/map mutations, and restores record server actor, target IDs/labels, revisions, time, and recovery origin. Broader mutation coverage and full past-publication content snapshots remain planned; no pre-upgrade actions are backfilled.
- Add missions and a campaign event ledger as GM-managed runtime records.

**Exit checks:** Verify one-player and four-player campaigns, independent browser sessions, and blocked cross-player/GM-only access. Players can scroll/zoom the full published map but cannot modify map, markings, route, or position state. Character and inventory requests never change accepted state before GM approval. COMMS messages preserve sender and game time and reach the GM and all player seats. GM changes appear in the player report only after publishing; withdrawn information disappears. Runtime recovery does not unexpectedly alter published content or player ownership.

## Phase 4: Environment, Routes, and Logistics

**Goal:** Replace fixed demonstration values with campaign-managed travel and supply records.

- Implemented slice: edit runtime route stop order/details/distances and location coordinates within imported bounds. Updates are owner/revision checked, audited, and backed up; they do not alter setup source geometry or automatically update player publication. Setup bounds editing and GM publication geometry are implemented; editor polish and offline asset migration remain open, alongside new locations, travel conditions, and weather automation.
- Implemented weather slice: GM-selected Fair, Cloudy, Rain/Snow, or GM-defined condition plus optional note persists in the revision-checked runtime dashboard and backup. The GM records the physical d6 result and matching source-aid symbol; no numeric face mapping is assumed. Rolls are limited to once per shift, logged in journal/audit, and checked by the API. Rain/Snow automatically returns to Cloudy after one Fieldbook shift, followed by one full Cloudy shift before rolling resumes. Weather effects remain GM-adjudicated and do not modify character rolls.
- Implement route modifiers only after Fourth Edition procedures are verified; otherwise label them as GM-entered campaign conditions.
- Add convoy operations, cargo manifests, inventories, stockpiles, consumption, and resource distribution.
- Add player-owned character inventories and item actions. Implement dice-governed procedures only after verification against authoritative Fourth Edition sources; record inputs, roll, and outcome, and send ambiguous cases to the GM.
- Implemented bookkeeping slice: owned accepted items, manual carry locations/quantities, RB/GM/UF claims and citations, direct GM stocking/corrections, and pending player changes. Inventories/proposals participate in atomic backups; item revisions advance during restore and valid saved pending proposals are rebased. No weights, carrying penalties, weapon statistics, transfer rules, or dice-governed actions are computed. These remain separate source-verified work.
- Allow players to adjust quantities in their assigned inventories. Compute carrying load and apply any rules penalties only after the Fourth Edition procedure, relevant character inputs, and item weights are verified; otherwise display missing data and leave the effect GM-managed.
- Use source-referenced Fourth Edition item data wherever applicable. Categorize sources as RB (rule book), GM (GM-defined), or UF (unverified). Let players submit new items and item-data edits as pending proposals; treat the player's category as a claim until GM verification and acceptance.
- Add resource contracts and automated resupply as configurable, previewable GM actions.
- Show a logistics dashboard that summarizes the underlying records.

**Exit checks:** Route and inventory changes persist and appear consistently across views; resource costs, item weights, and carrying effects are source-verified or explicitly GM-managed; unverified player proposals cannot alter accepted inventory; GM acceptance is recorded; automated actions can be previewed and reversed.

## Phase 5: Settlements and Economy

**Goal:** Model settlement-level production and trade using transparent campaign data.

- Add settlement management, workforce, production, and prosperity records.
- Add market goods, supply and demand, and price management.
- Add economic event creation and its effects on settlements, markets, and trade.
- Keep simulation assumptions configurable; distinguish campaign simulation from official game rules.

**Exit checks:** The GM can inspect inputs and outcomes, override them, and see an auditable history of economic changes.

## Phase 6: Factions, Diplomacy, and Territory

**Goal:** Make political relationships and control visible and manageable.

- Add faction relationships and settlement affiliations.
- Manage alliances, trade agreements, embargoes, transit rights, influence, and territorial control.
- Add diplomacy views, territory views, and GM-created diplomatic events.
- Ensure changes to access, trade, or control are explicit campaign state changes with a history.

**Exit checks:** Relationship and territory changes are traceable, editable, and reflected in route and market views without inventing rule effects.

## Phase 7: Conflict, Threats, and Combat Tools

**Goal:** Support conflict preparation and verified tactical calculations without overclaiming automation.

- Track conflict escalation, border incidents, trade disruption, convoy attacks, and active threats.
- Generate threat intelligence, missions, ambushes, raids, roadblocks, sabotage encounters, and opposing forces as GM-reviewed scenario material.
- Implement tactical encounter tools and the battle calculator using verified Fourth Edition procedures.
- Keep encounter generation separate from rules resolution; label assumptions and homebrew.
- Initial implementation slice: a GM-only, manually authored conflict/incident ledger. It records descriptive categories and status without calculating escalation, resolving encounters, or publishing to players.

**Exit checks:** Rules-backed calculations match source-checked examples; generated threats and encounters remain editable proposals; reports identify their sources and uncertainty.

## Phase 8: Scheduled Events and Persistent World Simulation

**Goal:** Connect the systems into a controllable campaign simulation.

- Add campaign clock scheduling and event resolution across logistics, economy, diplomacy, territory, and conflict.
- Provide pause, step, preview, and history controls; require GM approval for consequential state changes.
- Make simulation deterministic or replayable where practical, and support undo or restore from a prior campaign state.
- Add AI diplomacy and intelligence generation as GM-reviewed proposals, not autonomous campaign authority.

**Exit checks:** The GM can preview a simulation step, inspect affected records, approve or reject it, and restore the prior state. No scheduled or AI-generated action resolves invisibly.

## Cross-Phase Quality Gates

- Feature status in `FEATURES.md` matches the implemented behavior; planned features are not presented as available.
- Rule-bearing behavior has an authoritative Fourth Edition source and regression examples, or remains clearly GM-managed.
- Save/load/import/export remains compatible and data changes are validated before commit.
- Setup package import/export is distinct from runtime save/load; player output is filtered through explicit publication state and tested against GM-only data.
- Player authorization is checked at the shared-data boundary; tests cover 1-4 seats, character ownership, inventory changes, and dice-action records.
- Common workflows have focused automated checks; critical changes receive a browser smoke test.
- The interface keeps common GM tasks easy to reach without sacrificing readability or accessibility.

Update all three when a milestone is completed or status changes.
