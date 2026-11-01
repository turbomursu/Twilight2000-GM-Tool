# Feature Overview

This is the extensible feature roadmap for the Twilight: 2000 Fourth Edition GM tool. Keep unimplemented capabilities marked as planned; do not describe roadmap items as available until they are implemented and verified.

## Status Key

- **Prototype**: Interactive groundwork exists, but it is limited and may use sample data or bookkeeping rather than a complete subsystem.
- **Partial**: Some requested behavior exists, but important workflows remain unimplemented.
- **Planned**: Not implemented yet.

## Product Surfaces

- **Campaign Setup Tool** — Prototype. A standalone GM-only authoring page uses the sequence Import Atlas → Terrain Grid → Locations → Settlements → Factions → Scenario Notes. Each location has a GM-controlled GM-only or player-visible eligibility flag, defaulting to GM-only; player-visible eligibility does not itself publish data. Linked settlement records inherit their location's visibility. The Field Papers atlas GeoJSON initializes the shared map, which moves between terrain and location steps. Terrain assignments use 10 km axial Q/R travel hexes anchored to the imported atlas northwest corner and persist in the setup package; terrain can be assigned to multiple selected hexes in one batch. Each faction has an independent Q/R influence layer, shown with its faction color on the hex edges. Faction-to-settlement associations are non-exclusive; each settlement stores an explicit GM-controlled prominence order. The faction workflow repeats create faction → select settlements → paint influence, with an explicit finish action. These are campaign labels only; they apply no rules modifiers. The editor displays the T2K Referee Aid / Strategic Play terrain table as reference only. Field Papers is import-only; atlas geometry, page outlines, and later campaign edits stay in local campaign data and are never posted back. Returned GeoJSON points, boundaries, and annotation overlays can be reviewed and imported. Latitude/longitude is retained as map-rendering data. The imported atlas PDF is the offline paper map; offline interactive basemaps using a licensed or self-hosted PMTiles vector archive remain planned. The draft autosaves locally, validates and previews the package, and exports schema-v2 setup JSON. Exported schema-v2 packages can be reopened after validation and preview; replacing the browser-local draft requires explicit confirmation. The current OSM reference layer requires internet and does not download offline tiles. The GM Tool can load map and faction data from a validated package into a separate GM-only influence workspace; association and prominence edits are also live-GM-editable in browser-local state. Full runtime campaign import, shared live state, and actual player publication remain planned. Setup content is never published to players automatically.
- **Settlement generator** — Prototype. In Campaign Setup, choose a location marked Settlement and generate editable GM-defined scale (including Camp), security, attitude, leadership, and situation descriptors. Settlement name, map position, and Q/R reference come from the Locations editor; population is a manual GM estimate. The [de-fenestra.com reference generator](http://www.de-fenestra.com/t2k/settlement_generator_strict.html) explicitly uses Twilight: 2000 v2.2 rules, so its rules tables and formulas are not used as Fourth Edition mechanics. Generated descriptors are scenario aids and are not represented as official rules.
- **GM Tool** — Partial. Setup import creates an owner-linked SQLite runtime campaign. An idempotent development fixture supplies dashboard state, route stops, personnel, journal entries, and a sample player seed. The GM dashboard now reads runtime clock/resources, route, roster, and journal for the selected campaign; supported clock/resource, personnel, and journal edits persist through an owner-scoped API and increment the campaign revision. The map sketch and route definitions remain read-only/sample; general save/restore, the rest of the dashboard, player inventory, and player publication remain planned. HTTP is unencrypted and intended only for a trusted LAN.
- **Player Interface** — Partial. The authenticated player interface selects an assigned campaign and renders the server-owned character seed/record directly in the handset Character view. The player completes GM-left-blank seed fields, finalizes when required fields are complete, and can submit later field edits as pending proposals for GM approval. Sitrep, Inventory, COMMS, and Map quick-access tabs remain visible but inactive until their campaign data workflows are connected; shared campaign publication and gameplay remain planned.
- **GM-managed player report** — Planned. From the GM Tool, the GM can add, remove, edit, preview, publish, and withdraw information shown in the Player Interface.
- **Player data boundaries** — Planned. Each player can access their own assigned character and inventory only; the GM retains full campaign control. Enforce authorization in the data layer, not just the interface.

## User Features

- **Campaign dashboard** — Prototype. Show campaign state and current situation.
- **Player situation report** — Planned. Present the GM-published campaign situation to players without exposing GM-only notes or unrevealed state.
- **Player seed completion and character edits** — Partial. The authenticated player chooses an assigned campaign, fills fields explicitly left blank in their seed, and finalizes once GM-marked required fields are complete. After finalization, edits are submitted as pending requests; only GM approval changes the character. Live campaign situation and gameplay actions are not connected.
- **Player map** — Visual prototype. Players can scroll and zoom up to 200% across the full GM-published map, route, markings, and GM-set player position; opening the map and Reset view center on the player's position. Campaign maps are created in the Campaign Setup Tool; markings and position are managed in the GM Tool. Player map controls are read-only and do not calculate travel rules.
- **Player dispatch archive** — Visual prototype. Status labels stay in the message list, not the detail pane. The three newest unread arrivals show NEW, older unread messages show UNREAD, and selecting a message marks it READ. Delete removes only the player's local inbox copy and does not change the GM archive. Connected campaign publication and persistent per-player read state remain planned.
- **Player-to-group messaging** — Visual prototype. A player can compose a single-line message addressed to the GM and all players; the local preview records player name and campaign game time. Shared delivery across browsers remains planned.
- **Player character record** — Partial. The assigned campaign's server-owned seed and finalized character fields render in the Player Interface. Seed completion is direct; post-finalization edits remain pending until GM approval. The separate visual Skills and Condition handset prototype still uses local sample data; verified rules-backed character generation, inventory synchronization, condition publishing, and combat resolution remain planned.
- **Player character and inventory interface** — Visual prototype. Inventory shows Combat Gear, Backpack, and Tiny Items locations, keeps unassigned examples in a separate list, and includes the printed weapon-stat columns without fabricated entries. Inventory rows use RB, GM, or UF source labels; selecting an illustrative item updates its Personal Record; quantity steppers and item proposals persist in the local preview. Shared 1-4 player inventory management, verified item data, GM approval, and campaign synchronization remain planned. Carrying penalties remain unavailable until the rule procedure and required item/character data are verified.
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
- **Resource and inventory management** — Prototype. Basic shared food and fuel counters exist; structured personal inventories and distribution do not.
- **Player item/data proposals** — Visual prototype. Players can enter a proposed item or item-data change with an RB (rule book), GM (GM-defined), or UF (unverified) source category and optional reference; the local preview marks it pending and does not change accepted inventory. The category is a claim until the GM verifies and accepts it.
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
- **Faction influence layers** — Prototype. Assign separate, overlapping per-faction 10 km axial Q/R hex layers in Campaign Setup and edit them in the GM-only local influence workspace. A faction may influence multiple settlements; the GM assigns prominence order per settlement in Setup and live play. Faction colors mark hex edges; these campaign records have no rules effects and are not published to players. Shared multi-user editing and territorial-control simulation remain planned.
- **Faction relationship management** — Planned.
- **Threat generation** — Planned.
- **Intelligence generation** — Planned.
- **Save/load campaign state** — Partial. Browser-local autosave and JSON export exist; explicit load, import, and robust backup workflows are not implemented.
- **Campaign package handoff** — Partial. The GM can export schema-v2 setup JSON and import it through the authenticated API as a distinct runtime campaign with an immutable source snapshot, checksum, and GM ownership. The GM map workspace can select and reload imported campaigns. Binding the rest of the dashboard to runtime state and runtime save/restore remain planned.
- **Player information publishing** — Planned. Control player-visible report content from the GM Tool and make publication status visible to the GM.
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
