# Feature Overview

This is the extensible feature roadmap for the Twilight: 2000 Fourth Edition GM tool. Keep unimplemented capabilities marked as planned; do not describe roadmap items as available until they are implemented and verified.

## Status Key

- **Prototype**: Interactive groundwork exists, but it is limited and may use sample data or bookkeeping rather than a complete subsystem.
- **Partial**: Some requested behavior exists, but important workflows remain unimplemented.
- **Planned**: Not implemented yet.

## Product Surfaces

- **Campaign Setup Tool** — Prototype. A standalone GM-only authoring page uses the sequence Import Atlas → Terrain Grid → Locations → Settlements → Factions → Scenario Notes. Each location has a GM-controlled GM-only or player-visible eligibility flag, defaulting to GM-only; player-visible eligibility does not itself publish data. Linked settlement records inherit their location's visibility. The Field Papers atlas GeoJSON initializes the shared map, which moves between terrain and location steps. Terrain assignments use 10 km axial Q/R travel hexes anchored to the imported atlas northwest corner and persist in the setup package; terrain can be assigned to multiple selected hexes in one batch. Each faction has an independent Q/R influence layer, shown with its faction color on the hex edges. Faction-to-settlement associations are non-exclusive; each settlement stores an explicit GM-controlled prominence order. The faction workflow repeats create faction → select settlements → paint influence, with an explicit finish action. These are campaign labels only; they apply no rules modifiers. The editor displays the T2K Referee Aid / Strategic Play terrain table as reference only. Field Papers is import-only; atlas geometry, page outlines, and later campaign edits stay in local campaign data and are never posted back. Returned GeoJSON points, boundaries, and annotation overlays can be reviewed and imported. Latitude/longitude is retained as map-rendering data. The imported atlas PDF is the offline paper map; offline interactive basemaps using a licensed or self-hosted PMTiles vector archive remain planned. The draft autosaves locally, validates and previews the package, and exports schema-v2 setup JSON. Exported schema-v2 packages can be reopened after validation and preview; replacing the browser-local draft requires explicit confirmation. The current OSM reference layer requires internet and does not download offline tiles. Validated packages import into GM-owned SQLite runtime campaigns; faction layers and prominence edits persist there. The GM separately publishes text reports and explicitly selected point-layer maps. Broader shared gameplay remains planned; setup content is never published automatically.
- **Settlement generator** — Prototype. In Campaign Setup, choose a location marked Settlement and generate editable GM-defined scale (including Camp), security, attitude, leadership, and situation descriptors. Settlement name, map position, and Q/R reference come from the Locations editor; population is a manual GM estimate. The [de-fenestra.com reference generator](http://www.de-fenestra.com/t2k/settlement_generator_strict.html) explicitly uses Twilight: 2000 v2.2 rules, so its rules tables and formulas are not used as Fourth Edition mechanics. Generated descriptors are scenario aids and are not represented as official rules.
- **GM Tool** — Partial. Supported records, character conditions, inventories/proposals, publications, and COMMS persist in SQLite. The GM edits/clears per-character condition records with separate public and private notes, and manages inventory/source review. Backups advance condition/item revisions; report/map publications remain withdrawn after restore. Rules automation, full audit history, source map editing, and cross-host recovery remain planned. HTTP is for a trusted LAN only.
- **Player Interface** — Partial. All five handset views are connected. Character includes read-only GM condition values for the active assigned character; private GM notes and other characters' records are excluded. Unset values remain Not recorded rather than implying healthy/zero. Views refresh on opening/Refresh/return and every 15 seconds while visible. Inventory changes require GM approval. Condition/carrying effects and dice-governed actions remain GM-managed.
- **GM-managed player report** — Implemented text-only slice. Save draft, server preview, explicit publish, and withdraw use SQLite with owner/revision checks. Editing a draft does not alter the current published copy. API, persistence/recovery, and synthetic GM/player browser checks pass. Structured report sections, media, and publication history remain planned.
- **Player data boundaries** — Implemented current-slice checks. Active campaign/character assignment controls inventory reads and proposals; player payloads cannot select another character or directly change accepted items. GM ownership, item revisions, source confirmation, and current submitter assignment control approval. Proposal history is filtered by submitting account for player reads. Other players' inventory, private submissions, GM notes, and account records are excluded.

## User Features

- **Campaign dashboard** — Prototype. Show campaign state and current situation.
- **Player situation report** — Implemented text-only slice. The handset Sitrep reads the current published snapshot, or an explicit no-report state after withdrawal. GM notes, drafts, unrevealed maps, and other characters are not included. Text is rendered without HTML execution; reports are not cached in browser storage.
- **Player seed completion and character edits** — Partial. The authenticated player chooses an assigned campaign, fills fields explicitly left blank in their seed, and finalizes once GM-marked required fields are complete. After finalization, edits are submitted as pending requests; only GM approval changes the character. Published text situation reports are connected; gameplay actions remain planned.
- **Player map** — Implemented point-layer slice. Players browse the published map using Leaflet, zoom up to 200%, and reset centered on the GM-set position. Only selected location names/kinds/positions, GM point markings, and ordered selected-location waypoints are included. GM selection can deliberately reveal a source GM-only location; eligibility alone never publishes it. Public OSM geography remains visible independently of campaign-layer selections. Offline basemaps, line/polygon markings, publication history, and fog masking remain planned. Four-seat API, recovery, and synthetic browser checks pass; no travel rules are calculated.
- **Player dispatch archive** — Planned read/unread and per-player inbox workflow. Connected COMMS currently shows the latest 200 shared messages in send order; the database/backup retains up to 10000 per campaign. Per-player receipts, inbox deletion, and moderation are not implemented.
- **Player-to-group messaging** — Implemented single-line slice. Players broadcast up to 240 characters to the GM and all active campaign seats; GMs can reply. Sender label/role and campaign date/day are server-stamped and persist unchanged. Missing clock data displays Game time not set; no HH:MM is invented. Four-seat isolation/spoofing, validation, archive bounds, persistence/recovery, and synthetic player/GM browser checks pass. Push delivery and read receipts remain planned.
- **Player character record** — Partial. Assigned fields, inventory, and read-only GM conditions are server-backed. Conditions include manual damage/stress, CUF text, radiation values, nullable flags, injuries/diseases, and public notes. GM save immediately updates the own-seat projection, without exposing private GM notes. Four-seat privacy, stale saves, clearing, persistence/recovery, and synthetic browser checks pass. Verified generation, derived capacities/penalties, combat resolution, and full audit history remain planned.
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

## Game Master Features

- **Development runtime fixture** — Implemented for development/testing only. `node server/seed-sample.cjs --db <dev-db-path> --gm <gm-username>` creates an idempotent `The Long Road` campaign with dashboard counters, route stops, personnel, journal entries, and one sample player seed. It refuses the configured/default live DB. The owning GM can read the normalized snapshot from `GET /api/campaigns/:id/runtime`; the dashboard UI is not connected yet.
- **Player seed authoring** — Prototype. The standalone Player Seeds page stores GM-created templates in browser-local storage and now records career terms as structured manual entries, including skill advances, promotion, specialty, aging, war-check, and outcome fields. Existing free-text career notes are preserved during schema-v1 to v2 migration. It does not automate or validate Fourth Edition life-path procedures and is not connected to the authenticated seed APIs.
- **Scheduled event system** — Planned.
- **Campaign clock control** — Prototype. The campaign day can be advanced manually; scheduling and event resolution are not implemented.
- **Weather control** — Prototype. The GM can cycle sample weather labels; this does not model a verified weather procedure.
- **Economic event injection** — Planned.
- **Diplomatic event creation** — Planned.
- **Territory management** — Planned.
- **Faction influence layers** — Partial. The GM runtime loads and saves faction Q/R hex sets and settlement prominence in SQLite with owner and revision checks. Reload layers resolves stale views; invalid/conflicting saves preserve stored state. Runtime backups include cells and prominence ranks. This is campaign bookkeeping, not rules modifiers, territorial simulation, or player publication. Existing browser overlays are not silently migrated.
- **Faction relationship management** — Planned.
- **Threat generation** — Planned.
- **Intelligence generation** — Planned.
- **Save/load campaign state** — Partial. Supported records, inventory items/proposals, report/map drafts, and COMMS are included in GM-only backups. Inventory restore preserves IDs, source records, and review history, advances item revisions, and rebases valid saved pending proposals; stale editors cannot become current again. Invalid data or failed writes are atomic. Older backups without inventory recover empty inventories. Cross-host recovery and scheduled backups remain planned; legacy browser overlays/items are not migrated.
- **Campaign package handoff** — Partial. Setup-v2 import creates a separate GM-owned runtime campaign with an immutable source snapshot. Supported dashboard records persist, and runtime-v1 backups can recover database-backed campaign rows on the same host. Remaining dashboard/map/faction workflows and cross-host recovery remain planned.
- **Player information publishing** — Partial. Reports/maps require explicit publication. GM condition saves immediately update a separate own-seat read-only record, with clear public/private note fields. Owner, active-seat, hidden-record, revision, clear/withdrawal, and recovery checks pass. Condition rules automation and an audit/history view remain planned.
- **Player seats and character assignment** — Partial. Assign one seed to a username per campaign, activate new accounts with one-time tokens, and enforce user/campaign ownership on seed APIs. The four-seat capacity is enforced; full seat management and broader multiplayer campaign sessions remain planned.
- **Persistent world simulation** — Planned. World state must remain GM-reviewable and should not silently advance or resolve events.

## Environment

- **Dynamic weather** — Planned. Separate GM-controlled weather state from any verified rules procedure.
- **Route modifiers** — Planned. Verify any rules-based movement or travel effects against Fourth Edition sources; keep campaign-specific conditions separate.
- **Travel conditions** — Planned. Support GM-managed conditions and clearly label any unverified interpretation.

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

## Combat Foundation

- **Tactical encounters** — Planned. Use verified Fourth Edition procedures when resolving actual mechanics.
- **Ambush generation** — Planned. Keep generated situations under GM control and distinguish them from rules procedures.
- **Raid generation** — Planned.
- **Roadblocks** — Planned.
- **Sabotage encounters** — Planned.
- **Opposing force generation** — Planned. Verify rule-based stat or force creation; label scenario assumptions.
- **Battle calculator** — Planned. Base calculations on verified Fourth Edition procedures, cite sources where known, and avoid presenting approximations as official rules.
