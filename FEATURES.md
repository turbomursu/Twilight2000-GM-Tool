# Feature Overview

This is the extensible feature roadmap for the Twilight: 2000 Fourth Edition GM tool. Keep unimplemented capabilities marked as planned; do not describe roadmap items as available until they are implemented and verified.

## Status Key

- **Prototype**: Interactive groundwork exists, but it is limited and may use sample data or bookkeeping rather than a complete subsystem.
- **Partial**: Some requested behavior exists, but important workflows remain unimplemented.
- **Planned**: Not implemented yet.

## Product Surfaces

- **Campaign Setup Tool** — Planned. A GM-operated authoring surface for creating a campaign and exporting a portable, versioned campaign package.
- **GM Tool** — Prototype. The current dashboard is the beginning of the runtime surface; it will import setup packages and manage the live campaign.
- **Player Interface** — Visual prototype. A standalone radio-handset layout has Situation, Inventory, Character, and Dispatches quick access with a separate, versioned browser-local preview store; it is not connected to campaign data. The planned browser interface supports 1-4 players with separate assigned characters and personal views, showing only information selected for publication by the GM.
- **GM-managed player report** — Planned. From the GM Tool, the GM can add, remove, edit, preview, publish, and withdraw information shown in the Player Interface.
- **Player data boundaries** — Planned. Each player can access their own assigned character and inventory only; the GM retains full campaign control. Enforce authorization in the data layer, not just the interface.

## User Features

- **Campaign dashboard** — Prototype. Show campaign state and current situation.
- **Player situation report** — Planned. Present the GM-published campaign situation to players without exposing GM-only notes or unrevealed state.
- **Player map** — Visual prototype. Players can scroll and zoom up to 200% across the full GM-published map, route, markings, and GM-set player position; opening the map and Reset view center on the player's position. Campaign maps are created in the Campaign Setup Tool; markings and position are managed in the GM Tool. Player map controls are read-only and do not calculate travel rules.
- **Player dispatch archive** — Visual prototype. Status labels stay in the message list, not the detail pane. The three newest unread arrivals show NEW, older unread messages show UNREAD, and selecting a message marks it READ. Delete removes only the player's local inbox copy and does not change the GM archive. Connected campaign publication and persistent per-player read state remain planned.
- **Player-to-group messaging** — Visual prototype. A player can compose a single-line message addressed to the GM and all players; the local preview records player name and campaign game time. Shared delivery across browsers remains planned.
- **Player character record** — Visual prototype. Record, Skills, and Condition tabs cover identity and backstory; attributes and all twelve skills display ratings with derived base dice; specialties, experience, condition tracks, capacities, CUF, armor locations, injuries, diseases, conditions, and radiation are represented. Unit morale is labeled as shared group state. A versioned browser-local store contains concise Players' Manual reference tables for ratings/dice, skill associations, capacity formulas, carry locations, and weapon fields, alongside character values and pending requests. GM review, delivery, and campaign synchronization remain planned.
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

- **Scheduled event system** — Planned.
- **Campaign clock control** — Prototype. The campaign day can be advanced manually; scheduling and event resolution are not implemented.
- **Weather control** — Prototype. The GM can cycle sample weather labels; this does not model a verified weather procedure.
- **Economic event injection** — Planned.
- **Diplomatic event creation** — Planned.
- **Territory management** — Planned.
- **Faction relationship management** — Planned.
- **Threat generation** — Planned.
- **Intelligence generation** — Planned.
- **Save/load campaign state** — Partial. Browser-local autosave and JSON export exist; explicit load, import, and robust backup workflows are not implemented.
- **Campaign package handoff** — Planned. Export from the Campaign Setup Tool and validate/import into the GM Tool; preserve a clear distinction between a setup package and a running campaign save.
- **Player information publishing** — Planned. Control player-visible report content from the GM Tool and make publication status visible to the GM.
- **Player seats and character assignment** — Planned. Create 1-4 player seats, assign one character per player, and support independent browser sessions with enforced ownership.
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
