# Development Roadmap

This roadmap sequences the scope in [FEATURES.md](FEATURES.md) into deliverable stages. It is an order of work, not a release-date commitment; timing depends on implementation capacity and decisions noted below.

## Product Boundaries

The product has three connected surfaces over a shared, versioned campaign model:

- **Campaign Setup Tool:** GM-only authoring of initial campaign identity, premise, map, locations, factions, settlements, and scenario notes. Exports a portable, versioned setup package; it does not own evolving campaign state or publish player data.
- **GM Tool:** Authoritative runtime control surface. Imports a setup package to create the initial campaign state, owns all subsequent campaign changes, controls player publication, and manages live map markings, route, and player position.
- **Player Interface:** A browser-based surface for 1-4 separately identified players. Each player sees the GM-published situation report and their assigned character and personal inventory. The GM adds, removes, edits, previews, publishes, or withdraws report information through the GM Tool.

Keep a setup package distinct from a running campaign save. Importing setup data creates a new initial runtime state; later changes belong to the GM runtime and do not rewrite the setup package. Setup notes and other GM-only content are never published automatically. Keep GM-only notes, unrevealed state, and other players' private data outside each player's view. Enforce identity, character ownership, and permissions at the authoritative data boundary. **Initial deployment decision:** run the authoritative service on a GM-controlled Raspberry Pi or laptop on the local network, with browser clients connecting over LAN using plain HTTP. Store runtime campaign state in SQLite on that host; retain versioned JSON for setup-package exchange and backups. HTTP is unencrypted, so the service must remain on a trusted LAN and must not be exposed to the internet or untrusted networks. Remote hosting is out of initial scope and requires a separate deployment and security decision if added later.

## Current Baseline

The GM Tool remains a single-file browser prototype with sample dashboard data, fixed route sketch, personnel and resource counters, field journal, browser-local autosave, and JSON export. The HTTP LAN service authenticates GM sessions and provides owner-scoped campaign import/list/detail APIs over SQLite. Importing a validated schema-v2 package creates a new runtime campaign, assigns the importing GM, and retains the source package and checksum; the GM interface can select its map and faction workspace. The sample dashboard and live influence edits are still browser-local and are not views over the runtime database. Player publication, player seats, and shared player data are not implemented. The standalone Campaign Setup Tool remains the package authoring surface. The radio-handset Player Interface is still a visual prototype with local inventory/messaging previews and a schematic map, not connected to campaign data.

## Delivery Principles

- Treat Fourth Edition rules as authoritative wherever a feature models an actual game mechanic. Verify each mechanic against an authoritative source before implementation; keep unverified behavior GM-managed and labeled.
- Keep rules logic, campaign-specific data, GM rulings, and AI-generated proposals separate.
- Make consequential simulations and generated material visible and reviewable by the GM; do not silently advance or resolve the world.
- Preserve campaign data through versioned save/load and validated import/export before growing the number of interdependent entities.
- Treat the campaign setup package as an explicit, validated handoff into the GM runtime; do not use the player interface as another editor for campaign state.
- Publish player-facing information from an explicit GM-controlled projection, not directly from internal campaign data.
- Keep the interface clear, low-scroll, and inspired by field communications equipment. Do not create mobile-specific layouts unless explicitly requested.
- Update status in `FEATURES.md` as capabilities move from planned to prototype, partial, and implemented.

## Phase 0: Foundations

**Goal:** Replace prototype-only assumptions with a testable, extensible base before adding interconnected systems.

- Build a modular browser client and authoritative shared-data service for the GM-hosted LAN deployment; the static-file prototype cannot safely support separate GM and player sessions or enforce ownership. Use SQLite on the host for runtime persistence, with server-side authentication and authorization.
- Split the current single HTML file into maintainable presentation, interaction, and domain modules as part of the selected approach.
- Define versioned campaign setup and runtime-save schemas with stable IDs for characters, NPCs, locations, settlements, factions, routes, resources, missions, events, messages, and journal entries; use the [Phase 0 data model draft](DATA_MODEL.md) as the working contract for schemas, player projection, and access rules.
- Define a player-facing projection and explicit visibility/publication state, separate from GM-only campaign fields.
- Define GM and player roles, 1-4 player seats, character ownership, per-player inventory permissions, and server-side authorization rules.
- Implemented slice: GM assigns at most one player seed per user per campaign; new users activate with a single-use token, choose the campaign, complete only GM-left-blank fields, and finalize required fields. Keep broader inventory and live-campaign permissions in scope.
- Define an auditable action record for dice-governed inventory changes, without encoding unverified game procedures.
- Separate campaign state and scenario data from rules procedures and GM rulings.
- Establish automated checks for data logic, persistence, and core workflows.

**Exit checks:** A campaign can be serialized, validated, and round-tripped without losing or silently changing data; invalid imports are rejected with actionable errors.

## Phase 1: Campaign Setup and Package Handoff

**Goal:** Let a GM create a campaign in the setup tool and transfer it safely into the GM runtime.

- Build the Campaign Setup Tool's manual path for campaign identity, premise, initial locations, settlements, factions, and scenario notes; create settlements before factions.
- Add GM-managed visibility eligibility to locations, defaulting to GM-only; never treat an eligibility flag as publication. Linked settlement visibility follows its source location, and the player-facing projection will require a separate explicit GM publication workflow.
- Add a GM-reviewed settlement draft generator based on locations marked Settlement. Keep names and coordinates sourced from the Locations step, include Camp as a GM-defined scale label, leave population manual, and keep generated descriptors explicitly GM-defined unless verified against Fourth Edition sources; do not reuse the referenced v2.2 generator's rules tables or formulas.
- Make Field Papers atlas GeoJSON the first map input. Restore its area/page extents, then use a dedicated Terrain Grid step before initial location entry. Store GM terrain labels in 10 km axial Q/R travel hexes anchored to the imported atlas northwest corner, using the T2K Referee Aid / Strategic Play terrain reference; display the values without applying modifiers. Use the same map in the read-only Locations view, where locations receive Q/R references and retain latitude/longitude for rendering. Treat Field Papers as import-only; keep map edits in campaign data and never post them back. Keep the current online OSM layer as a reference view with attribution. Add offline interactive basemaps as a separate, licensed or self-hosted PMTiles vector asset plus its style and attribution; package/recover that asset without conflating it with editable GeoJSON. Do not bulk-download public OSM tiles. Keep live markings, published route, and player position under GM runtime control.
- Support batch painting of terrain labels and separate, overlapping per-faction influence cell sets on the 10 km axial Q/R grid. Let each faction link to multiple settlements and store a GM-chosen prominence order per settlement; edit those relationships and ranks in Setup and the GM-local live workspace. Use faction colors on influence hex edges; keep these records separate from rules effects and unpublished by default.
- Export a versioned, portable setup package; validate and preview a package before importing it into the GM Tool.
- Import validated schema-v2 setup packages atomically through the authenticated GM API into new SQLite runtime campaigns; retain the exact source snapshot and assign GM ownership. The current influence workspace can select the imported map and faction data, but the sample dashboard is not yet a runtime-state view. Keep scenario notes GM-only and never publish imported setup content automatically.
- Keep setup-package export/import separate from runtime campaign save/load and backup.
- Treat imported setup content as initial state only; do not auto-publish setup notes or other content to players.
- Assign one player seed to a user per campaign. For new users, issue a single-use activation token; let the player choose an assigned campaign, complete only blank GM-designated fields, and finalize only after required fields are complete. Enforce ownership and finalization on the server.
- In progress: the API creates owner-linked initial runtime state and the GM map selector reloads imported packages. Bind the dashboard and subsequent edits to that runtime state before treating campaign initialization as complete.
- Define explicit error handling for malformed, unsupported, or duplicate package data.
- Make unsaved or failed persistence states visible.

**Exit checks:** A GM can author a setup package, inspect it, import it into a clean GM runtime, and confirm the expected initial campaign state. Runtime changes do not rewrite the source package, and no content becomes player-visible until the GM explicitly publishes it. Invalid packages fail without partially changing or destroying existing campaign data.

## Phase 2: Characters and AI-Assisted Campaign Setup

**Goal:** Add verified character/NPC creation and optional AI assistance to campaign authoring.

- Add player-character and NPC creation to the appropriate GM authoring/runtime workflows, using verified Fourth Edition procedures wherever applicable.
- Cite the relevant book and page or section in original, concise language; distinguish optional, house-ruled, and GM-managed fields.
- Add AI-assisted campaign setup as a draft workflow: review, edit, accept, or discard generated material before it enters a setup package.
- Provide a manual campaign-creation path so this workflow remains usable without an AI service.
- Decide how AI requests are handled without exposing provider secrets in a browser client; keep the provider replaceable.

**Exit checks:** Character/NPC outputs pass source-checked examples; generated campaign material cannot enter a package without GM confirmation; user data is not sent to an AI service without an explicit configured path.

## Phase 3: GM Runtime and Player Situation Report

**Goal:** Make the imported campaign operable and give the GM explicit control over the player-facing report.

- Turn the existing dashboard, clock, journal, roster, route, and resource counters into views over imported campaign state rather than separate sample state.
- Complete runtime save/load, autosave, backup, and recovery workflows for the running campaign.
- Add a Player Interface situation report backed only by a deliberately constructed player-visible projection.
- Let the GM publish the Setup Tool map with GM-managed markings, route, and player position. Give players scroll access and zoom up to 200%, with map open/reset centered on their position, without allowing them to change campaign map state.
- Allow players to send a single-line COMMS message to the GM and all player seats; record player identity, campaign game time, and message content.
- Support 1-4 authenticated player seats, each assigned one character and an independent browser session.
- Show each player only their own character and inventory, alongside GM-published situation information.
- From the GM Tool, let the GM add, remove, edit, preview, publish, and withdraw report information; show whether changes are drafts or published.
- Keep GM notes, hidden threats, unrevealed state, and other players' private data out of player-facing output by default.
- Allow players to submit change requests only for their own assigned character and inventory. Keep requests pending until the GM reviews and applies them; route dice-governed actions through the rules-verified item-action workflow planned in Phase 4.
- Implemented slice: finalized character-field edits are submitted by the assigned player as one pending request per character; the GM can approve or reject it. Broader character/inventory changes and shared player runtime remain in progress.
- Record publication revisions so the GM can tell what players have been shown.
- Add missions and a campaign event ledger as GM-managed runtime records.

**Exit checks:** Verify one-player and four-player campaigns, independent browser sessions, and blocked cross-player/GM-only access. Players can scroll/zoom the full published map but cannot modify map, markings, route, or position state. Character and inventory requests never change accepted state before GM approval. COMMS messages preserve sender and game time and reach the GM and all player seats. GM changes appear in the player report only after publishing; withdrawn information disappears. Runtime recovery does not unexpectedly alter published content or player ownership.

## Phase 4: Environment, Routes, and Logistics

**Goal:** Replace fixed demonstration values with campaign-managed travel and supply records.

- Add editable locations, route legs, waypoints, travel conditions, and weather state.
- Implement route modifiers only after Fourth Edition procedures are verified; otherwise label them as GM-entered campaign conditions.
- Add convoy operations, cargo manifests, inventories, stockpiles, consumption, and resource distribution.
- Add player-owned character inventories and item actions. Implement dice-governed procedures only after verification against authoritative Fourth Edition sources; record inputs, roll, and outcome, and send ambiguous cases to the GM.
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
