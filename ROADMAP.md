# Development Roadmap — Plan B Edition

**Last updated:** 02 Nov 2026  
**Strategy:** Session management first. Complete existing session workflows before expanding interconnected simulation systems.  
**Reference:** [Plan B — Scope Assessment](gmpack/plan-b.html)

## Product Scope

The Twilight: 2000 GM Tool has three connected surfaces over a shared, versioned campaign model:

- **Campaign Setup Tool:** GM-only authoring of initial campaign identity, premise, map, locations, factions, settlements, and scenario notes. Exports a portable, versioned setup package; it does not own evolving campaign state or publish player data.
- **GM Tool:** Authoritative runtime control surface. Imports a setup package to create the initial campaign state, owns all subsequent campaign changes, controls player publication, and manages live map markings, route, and player position.
- **Player Interface:** A browser-based surface for 1-4 separately identified players. Each player sees the GM-published situation report and their assigned character and personal inventory. The GM adds, removes, edits, previews, publishes, or withdraws report information through the GM Tool.

Keep a setup package distinct from a running campaign save. Importing setup data creates a new initial runtime state; later changes belong to the GM runtime and do not rewrite the setup package. Setup notes and other GM-only content are never published automatically. Keep GM-only notes, unrevealed state, and other players' private data outside each player's view. Enforce identity, character ownership, and permissions at the authoritative data boundary.

**Deployment:** Run the authoritative service on a GM-controlled Raspberry Pi or laptop on the local network, with browser clients connecting over LAN using plain HTTP. Store runtime campaign state in SQLite on that host; retain versioned JSON for setup-package exchange and backups. HTTP is unencrypted, so the service must remain on a trusted LAN and must not be exposed to the internet or untrusted networks. Remote hosting is out of initial scope and requires a separate deployment and security decision if added later.

## Current Baseline (02 Nov 2026)

**Implemented & Production-Ready:**
- Owner-scoped campaign persistence via SQLite on LAN host
- Session token authentication with server-side GM/player role verification
- All five player handset views connected and synchronized
- Character inventory with conditions and manual change tracking
- Campaign clock (date/time advancement and midday supply processing)
- Journal with GM-authored entries
- Combat calculator (ranged, close combat, grenades, heavy weapons, vehicles)
  - No random number generation; GM enters pre-rolled dice, system calculates deterministically
  - All calculations verified against T2K 4E Referee Aids
  - Persistent logging of combat results to campaign audit trail
- Audit trail: append-only, owner-scoped, covers 12 action types across 6 target types
- Backup/restore with atomic rollback and conflict detection
- Setup package import/export with player seat assignment
- Player seat isolation: each player sees only their own character and GM-published data
- 121/121 tests passing (100% coverage maintained)

**Not Implemented:**
- Campaign Setup Tool (UI for initial campaign authoring)
- Player-data isolation enforcement at setup time
- Encounter and NPC generation
- Scheduled backups and cross-host recovery
- Vector map styling and advanced editing
- Economic simulation or autonomous faction systems

## Plan B Priority Framework

Based on [gmpack/plan-b.html](gmpack/plan-b.html), development priorities are organized by strategic value:

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

**Status:** 🟡 **PARTIAL** (inventory, conditions, clock, journal implemented; personnel refinement needed)

**Scope:**
- [x] Character inventory management with manual condition tracking
- [x] Campaign clock (date/time advancement, midday supply processing)
- [x] Journal with GM-authored entries
- [ ] Personnel roster refinement (unit templates, quick assignment)
- [ ] Inventory UI improvements (bulk operations, search/filter)
- [ ] Condition templates and quick-apply UI

**Exit Checks:**
- All core session workflows available without leaving the GM Tool
- Inventory changes appear immediately on player handsets
- Campaign clock advances correctly with multiple players connected
- Journal filters by date and searchable

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

**Status:** ⚪ **READY (Not Started)**

**Scope:**
- [ ] Map initialization from setup package
- [ ] Location/waypoint editor (name, coords, type, notes)
- [ ] Route editor (connected waypoints, distance, terrain)
- [ ] Party position tracking (GM-set, published to players)
- [ ] Map publication controls (toggle visibility of regions/routes)
- [ ] Marker types (friendly, hostile, objective, supply, hazard)
- [ ] Publish/withdraw workflow for shared map state

**Dependencies:** Milestone 5 (Operational Reliability) for PMTiles asset delivery

**Exit Checks:**
- Players see only published map content
- Map zoom/pan works smoothly for 1-4 concurrent players
- Party position updates in <500ms for GM and all players
- Route geometry validated against bounds

**Integration Points:**
- Milestone 6 (Session Prep) for encounter placement
- Milestone 7 (Campaign Depth) for settlement/faction location annotations

---

### 🔧 Milestone 5: Operational Reliability — Backup & Asset Management

**Status:** 🟡 **PARTIAL** (Backup/restore complete; PMTiles asset delivery needs verification)

**Scope:**
- [x] Atomic backup API and restore with rollback
- [x] Backup versioning and history
- [ ] Scheduled backup automation (time-based or event-triggered)
- [ ] PMTiles asset serving with byte-range support
- [ ] Cross-host recovery of offline map assets
- [ ] Graceful error handling and conflict resolution
- [ ] Portable sidecar files for asset migration

**Exit Checks:**
- Backups are atomic and consistent
- Restores roll back all changes up to selected timestamp
- PMTiles render correctly in browser (needs manual verification in real campaign)
- Cross-host recovery succeeds without data loss

**Parallel Development:** Can run alongside other milestones after completion of core features

---

### 👥 Milestone 6: Session Preparation — NPC & Encounter Generation

**Status:** ⚪ **READY (Not Started)**

**Scope:** Four independent sub-systems, can develop in parallel:

#### **6a: NPC Creation**
- [ ] T2K 4E NPC life path automation (career path, skills, gear)
- [ ] GM templates (quick presets for common roles: squad leader, mechanic, doctor)
- [ ] Editable NPC name, rank, specialty, notes
- [ ] NPC roster management (add, edit, delete, quick-clone)

**Dependencies:** Character data model (complete)

**Effort:** Medium (rules verification against gmpack/ocr/Life Path)

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

**Exit Checks:**
- NPCs, settlements, missions generated with verified T2K 4E procedures
- Unverified content clearly marked as GM-authored
- Templates are editable and customizable
- Scenario packages import without data loss

---

### ⛓️ Milestone 7: Campaign Depth — Manual Faction & Settlement Management

**Status:** ⚪ **READY (Not Started)**

**Scope:** Simple GM-managed records before automation:

- [ ] Faction roster (name, leader, goal, strength, notes)
- [ ] Faction relationship matrix (attitude toward player party, other factions)
- [ ] Settlement roster (name, size, type, leadership, current state, notes)
- [ ] Settlement needs/resources (quick manual tracking)
- [ ] Territory map annotations (faction control zones, hazard areas)
- [ ] Events/rumors log (chronological, GM-entered)
- [ ] Threat tracker (active antagonists, their goals, resources)

**Approach:** Simple records and GM-entered changes; **no automation**. Faction actions, settlement changes, and threat progression are all GM-entered events.

**Dependencies:** None (can start independently)

**Exit Checks:**
- Factions, settlements, events queryable and filterable
- Territory annotations show on campaign map
- Events linkable to specific dates
- Data updates reflected in all player awareness contexts within 1s

**Design Principle:** Data structure first, query/report second, automation deferred

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

### Current Work (November 2026)

1. **Milestone 2 (Core Session Tools):** Personnel roster refinement, inventory UI improvements
2. **Milestone 4b (Weather & Travel):** Independent rules system, no dependencies
3. **Milestone 3 (Shared Awareness):** Map system and route editor (depends on Milestone 5 for PMTiles)
4. **Milestone 6 (Session Prep):** All four sub-systems can be developed in parallel

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

Update all three when a milestone is completed or status changes.
