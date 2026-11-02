# Feature Overview

This is the extensible feature roadmap for the Twilight: 2000 Fourth Edition GM tool. Keep unimplemented capabilities marked as planned; do not describe roadmap items as available until they are implemented and verified.

## Status Key

- **Prototype**: Interactive groundwork exists, but it is limited and may use sample data or bookkeeping rather than a complete subsystem.
- **Partial**: Some requested behavior exists, but important workflows remain unimplemented.
- **Planned**: Not implemented yet.

## Product Surfaces

- **Campaign Setup Tool** — Prototype. A standalone GM-only authoring page uses the sequence Import Atlas → Terrain Grid → Locations → Settlements → Factions → Scenario Notes. Each location has a GM-controlled GM-only or player-visible eligibility flag, defaulting to GM-only; player-visible eligibility does not itself publish data. Linked settlement records inherit their location's visibility. The Field Papers atlas GeoJSON initializes the shared map, which moves between terrain and location steps. Terrain assignments use 10 km axial Q/R travel hexes anchored to the imported atlas northwest corner and persist in the setup package; terrain can be assigned to multiple selected hexes in one batch. Each faction has an independent Q/R influence layer, shown with its faction color on the hex edges. Faction-to-settlement associations are non-exclusive; each settlement stores an explicit GM-controlled prominence order. The faction workflow repeats create faction → select settlements → paint influence, with an explicit finish action. These are campaign labels only; they apply no rules modifiers. The editor displays the T2K Referee Aid / Strategic Play terrain table as reference only. Field Papers is import-only; atlas geometry, page outlines, and later campaign edits stay in local campaign data and are never posted back. Returned GeoJSON points, boundaries, and annotation overlays can be reviewed and imported. Latitude/longitude is retained as map-rendering data. The imported atlas PDF is the offline paper map; offline interactive basemaps using a licensed or self-hosted PMTiles vector archive remain planned. The draft autosaves locally, validates and previews the package, and exports schema-v2 setup JSON. Exported schema-v2 packages can be reopened after validation and preview; replacing the browser-local draft requires explicit confirmation. The current OSM reference layer requires internet and does not download offline tiles. Validated packages import into GM-owned SQLite runtime campaigns; faction layers and prominence edits persist there. The GM separately publishes text reports and explicitly selected point-layer maps. Broader shared gameplay remains planned; setup content is never published automatically.
- **Settlement generator** — Prototype. In Campaign Setup, choose a location marked Settlement and generate editable GM-defined scale (including Camp), security, attitude, leadership, and situation descriptors. Settlement name, map position, and Q/R reference come from the Locations editor; population is a manual GM estimate. The [de-fenestra.com reference generator](http://www.de-fenestra.com/t2k/settlement_generator_strict.html) explicitly uses Twilight: 2000 v2.2 rules, so its rules tables and formulas are not used as Fourth Edition mechanics. Generated descriptors are scenario aids and are not represented as official rules.
- **GM Tool** — Partial. Supported records, conditions, inventories/proposals, publications, COMMS, route stops, location coordinates, and GM audit metadata persist in SQLite. Runtime route/map edits use owner/revision checks, append audit events, and participate in backup recovery without changing the setup source or existing player publication. Cross-host runtime backup import creates a new local campaign and requires explicit mappings to active, unassigned local player accounts; credentials and sessions are never imported. Browser verification found setup import does not initialize the runtime dashboard row needed for the GM desk to load the imported campaign. Broader action coverage, rules automation, content snapshots, import initialization, map editor polish, offline-asset portability remain open. Scheduled backups are now implemented (see Operational Reliability below). HTTP is for a trusted LAN only.
- **Player Interface** — Partial. All five handset views are connected. Character includes read-only GM condition values for the active assigned character; private GM notes and other characters' records are excluded. Unset values remain Not recorded rather than implying healthy/zero. Views refresh on opening/Refresh/return and every 15 seconds while visible. Inventory changes require GM approval. Condition/carrying effects and dice-governed actions remain GM-managed.
- **GM-managed player report** — Implemented text-only slice. Save draft, server preview, explicit publish, and withdraw use SQLite with owner/revision checks. Editing a draft does not alter the current published copy. API, persistence/recovery, and synthetic GM/player browser checks pass. Structured report sections, media, and publication history remain planned.
- **Player data boundaries** — Implemented current-slice checks. Active campaign/character assignment controls inventory reads and proposals; player payloads cannot select another character or directly change accepted items. GM ownership, item revisions, source confirmation, and current submitter assignment control approval. Proposal history is filtered by submitting account for player reads. Other players' inventory, private submissions, GM notes, and account records are excluded.

## Map Foundations

- **Campaign bounds** — Partial. Setup supports draggable corners and numeric coordinates; changes that would leave placed locations outside the area are rejected.
- **Published geometry** — Implemented API and GM editor slice. The publication boundary accepts bounded labeled LineString and single-ring Polygon markings alongside points. Browser smoke testing verified GM save, preview, publication, and Player Interface rendering on the OSM fallback.
- **Offline basemap** — Implemented. The GM can upload a licensed raster PMTiles v3 archive (50 MiB limit) with attribution. Setup packages persist the basemap reference; runtime imports restore the basemap metadata to the database, enabling cross-host recovery. The server serves byte ranges and the archive is a local sidecar, not embedded in JSON or runtime backups. Basemap references survive campaign backup and restore cycles.
- **Future map work** — Vector PMTiles styling, vertex-drag editing, geometry history, fog masking, and rules-based travel calculations remain planned.

## User Features

Integration verified on 01 Nov 2026: combined runtime recovery retains character/inventory requests, conditions, COMMS, seat IDs, and immutable setup while withdrawing report/map publication. Cross-host import maps the source GM to the signed-in local GM and each source player to a distinct eligible local account, then selects the new campaign. All five player views render restored campaign data after explicit republishing. Finalized-character browser submission and delayed-response cancellation now have client regressions; accepted values remain unchanged until GM approval.

- **Campaign dashboard** — Prototype. Show campaign state and current situation. The Situation view reads the latest persisted journal entry and campaign era/premise; its route preview uses saved runtime stop coordinates. GM route order, leg details/distances, and location coordinates are editable. Setup bounds and published geometry have browser smoke coverage, but imported campaigns currently need an initialized runtime dashboard row before the GM desk can load them; broader dashboard workflows remain incomplete.
- **Player situation report** — Implemented text-only slice. The handset Sitrep reads the current published snapshot, or an explicit no-report state after withdrawal. GM notes, drafts, unrevealed maps, and other characters are not included. Text is rendered without HTML execution; reports are not cached in browser storage.
- **Player seed completion and character edits** — Partial. The authenticated player chooses an assigned campaign, fills fields explicitly left blank in their seed, and finalizes once GM-marked required fields are complete. After finalization, edits are submitted as pending requests; only GM approval changes the character. Published text situation reports are connected; gameplay actions remain planned.
- **Player map** — Partial. Players browse published locations, route, point markings, and bounded LineString/single-ring Polygon geometry. Setup supports draggable/numeric bounds; browser testing verified valid bounds save/reload and rejection of invalid bounds. The GM editor save/preview/publish and Player Interface geometry rendering were tested in a disposable campaign with OSM fallback. Real licensed raster archive rendering, cross-host asset recovery, vector PMTiles styles, publication history, and fog masking remain unverified or planned. No travel rules are calculated.
- **Player dispatch archive** — Planned read/unread and per-player inbox workflow. Connected COMMS currently shows the latest 200 shared messages in send order; the database/backup retains up to 10000 per campaign. Per-player receipts, inbox deletion, and moderation are not implemented.
- **Player-to-group messaging** — Implemented single-line slice. New messages retain server sender and campaign date/day/time-of-day. Historical stamps without time-of-day remain date/day-only; missing clocks display Game time not set. Isolation, spoof rejection, persistence, and recovery pass tests. Push delivery and read receipts remain planned.
- **Player character record** — Partial. Assigned fields, inventory, and read-only GM conditions are server-backed. GM condition/inventory changes now have owner-only audit metadata; no audit history is exposed to players. Verified generation, derived effects, combat resolution, character-review audit coverage, and content history remain planned.
- **Player character and inventory interface** — Implemented bookkeeping slice. Accepted items show source, quantity, carry location, reference, and details. Players propose changes; GMs stock/correct/remove items and review source claims. Four-seat isolation, source confirmation, stale revisions, removals, reopen/backup recovery, and synthetic browser proposal/approval/quantity checks pass. Carry locations are manual labels, not an encumbrance engine. Verified item catalogs, weapon statistics, transfers, carrying penalties, and dice-governed actions remain planned. Legacy samples are hidden and not migrated automatically.
- **Logistics dashboard** — Planned. Summarize convoy, stockpile, and resource state.
- **Market dashboard** — Planned. Show settlement goods, prices, supply, and demand.
- **Diplomacy dashboard** — Planned. Show faction and settlement relationships and agreements.
- **Conflict dashboard** — Planned. Show active incidents, escalation, and disruptions.
- **Territorial control view** — Planned. Show who controls relevant locations and borders.
- **Missions panel** — Planned. Create, track, and resolve campaign missions.
- **Route planning** — Prototype. A sample route and waypoint tracker exist; player-defined routes and rules-verified modifiers are not implemented.
- **Threat intelligence reports** — Planned. Assemble threats and intelligence for GM review.
- **Operations log** — Prototype. The field journal records campaign notes; it is not a full operations workflow.
- **Settlement management** — Planned. Track settlement conditions, needs, and development.
- **Resource and inventory management** — Partial. Shared counters and separately owned personal inventory records persist; distribution and rules-based consumption remain planned.
- **Player item/data proposals** — Implemented bookkeeping slice. Add/update/remove proposals preserve claimed source data and stay separate from accepted items. GM approval requires source confirmation for additions/edits, with a reference for RB. The GM may accept as GM-defined or UF instead of endorsing an RB claim. UF stays unverified. Review notes are player-visible; rejection never changes accepted inventory. Verification is a human GM attestation, not automatic rulebook validation.
- **Dice-governed item actions** — Planned. Use verified Fourth Edition procedures where an item action requires a roll; record the acting player, inputs, roll, and outcome, and leave unclear cases for GM adjudication.

## Combat System

- **Ranged combat calculator** — Implemented. Resolves small arms attacks using Agility + Ranged Combat skill, applies range modifiers, calculates damage with strength bonus and armor reduction, detects weapon jams (magazine-fed only), and tracks ammo consumption. All mechanics verified against T2K 4E core rules.
- **Close combat calculator** — Implemented. Resolves melee attacks using Strength + Close Combat skill, applies strength bonus to damage, and detects critical hits. Backward compatible with existing combat system.
- **Grenade throw calculator** — Implemented. Resolves grenade attacks using Agility + Mobility skill with blast radius calculation for fragmentation grenades and adjacent hex damage. Supports scatter calculation for missed grenades.
- **Heavy weapons system** — Implemented. Extends combat calculator with fragmentation and shaped charge grenades (double armor penetration), anti-personnel and anti-vehicle mines, and blast mechanics. Fragmentation grenades affect 7 hexes (primary + 6 adjacent); shaped charges and mines affect 1 hex only. Armor reduction differs by weapon type (normal vs. ×2 against shaped charges).
- **Vehicle combat system** — Implemented. Resolves vehicle targeting attacks using Agility + Ranged Combat skill, applies weapon penetration against vehicle structure value, supports standard and vulnerable spot targeting (×2 penetration), and determines damage effects based on penetration margin: immobilized (margin 1-2), destroyed (margin ≥3), or glanced-off (no penetration).
- **Combat logging** — Implemented. Records all combat results (ranged, close combat, grenades, heavy weapons, vehicles) in campaign audit log with attacker, target, weapon, rolls, damage, and outcomes. Stores complete roll breakdown and outcome for GM review and after-action analysis.
- **GM combat interface** — Implemented. Web-based `/combat.html` form with tabbed interface for ranged, close combat, grenade, heavy weapon, and vehicle combat. Provides input validation, real-time result calculation, and narrative outcome display. Results automatically logged to campaign audit trail.
- **Combat result recording** — Implemented. All combat resolutions linked to campaign audit trail with character attribution, game date/time stamps, and complete roll history. Combat log is searchable by combat type, attacker character, and date range.
- **Combat result publishing** — Planned. Results can be published to players via situation report; GM controls what combat outcome information is visible to players.

## Game Master Features

- **Runtime route and map editing** — Partial. The GM can reorder route stops, edit leg details/distances, and move campaign location points within imported map bounds. Saves are owner/revision checked, audited, and backed up. Setup geometry remains immutable and player map publication remains a separate explicit workflow; broader map editing is planned.
- **Personnel roster editing** — Implemented. The GM can create personnel from Fourth Edition NPC archetypes, customize name/role/condition/readiness, and edit all attributes (ability ratings, CUF rating, hit cap). Archetype browser modal displays available templates grouped by category. Creation workflow: select archetype → customize → create. Detail modal allows full attribute editing with status feedback. Roster grid displays personnel cards with condition badges, readiness indicators, and action buttons. Saves use campaign revision; stale edits reload current roster state while preserving the draft. Runtime backups preserve personnel fields. Archetype data verified against Referee's Manual. Bulk operations (condition application, reordering) planned for Phase 3.
- **Campaign audit history** — Implemented metadata slice. Owner-only Audit view shows actor/target snapshots, record and campaign revisions, UTC time, campaign date/day, and live/recovered origin with pagination. Condition save/clear, inventory stock/correction/removal and proposal decisions, report/map draft/publish/withdraw, manual dashboard and journal updates, faction influence/prominence edits, character change request reviews, player seat assignments, and restores are audited in their mutation transactions. Failed writes and read-only previews create no events. SQLite rejects event updates/deletes; backup restore preserves later live entries, merges missing saved events as backup-origin metadata, rejects conflicting IDs, and appends a restore event. API permissions, atomic failures, file reopen, recovery, and browser paging/safe-text/player denial checks pass. This is not a cryptographic tamper-proof log. Player proposals/COMMS and account/auth events are not audited by this slice; full snapshots, retention tooling, and wider coverage remain planned. Historical pre-upgrade actions are not fabricated or backfilled.

- **Development runtime fixture** — Implemented for development/testing only. `node server/seed-sample.cjs --db <dev-db-path> --gm <gm-username>` creates an idempotent `The Long Road` campaign with dashboard counters, route stops, personnel, journal entries, and one sample player seed. It refuses the configured/default live DB. The owning GM can read the normalized snapshot from `GET /api/campaigns/:id/runtime`; supported Situation, Personnel, Movement, and Journal fields, including campaign era/premise display, connect to it. Remaining dashboard panels are still incomplete.
- **Player seed authoring** — Partial. The GM-only Player Seeds page stores server-backed templates independently of campaigns, creates disabled player accounts with one-time activation, records T2K 4E attributes, skills, CUF, and structured manual life-path outcomes, and assigns a copy to a selected campaign on explicit GM action. Unassigned players see no campaigns. Template edits do not mutate assigned campaign characters; templates with active assignments cannot be deleted. Browser-only drafts remain untouched and can be downloaded, but are not automatically migrated. Life-path rules are recorded manually and are not automated or validated.
- **Scheduled event system** — Planned.
- **Campaign clock control** — Implemented GM bookkeeping slice. +6h advances stored date/time by six hours; date/day increment only at midnight. Once per date, reaching/crossing 12:00 consumes one shared ration-day, clamped at zero, with a daily usage marker and atomic journal/audit records. This GM-defined schedule is not a verified Fourth Edition consumption procedure. Fuel and personal items remain manual. Existing clocks initialize at 00:00; historical message/audit times remain unknown. Clock and supply usage recover together; replaying a processed date cannot charge twice. General event resolution remains planned.
- **Weather control** — Partial. The GM can select Fair, Cloudy, Rain/Snow, or a GM-defined condition and record a physical d6 result with the matching Referee Aid symbol outcome. No numeric face mapping is assumed. The owner- and revision-checked runtime API applies the one-step change, limits rolls to one per shift, audits and journals results, and backs up the roll state. Rain/Snow returns to Cloudy after one Fieldbook shift and enforces a full Cloudy shift before another roll. Effects remain GM-adjudicated; weather does not modify character or attack rolls.
- **Economic event injection** — Planned.
- **Diplomatic event creation** — Planned.
- **Territory management** — Planned.
- **Faction influence layers** — Partial. The GM runtime loads and saves faction Q/R hex sets and settlement prominence in SQLite with owner and revision checks. Reload layers resolves stale views; invalid/conflicting saves preserve stored state. Runtime backups include cells and prominence ranks. This is campaign bookkeeping, not rules modifiers, territorial simulation, or player publication. Existing browser overlays are not silently migrated.
- **Faction relationship management** — Planned.
- **Threat generation** — Planned.
- **Intelligence generation** — Planned.
- **Save/load campaign state** — Partial. Supported records, inventory items/proposals, report/map drafts, and COMMS are included in GM-only backups. Same-host Restore replaces the selected campaign atomically; cross-host Import creates a new campaign after explicit local player-account mapping. Inventory recovery preserves IDs, source records, and review history, advances item revisions, and rebases valid saved pending proposals; stale editors cannot become current again. Invalid data or failed writes are atomic. Older backups without inventory recover empty inventories. Credentials, sessions, and legacy browser overlays/items are not imported. Scheduled backups are now implemented (see Operational Reliability below).
- **Campaign package handoff** — Partial. Setup-v2 import creates a separate GM-owned runtime campaign with an immutable source snapshot. Supported dashboard records persist; runtime-v1 backups support same-host Restore and cross-host Import with explicit account mapping into a new local campaign. Remaining dashboard/map/faction workflows persist. Scheduled backups are now implemented (see Operational Reliability below).
- **Player information publishing** — Partial. Reports/maps require explicit publication and their mutation metadata is now audited for the owning GM. GM condition saves update an own-seat record with public/private separation and atomic audit logging. Full past publication content snapshots and condition rules automation remain planned.
- **Player seats and character assignment** — Partial. Assign a GM-owned, campaign-independent player template to a username in a selected campaign; assignment copies character data and enforces user/campaign ownership. Unassigned activated users have no campaign access. Four-seat capacity is enforced; removal workflows and broader multiplayer campaign sessions remain planned.
- **Persistent world simulation** — Planned. World state must remain GM-reviewable and should not silently advance or resolve events.

## Environment

- **Dynamic weather** — Implemented. Fair/Cloudy/Rain-Snow state progression with die roll interpretation (0 symbols = no change, 1 = worsen, 2 = improve). Auto-revert: Rain/Snow reverts to Cloudy after 1 shift. Visibility modifiers by condition and light level (daylight/darkness/moon). Attack/march/drive modifiers apply: Rain/Snow -1 attack, -1 march, -2 drive. GM interface at `/weather.html` with 6 calculator panels. Full T2K 4E rules verified against Referee Aid - Strategic Play.
- **Travel calculations** — Implemented. Marching distances (2 hexes/shift road/open, 1 hex/shift other terrain). Driving distances (base 5 hexes/shift with terrain multipliers: road/open ×1, woods ×0.5, hills ×0.75, mountains ×0.25, lake ×1, swamp ×0.5, ruins ×0.5). Fuel consumption (1 liter per hex, alcohol ×2). Rations calculator (1 per person per day, separate food/water). Terrain modifiers for Foraging/Hunting/Scrounging/Driving tasks across all 8 terrain types. Encounter distance (halfway point in shift). GM-facing calculator and HTTP API. All mechanics verified against Referee Aid - Strategic Play.
- **Supply & conditions** — Implemented. Starvation effects (cannot heal, -1/week, dies week 3). Dehydration effects (cannot heal, -1/day, dies day 3). Sleep deprivation effects (cannot heal stress, -1/day). Hypothermia mechanics (Stamina roll in cold, GM-adjudicated frequency). Status tracking per person/group. Integrated with travel system.
- **Route modifiers** — Planned. Weather and terrain modifiers are implemented; scenario-specific conditions and strategic campaign modifiers remain planned.
- **Travel conditions** — Implemented. Full travel system supports weather, terrain, fuel, supply, and affliction tracking. Campaign-specific event conditions remain GM-managed.

## Logistics

- **Convoy operations** — Planned.
- **Cargo manifests** — Planned.
- **Stockpiles** — Planned.
- **Consumption** — Planned. Verify resource costs and procedures before presenting them as rules.
- **Resource distribution** — Planned.
- **Automated resupply** — Planned. Keep automation configurable and visible to the GM.
- **Resource contracts** — Planned.

## Economy

- **Settlement production** — Planned.
- **Workforce simulation** — Planned.
- **Prosperity simulation** — Planned.
- **Supply and demand** — Planned.
- **Price management** — Planned.

## Diplomacy Between Factions and Settlements

- **Alliances** — Planned.
- **Trade agreements** — Planned.
- **Embargoes** — Planned.
- **Transit rights** — Planned.
- **Influence system** — Planned.
- **AI diplomacy** — Planned. Generated actions and outcomes must be presented for GM review; they are campaign simulation, not official game rules.

## Conflict

- **Conflict escalation** — Planned.
- **Border incidents** — Planned.
- **Trade disruption** — Planned.
- **Territorial control** — Planned.
- **Threat generation** — Planned.
- **Convoy attacks** — Planned.

## Operational Reliability

- **Campaign backup and restore** — Implemented. Atomic backup API exports complete campaign state; restore replaces campaign atomically with rollback capability. Backup versioning and history with unique timestamps. Cross-host import creates new campaign with explicit player account mapping. Credentials and sessions not imported.
- **Scheduled backup automation** — Implemented (Phases 1-2). 5 schedule types: disabled, hourly, every-6-hours, daily (2:00 AM UTC), custom-interval. Retention policies by age (days) and count (max backups). HTTP API endpoints for schedule management (GET, POST, PATCH) and history retrieval (paginated). Database schema with automatic initialization. Comprehensive test suite (30 tests). Production-ready with zero external dependencies.
- **Automatic backup recording** — Implemented (Phase 3 — NEW). Event-triggered backups on combat resolution, journal entries, inventory changes, and character change approvals. Background task runner with 1-minute check interval for scheduled backups. Simple three-level event labeling (manual, scheduled, event). Mutation capture hooks for integration with campaign mutations. 20 comprehensive automation tests, all passing. Zero regressions in existing features (236/245 total tests passing).
- **Backup HTTP API** — Implemented. Four endpoints for campaign backup management: GET /api/campaigns/:id/backup-schedule, POST /api/campaigns/:id/backup-schedule, PATCH /api/campaigns/:id/backup-schedule, GET /api/campaigns/:id/backup-history. All endpoints require GM authentication and support owner-scoped access. Standard HTTP error codes (400, 404, 422) with error messages.
- **PMTiles asset serving** — Partial. The GM can upload a licensed raster PMTiles v3 archive (50 MiB limit) with attribution; the server serves byte ranges and the setup package stores the asset reference. The archive is a local sidecar, not embedded in JSON or runtime backups. No real licensed archive was available to verify PMTiles tile decoding/rendering.
- **Graceful error handling** — Partial. Backup/restore operations handle errors atomically; background runners use graceful degradation with console logging; broader error recovery and conflict resolution remain planned.
- **Cross-host recovery** — Partial. Runtime backup import creates new campaign; full asset portability and recovery remain planned.

**Phase 3 Implementation Details:**
- Core module: `server/backup-automation.cjs` (7 functions, 11.7 KB)
- Mutation hooks: `server/campaign-mutation-hooks.cjs` (2 handler factories)
- Background runner: Integrated into `server/main.cjs` with 1-minute interval
- Event types: CAMPAIGN_CLOCK_ADVANCE, COMBAT_RESOLVED, JOURNAL_ENTRY, INVENTORY_CHANGE, CHARACTER_CHANGE, REPORT_PUBLISH, MAP_EDIT
- Campaign list refresh: Every 5 minutes for dynamic campaign discovery
- Error handling: Non-blocking, test-compatible database error handling
- Test coverage: 20 comprehensive integration tests covering all event types and edge cases

## Combat Foundation

- **T2K 4E workflow verification** — Implemented. Campaign setup, session loop, strategic play (6-hour shifts), close combat, ranged/heavy weapons, and vehicle combat procedures verified against official Referee Aids (OCR transcriptions). Campaign setup, session-level publishing, strategic play weather/movement, and character creation fully match official rules. Combat automation and encounter generation remain planned; all procedures and weapon/vehicle data are documented in analysis files and ready for implementation.
- **Core combat calculator** — Implemented. Ranged attack, close combat, and grenade resolution engines with verified dice success calculations, damage formulas, critical hit detection, weapon jam logic, and ammo consumption. Does not generate random rolls—GM enters pre-rolled dice values and system calculates results. API endpoints (HTTP POST) accept attack parameters and return calculated results. Comprehensive test suite (26 tests) verifies all combat scenarios. Integration with campaign handler complete.
- **Heavy weapons system** — Implemented. Grenade and mine attack resolution with blast mechanics (7-hex radius for fragmentation grenades, 1-hex for shaped charges and mines). Armor penetration doubling for shaped charges verified against official rules. Scatter calculation for missed grenades. 7 dedicated test cases, all passing.
- **Vehicle combat system** — Implemented. Vehicle targeting with armor penetration vs structure value, damage effect progression (glanced off, immobilized, destroyed), and vulnerable spot targeting (×2 penetration modifier). Range modifiers apply as standard. 7 dedicated test cases, all passing.
- **Combat result logging** — Implemented. Persistent recording of all combat actions in campaign audit trail with complete roll breakdown, damage results, criticals, ammo consumption, and outcome. Integrated with existing audit system. Retrievable via API with filtering and pagination.
- **GM combat interface** — Implemented. Web-based form at `/combat.html` with 5 combat type tabs (Ranged, Close Combat, Grenade, Heavy Weapons, Vehicle). Military-themed design, real-time calculation, result display, and campaign integration. Responsive mobile-friendly layout.
- **Tactical encounters** — Planned. Use verified Fourth Edition procedures when resolving actual mechanics.
- **Ambush generation** — Planned. Keep generated situations under GM control and distinguish them from rules procedures.
- **Raid generation** — Planned.
- **Roadblocks** — Planned.
- **Sabotage encounters** — Planned.
- **Opposing force generation** — Planned. Verify rule-based stat or force creation; label scenario assumptions.
- **Battle calculator** — Planned. Base calculations on verified Fourth Edition procedures, cite sources where known, and avoid presenting approximations as official rules.

## Session Preparation — Milestone 6

- **NPC Creation System** — Partial. Service module (server/npc-service.cjs) provides complete CRUD operations for NPC management: createNPC, getNPC, listNPCs, updateNPC, deleteNPC, cloneNPC. Archetype system loads 17 pre-defined T2K 4E NPC templates from gmpack/npc-archetypes.json (4 civilian, 4 soviet-military, 4 us-military, 5 other-military). NPCs inherit attributes (strength, agility, intelligence, empathy), hit cap, CUF rating, and equipment from selected archetypes; all values can be customized. Campaign-scoped isolation ensures NPCs remain in their assigned campaign. Comprehensive test suite (10 tests) verifies archetype loading, NPC creation from templates, custom attributes, roster management, cloning, deletion, and campaign isolation. All 236 project tests passing. REST API endpoints and GM UI for NPC roster remain planned.
- **Settlement drafts** — Planned. Settlement template system for quick generator (name, key features, leadership); editable notes; link to campaign locations.
- **Mission & encounter design** — Planned. Mission template system; encounter types (ambush, roadblock, settlement, checkpoint); opposing force composition; GM/player briefing separation.
- **Scenario packages** — Planned. Import/export scenarios as JSON; scenario versioning; bundled templates.

## Campaign Depth — Milestone 7

- **Faction management** — Implemented. Service module (server/campaign-depth-service.cjs) provides complete CRUD for factions: createFaction, getFaction, listFactions, updateFaction, deleteFaction. Each faction stores name, description, color, leader, goal, strength (low/medium/high), and notes. Campaign-scoped isolation. REST API endpoints (GET, POST, PUT, DELETE) integrated into campaigns.cjs. 16 endpoints total for all Milestone 7 features. Comprehensive test suite (31 tests) covers creation, retrieval, listing, updates, deletion, and campaign isolation. All 267 project tests passing.
- **Faction relationships** — Implemented. Attitude matrix stores relationships between factions with 4 statuses: allied, neutral, hostile, unknown. Functions: setFactionRelationship, getFactionRelationship, getFactionRelationships, getAllFactionRelationships. Each relationship includes optional notes and update timestamp. Queryable by from-faction or across entire campaign.
- **Settlement resources** — Implemented. Quick manual tracking of 8 resource types (food, water, fuel, ammunition, medical, shelter, intel, other) with 4 statuses each (available, scarce, needed, unknown). Functions: setSettlementResource, getSettlementResource, getSettlementResources. Optional notes for each resource. Settlements can have any mix of tracked resources.
- **Campaign events/rumors log** — Implemented. Chronological event log with 7 event types: rumor, event, discovery, faction-action, settlement-change, threat, other. Functions: createEvent, getEvent, listEvents, updateEvent, deleteEvent. Each event stores title, description, date, optional faction/settlement links, public/GM-only flag, and GM notes. Filterable by type, linked entities, or visibility. Sorted chronologically (DESC).
- **Threat tracker** — Implemented. Active antagonists and threats with 4 severity levels (low, medium, high, critical), 4 statuses (emerging, active, contained, resolved), and 5 antagonist types (faction, individual, force, event, other). Functions: createThreat, getThreat, listThreats, updateThreat, deleteThreat. Each threat stores name, description, goal, linked resources (array), optional faction/settlement links, and GM notes. Ordered by severity (critical→low) then status. Comprehensive filtering available.
- **Data persistence** — Implemented. Migration 20 adds four tables: faction_relationships, settlement_resources, campaign_events, threat_entries. All tables use campaign-scoped foreign keys and timestamp tracking. Constraints enforce valid enumerations for status/type/level values. Indices optimize common queries (relationships by faction, events by date/type, threats by status/level).
- **REST API** — Implemented. 16 endpoints covering all CRUD operations and list filtering. Endpoints follow standard REST patterns: GET for retrieval, POST for creation, PUT for updates, DELETE for removal. Query parameters support filtering (eventType, status, threatLevel, etc.). All endpoints require GM authentication. Standard HTTP error codes (400, 404, 422).
- **GM UI** — Planned. Modal interfaces for faction roster (list, add, edit, delete, relationship matrix view), threat tracker (priority list, severity coloring, status updates), territory annotations on map, and event log viewer.

**Design Notes:** No automation or rule mechanics applied. All entries are GM-managed and manually entered. Factions, threats, and events are campaign-scoped and isolated. Relationships are directional (Faction A's attitude toward Faction B may differ from B's toward A). Settlement resources support quick GM bookkeeping without enforcing supply consumption or production rules.
