# Fieldbook

A small, local-first game master desk for a Twilight: 2000 Fourth Edition campaign. This is an independent fan utility, not an official product.

## Run

The standalone prototype can still be opened directly from `index.html` for local evaluation, but direct file access bypasses server authentication and is not supported for GM player-seed management. Use the HTTP LAN service described below for login-gated access.

## Tests

Run the dependency-free test suite with `node --test`. Open static prototypes directly if desired; authenticated GM and player workflows, including Player Seeds, require the Node LAN service.

## LAN Auth API

The Node service enforces GM/player roles and campaign ownership. Conditions, inventories/proposals, supported campaign records, publications, and COMMS persist in SQLite. Players receive only their assigned character's public condition record; private GM notes are excluded. The GM manages condition and inventory state. Derived condition/carrying effects, verified item catalogs, and dice-governed actions remain unconnected. Node 24 or newer is required; HTTP defaults to port 8080 without encryption. Use only on a trusted LAN, never the internet or untrusted networks.

In PowerShell, configure a one-time bootstrap token before starting the service:

```powershell
$env:FIELDBOOK_BOOTSTRAP_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
node server/main.cjs
```

The first successful account bootstrap removes the stored bootstrap-token hash. Authentication routes include `POST /api/auth/bootstrap`, `POST /api/auth/activate`, `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout`; sessions use HttpOnly, SameSite=Strict cookies. GM user routes are `GET /api/users` and `POST /api/users`. GM player templates use `GET|POST /api/player-seeds` and `PUT|DELETE /api/player-seeds/:seedId`; creating a template can create a disabled player login and one-time activation token without assigning a campaign. Campaign routes include `POST /api/campaigns/import-setup`, `GET /api/campaigns`, `GET /api/campaigns/:id`, `GET /api/campaigns/:id/runtime`, `GET /api/campaigns/:id/character-changes`, and `POST /api/campaigns/:id/character-changes/:requestId/review`. GM seed assignment uses `POST /api/campaigns/:id/player-seeds` with a template ID; the server copies it into the campaign and enforces ownership and the four-seat limit. Player routes are `GET /api/player/campaigns`, `GET|PUT /api/player/campaigns/:id/character`, and `POST /api/player/campaigns/:id/character/finalize`. Set `FIELDBOOK_HOST`, `FIELDBOOK_PORT`, and `FIELDBOOK_DB_PATH` to override the listener and SQLite location.

## Runtime Sample Data

An opt-in development fixture creates a GM-owned `The Long Road` campaign with runtime dashboard state, route stops, four personnel records, journal entries, and one incomplete `sample-player` character seed. It is idempotent and preserves dashboard edits when rerun. The seeder refuses both the configured and default live database paths; use it only against a dedicated development database.

In PowerShell, point the service at a temporary database, create the first GM account through the browser, then stop the service with Ctrl+C. In the same PowerShell session, unset the guard variable and seed the database explicitly:

```powershell
$env:FIELDBOOK_DB_PATH = "$env:TEMP\fieldbook-dev.sqlite"
$env:FIELDBOOK_BOOTSTRAP_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
node server/main.cjs
# Create the GM account in the browser, then stop the server with Ctrl+C.
Remove-Item Env:FIELDBOOK_DB_PATH
node server/seed-sample.cjs --db "$env:TEMP\fieldbook-dev.sqlite" --gm "gm-user"
$env:FIELDBOOK_DB_PATH = "$env:TEMP\fieldbook-dev.sqlite"
node server/main.cjs
```

The command prints the runtime campaign ID and, when it creates the `sample-player` account, its one-time activation token. The GM dashboard snapshot is available to that campaign's owner at `GET /api/campaigns/:id/runtime`.

### Runtime Snapshot API

`GET /api/campaigns/:id/runtime` requires a signed-in GM who owns the campaign. It returns the campaign summary, dashboard counters/weather, ordered route stops, personnel, and journal; it returns `404` when the caller does not own the campaign or runtime dashboard state is absent. `PUT /api/campaigns/:id/runtime` accepts partial `dashboard` updates and replacement `personnel` or `journal` lists. Updates are validated and saved in one SQLite transaction, increment the campaign revision, and return the refreshed snapshot. Route definitions and map rendering are not editable through this endpoint.

```json
{
	"runtime": {
		"campaign": { "id": "...", "name": "The Long Road", "setting": "Dalarna, Sweden" },
		"dashboard": {
			"gameDate": "2000-05-11",
			"dayNumber": 14,
			"distanceKm": 86,
			"rationsDays": 6,
			"fuelUnits": 3,
			"weather": "Cold rain",
			"weatherNote": "...",
			"activeStopIndex": 1,
			"updatedAt": "..."
		},
		"route": [{ "ordinal": 0, "locationId": "...", "name": "Salen coast road", "detail": "Departure point", "kmFromPrevious": 0, "gridRef": "...", "mapPosition": { "lat": 60.79, "lng": 13.15 } }],
		"personnel": [{ "id": "...", "name": "Anja Lind", "role": "Medic", "condition": "Stable", "readiness": "Ready", "sortOrder": 0 }],
		"journal": [{ "id": "...", "title": "A light on the ridge", "body": "...", "entryDate": "2000-05-11", "kind": "Observation", "createdAt": "..." }]
	}
}
```

These are development/sample campaign values, not rules-derived results.

### Runtime Backup And Restore

For a loaded runtime campaign, use **Backup** in the GM dashboard to download GM-only JSON. **Restore** previews a selected backup's campaign, export time, checksum, and revision; replacement requires confirmation. Older backups require a second confirmation. The server validates the data and replaces campaign rows in one transaction; failed validation, ownership checks, or database writes leave existing data intact.

- `GET /api/campaigns/:id/backup` returns `{ "backup": ... }`. The downloaded document uses `backupType: "fieldbook.campaign-runtime"`, `schemaVersion: 1`, `campaignId`, `sourceRevision`, `exportedAt`, `data`, and `checksum`.
- `POST /api/campaigns/:id/restore` accepts `{ "backup": ..., "expectedRevision": 3, "confirmReplace": true, "confirmOlderBackup": false }`. The expected revision is captured when the restore dialog opens. A concurrent revision change returns `409`; invalid data or missing confirmation returns `422`; inaccessible campaigns return `404`.

Backups preserve database campaign rows, faction cells, settlement prominence ranks, characters, seats, and review requests. The immutable setup snapshot cannot change. Credentials and sessions are excluded, so referenced accounts must exist on the host. Old browser overlays are not automatically migrated or backed up. The SHA-256 checksum detects accidental modification, not authenticity or encryption. Keep these private files away from players and untrusted users.

Restore retains the saved revision as `restoredFromRevision` and advances the live revision to `max(currentRevision, sourceRevision) + 1`, preventing revision rollback. Scheduled backups and cross-host account recovery remain planned.

Report and map backups include saved drafts, not publication authorization. Restore withdraws both publications and advances their revisions; the GM must review and publish again. Older runtime-v1 backups without these optional records recover empty drafts. Invalid map references/coordinates and failed restores leave current drafts and publications unchanged.

### Faction Layers API

`GET /api/campaigns/:id/faction-layers` returns `{ "layers": { "campaignId": "...", "revision": 4, "influence": { "faction-id": ["1,-2"] }, "prominence": { "settlement-id": ["faction-id"] } } }` for the owning GM. Empty arrays are authoritative empty layers, not setup defaults.

`PUT` accepts either `{ "expectedRevision": 4, "factionId": "faction-id", "cells": ["1,-2"] }` or `{ "expectedRevision": 4, "settlementId": "settlement-id", "factionIds": ["faction-id"] }`. Each call atomically replaces only that target's records and advances the campaign revision. Hexes must be bounded axial integers; faction IDs must be unique and campaign-scoped. An empty list clears that layer/association. Responses: `401` unauthenticated, `403` player role, `404` non-owner campaign, `409` stale revision, `422` invalid data.

**Save layer**, **Clear selected**, and prominence controls now save to SQLite. **Reload layers** discards staged hex selections and fetches authoritative state after conflicts. The setup source never changes. Old browser overlays are ignored for server campaigns; desired old edits must be recreated explicitly rather than silently overwriting SQLite.

### Situation Reports API

Select a runtime campaign in the GM toolbar. In **Situation**, use **Save draft**, **Preview draft**, **Publish**, or **Withdraw**. Preview saves pending edits first, then shows the server's allowed player fields. Publish is enabled after preview and disabled by further editing. The current published copy is displayed separately; saving a draft does not change it. Reload fetches the saved draft after a conflict.

- GM `GET /api/campaigns/:id/situation-report` returns `{ "report": { "campaignId": "...", "campaignRevision": 3, "revision": 2, "draft": { "title": "North road", "body": "Wait at the bridge.", "gameTime": "Day 14 / 08:00" }, "published": null, "publishedAt": null } }`.
- GM `PUT` accepts `{ "action": "draft", "expectedRevision": 2, "draft": { "title": "...", "body": "...", "gameTime": "..." } }`, or `preview`, `publish`, `withdraw` actions with `expectedRevision` and no draft. Preview returns `{ "preview": { ... }, "revision": 2 }` without changing publication. Mutations return the updated report and advance both report and campaign revisions.
- Only the owning GM may act. Unknown fields and excessive lengths are rejected. Title/body are required for publishing; limits are 160/12000/120 characters for title/body/game time. Stale report revisions return `409`; invalid content returns `422`; inaccessible campaigns return `404`. Mutations enforce same origin.
- Player `GET /api/player/campaigns/:id/situation-report` requires an active assigned seat and returns only `{ "report": { "title": "...", "body": "...", "gameTime": "..." }, "publishedAt": "..." }`, or both values `null` when unpublished/withdrawn. Player writes are rejected. No setup snapshot, GM notes, draft, inventory, or character data is included.

The handset **Sitrep** refreshes on opening, **Refresh**, returning to the page, and every 15 seconds while visible. Withdrawal becomes visible on the next successful refresh, not as an instantaneous push. Responses are `no-store`; reports are not stored in browser storage and clear on campaign changes or failed refreshes. Text is literal, not HTML. Publication history, push delivery, and structured sections remain planned.

### Map Publication API

Select a runtime campaign, then open **Player map** on the GM desk. Check the locations to reveal, add/reorder/remove route waypoints, add/edit/remove labeled point markings, and enter player latitude/longitude or choose a selected location. Use **Save map draft**, **Preview map**, **Publish map**, or **Withdraw map**. Preview saves pending changes first; Publish is disabled until preview and after further edits. Publishing confirms that selected source GM-only locations will be revealed. Saving a draft never alters the current player snapshot.

- GM `GET /api/campaigns/:id/map-publication` returns `{ "map": { "campaignId": "...", "campaignRevision": 4, "revision": 1, "catalog": { "name": "...", "bounds": { "south": 59, "west": 13, "north": 61, "east": 15 }, "locations": [ ... ] }, "draft": { ... }, "published": null, "publishedAt": null } }`.
- GM `PUT` uses `action: "draft" | "preview" | "publish" | "withdraw"` and a map-specific `expectedRevision`. Only `draft` accepts a draft object: `{ "locationIds": ["town-id"], "markings": [{ "id": "checkpoint", "label": "Checkpoint", "position": { "lat": 60, "lng": 14 } }], "routeLocationIds": ["town-id"], "playerPosition": { "lat": 60, "lng": 14 } }`. Preview returns `{ "preview": ... , "revision": 1 }`; mutations return the updated GM map record.
- Limits: 500 unique campaign locations, 300 point markings with unique IDs and labels up to 160 characters, and 200 ordered route entries. Routes can revisit a location, but every waypoint must be selected. Coordinates must be within campaign bounds. Position may be unset in a draft but is required to publish. Unknown fields, foreign IDs, and invalid coordinates return `422`; stale map revisions return `409`; non-owner campaigns return `404`. Mutations enforce same origin.
- Player `GET /api/player/campaigns/:id/map` requires an active assigned seat. It returns `{ "map": { "schemaVersion": 1, "name": "...", "bounds": { ... }, "locations": [{ "id": "...", "name": "...", "kind": "...", "position": { "lat": 60, "lng": 14 } }], "markings": [ ... ], "route": [{ "id": "...", "name": "...", "position": { ... } }], "playerPosition": { ... } }, "publishedAt": "..." }`, or both values `null` when unpublished/withdrawn. Player writes are rejected. Setup snapshots, drafts, source visibility, descriptions, notes, terrain/faction data, atlas data, and unselected locations are never included.

The handset Map opens/resets at the GM position, supports panning and zoom from 25% to 200%, and cannot edit campaign layers. It refreshes on opening, Refresh, return, and every 15 seconds while visible; unchanged publications preserve the current view. Withdrawal clears the map on the next refresh; failures and campaign switches clear stale layers. No map snapshot is stored in browser storage. Leaflet/OSM reference tiles require internet. Public geographic labels are not concealed by omitting campaign locations; fog masking, offline basemaps, polygon/line markings, and publication history remain planned. Map browsing does not resolve travel rules.

### COMMS API

Open **COMMS** on the GM desk or handset, choose the campaign, and send one line. Player messages go to the GM and every active campaign seat; the GM can reply to the same channel. The input is capped at 240 characters. The server rejects blank text, line breaks/control characters, and additional sender/time/recipient/campaign fields. Failed or unconfirmed sends retain the input; after a network failure, check the channel before retrying to avoid duplicates.

- GM `GET`/`POST /api/campaigns/:id/comms` requires ownership. Player `GET`/`POST /api/player/campaigns/:id/comms` requires an active assigned seat. POST accepts only `{ "text": "North road clear." }` and returns `201` with `{ "message": { "id": "...", "sender": { "label": "Lena Fors", "role": "player" }, "text": "North road clear.", "gameTime": { "gameDate": "2000-05-11", "dayNumber": 14 }, "sentAt": "..." } }`.
- Sender and clock values are server-derived. New messages include `gameTime.timeOfDay` in HH:MM alongside date/day; older stamps without it are not backfilled. Missing clocks return `gameTime: null`. Sent timestamps remain real-world UTC. Stored snapshots do not change when the campaign clock advances.
- GET returns `{ "messages": [ ... ], "hasEarlier": false }`, ordered oldest-to-newest within the latest 200. Only GM responses additionally include `campaignRevision`; no account IDs, raw seats/characters, GM notes, or setup data enter the channel projection. POST increments the campaign revision to protect concurrent restore. Responses: `401` unauthenticated, `403` wrong role/cross-origin, `404` inaccessible campaign, `422` invalid text/fields, `409` full archive. Per-campaign storage is bounded at 10000 messages.

COMMS refreshes on opening, **Refresh**, returning to the page, and every 15 seconds while visible, rather than instantaneous push. Browser storage is not used for messages. Campaign switches and failed reads clear stale displayed messages; in-flight sends cannot populate a different selected channel. Text is rendered literally, not as HTML. Read receipts, unread flags, per-player deletion, moderation, pagination, and push delivery remain planned.

Runtime-v1 backups include the complete stored COMMS archive, not just the visible 200 messages. Restore validates campaign/sender references, text, time, and ordering and preserves IDs and snapshots atomically. Older backups without `commsMessages` recover an empty archive. Credentials remain excluded, and referenced accounts must exist on the host. Restart an existing Node service to load the new endpoints and migration.

### Inventory API

Open **Inventory** on the handset to see accepted items, submit a new item, edit an item/quantity, or propose removal. Nothing changes accepted inventory until the GM approves. Open **Inventories** on the GM desk and choose a character to stock/correct/remove items or approve/reject proposals. Accepted rows display RB/GM/UF source labels. Item details and review notes are visible to the assigned player, not private GM notes.

An item has exactly `{ "name": "Field ration", "quantity": 2, "carryLocation": "backpack", "sourceCategory": "UF", "sourceReference": "", "details": "GM-managed campaign equipment" }`. Limits: name 100 characters, reference 240, details 2000, integer quantity 0-1000000. Carry locations are `combat-gear`, `backpack`, `tiny-items`, or `unassigned`. These are bookkeeping fields, not verified rules calculations. No weight, capacity, or weapon-stat calculations are accepted or inferred.

- Player `GET /api/player/campaigns/:id/inventory` returns `{ "inventory": { "characterId": "...", "displayLabel": "...", "items": [ ... ], "proposals": [ ... ] } }` for their active assigned character only. Items include stable ID, item revision, accepted fields, and review timestamp; proposal history is limited to the submitting account.
- Player `POST /api/player/campaigns/:id/inventory/proposals` accepts `{ "kind": "add", "item": { ... } }`, `{ "kind": "update", "itemId": "...", "expectedItemRevision": 0, "item": { ... } }`, or `{ "kind": "remove", "itemId": "...", "expectedItemRevision": 0 }`. It returns `202` with a pending proposal. Character IDs, acceptance decisions, source verification, or other unknown payload fields are rejected. Existing-item targets must belong to the player's assigned character.
- GM `GET /api/campaigns/:id/inventory` returns campaign revision and each campaign character's accepted items/proposals. GM `POST` on the same route directly adds/updates/removes using the above shapes plus `characterId`; additions/edits also require `confirmSource: true`. The source category/reference are inside `item`. Existing-item changes require a current item revision.
- GM `POST /api/campaigns/:id/inventory/proposals/:proposalId/review` accepts `{ "decision": "approve", "sourceCategory": "GM", "sourceReference": "Campaign ruling", "confirmSource": true, "reviewNote": "Player-visible feedback" }`, or `{ "decision": "reject", "reviewNote": "..." }`. Removal approval needs no new source data. Add/edit approval requires explicit source review; RB requires a reference. The GM can override the claimed category/reference. UF remains unverified after acceptance; source confirmation is a GM attestation, not automatic verification against a book.

Writes are transactional, same-origin, and GM/seat-scoped. Stale revisions, already-reviewed proposals, changed assignments, duplicate pending targets, or limits return `409`; inaccessible records return `404`; invalid fields/source confirmation return `422`; unauthenticated/wrong-role requests return `401`/`403`. Limits are 200 active items per character, 5000 retained item rows per campaign, 20 pending proposals per character, one pending proposal per existing item, and 10000 proposal records per campaign. Views show pending requests first plus recent history, up to 100 records; full stored records are backed up.

Visible inventory views refresh on opening, Refresh, return, and every 15 seconds. Edited GM review fields pause automatic refresh; explicit refresh asks before discarding them. Unsaved item fields survive failed saves. Refresh before retrying an unconfirmed request to avoid duplicates. Removed items are retained inactive for history. Legacy browser-local sample inventory is not automatically migrated. Rules-backed item actions, transfers, catalogs, and encumbrance remain planned; the UI labels unclear effects GM-managed.

Runtime-v1 backups add optional `inventoryItems`/`inventoryProposals` arrays. Restore validates fields, source/reference requirements, campaign/character/submitter/reviewer relationships, and limits. It preserves IDs but advances item revisions to `max(current, saved) + 1`; matching saved pending proposals are rebased to the restored revision, while already-stale proposals remain stale. Failed restores roll back all changes. Older backups without these arrays recover empty inventories/proposals. Restart an existing Node service to load the migration and endpoints.

### Character Conditions API

Open **Conditions** on the GM desk and select a character. **Save conditions** stores a complete manual record and immediately makes its public fields available to the assigned player. **Clear record** removes both public values and private notes after confirmation, while preserving a revision marker. Players view the record read-only in **Character**. GM edits pause automatic refresh; reload asks before discarding them. There is no automatic condition, capacity, carrying, radiation, injury, or recovery calculation.

- GM `GET /api/campaigns/:id/conditions` returns `{ "conditions": { "campaignId": "...", "campaignRevision": 3, "characters": [{ "characterId": "...", "displayLabel": "...", "revision": 1, "recorded": true, "conditions": { ... }, "gmNotes": "Private", "updatedAt": "..." }] } }` for the owning GM.
- GM `PUT` accepts `{ "characterId": "...", "expectedRevision": 1, "conditions": { "damage": 2, "stress": 1, "temporaryRadiation": null, "permanentRadiation": null, "starving": null, "dehydrated": true, "sleepDeprived": null, "hypothermic": false, "coolnessUnderFire": "", "criticalInjuries": "", "diseases": "", "notes": "Player-visible note" }, "gmNotes": "Private GM note" }`, or `{ "characterId": "...", "expectedRevision": 1, "clear": true }`. Public condition fields and GM notes are separate; unknown or mixed clear/update fields are rejected. Writes atomically advance condition and campaign revisions.
- Damage/stress/radiation entries are nullable integers 0-9999: these are storage bounds, not Fourth Edition tracks or thresholds. Flags are `true`, `false`, or `null` (not recorded). CUF is GM-entered text up to 160 characters; injuries, diseases, and public notes allow 2000 each; private notes allow 4000. Requests are limited to 64 KiB. Source-verified derived values are not inferred.
- Player `GET /api/player/campaigns/:id/conditions` returns only `{ "record": { "schemaVersion": 1, "revision": 2, "updatedAt": "...", "conditions": { ...public fields... } } }`, or `{ "record": null }` when unset/cleared. The server derives the character from the active seat; query parameters cannot redirect it. No private notes, account/actor metadata, other character records, or source setup data are included. Player writes return `405`; wrong-role/unauthenticated/inaccessible requests return `403`/`401`/`404`; stale GM writes return `409`; invalid fields return `422`. Same-origin checks apply to mutations.

The player Character section refreshes on assignment, opening Character, explicit refresh, return, and every 15 seconds while visible. Missing values display **Not recorded**; cleared records display **No GM condition record**. Failed reads and campaign switches remove stale values. Responses are `no-store`, no browser condition cache is used, and notes are rendered literally, not as HTML. Existing local prototype condition pushes are not migrated or applied to the connected view.

Runtime-v1 backups add optional `characterConditions` rows, including private GM notes. Restore validates character/GM ownership and fields, preserves source timestamps, and advances each record revision to `max(current, saved) + 1`. Older backups with no conditions clear current data but retain revision markers, preventing stale editor acceptance after recovery. Invalid/failed restores are atomic. Conditions are authoritative character state, unlike report/map publication drafts: restored public conditions are shown to the active assigned player. Restart existing Node services to load this migration and endpoints.

### Campaign Clock And Midday Supplies

Use **+6h** in Situation or Movement to advance six campaign hours. Date and days-in-field increment only at midnight. Real-world time never advances the campaign automatically. Existing date-only clocks initialize at **00:00**, not an inferred historical time.

On reaching/crossing **12:00**, the GM-defined daily food schedule consumes **one shared ration-day**, never below zero, once per campaign date. A daily usage row prevents another deduction if the clock is rewound and that noon is crossed again. Empty reserves record zero consumed; food added later that date is not charged again. Fuel, water/personal items, carrying, and dice-governed effects remain GM-managed. This is user-requested bookkeeping, not an official Fourth Edition consumption rule.

`POST /api/campaigns/:id/advance-time` accepts only `{ "expectedRevision": 3 }` and returns `{ "runtime": ... }`. The owning GM's server derives time and midday usage in one transaction; stale duplicates return `409`, and audit/journal failures roll back time and supplies. Manual runtime updates accept `dashboard.gameTime` as HH:MM but do not retroactively process noon. Report text's manually entered game time remains separate.

Backups include clock HH:MM, reserves, and `dailySupplyUsage`, plus clock/midday audit entries. Restore recovers reserves and usage together; replay follows that saved state. Legacy backups missing time default to 00:00 and missing usage to empty. New COMMS/audit stamps include `timeOfDay`; historical entries remain unknown. Restart existing services for the migration. Tests/browser checks verify four six-hour steps with one noon deduction, midnight rollover, date replay, empty reserves, duplicate requests, rollback, and recovery.

### GM Campaign Audit

Clock advances and midday ration checks also record `clock.advance` and `supplies.midday` events. New audit game-time metadata includes `timeOfDay`; historical null times remain date/day-only. The midday usage ledger and journal retain the actual quantity used; the audit entry is action metadata, not a rules calculation.

Open **Audit** on the GM desk after selecting a runtime campaign. The read-only table shows newest entries first; Refresh, Newest, and Older controls page through the history. Targets expand to show their IDs and related character/proposal IDs. Actor labels, target labels, UTC timestamps, campaign date/day, and revisions come from server state, not client audit fields. The UI renders labels literally, not as HTML.

`GET /api/campaigns/:id/audit?limit=50&before=123` returns `{ "events": [{ "sequence": 124, "id": "...", "actor": { "id": "...", "label": "gm-user" }, "action": "conditions.save", "target": { "type": "conditions", "id": "...", "label": "Player character", "characterId": "...", "relatedId": null }, "revision": { "before": 1, "after": 2 }, "campaignRevision": { "before": 7, "after": 8 }, "recordedAt": "...", "gameTime": { "gameDate": "2000-05-11", "dayNumber": 14 }, "origin": "live" }], "nextBefore": 75 }`. Limits are 1-100, default 50; `nextBefore` is the exclusive cursor for the next page, or `null`. Unknown/duplicate/invalid query fields return `422`. Authentication is required (`401`); player accounts are denied (`403`); non-owner campaigns return `404`. Writes to the audit endpoint return `405`.

Covered actions: `conditions.save/clear`; `inventory.add/update/remove`, `inventory.approve.add/update/remove`, `inventory.reject`; `report.draft/publish/withdraw`; `map.draft/publish/withdraw`; `campaign.restore`. Inventory approvals reference the related proposal. Created item revisions show `new -> 0`; unrevisioned proposal decisions use `n/a`. No event bodies contain GM note contents, item descriptions, review text, or report/map payloads. Historical labels and timestamps are retained even if current records later change. Read-only previews, rejected/stale writes, and failed transactions create no events. An audit insert failure rolls back its owning change.

Audit begins with this upgrade; older actions are not inferred. Dashboard/faction changes, character review/seat assignment, player submissions/COMMS, and account/auth events remain outside this initial coverage. The table is metadata history, not an undo engine or past-content snapshot archive. There is no audit edit/delete API. SQLite append-only triggers protect application writes, but a database administrator can bypass them; no cryptographic authenticity is promised.

Runtime-v1 backups add optional `auditEvents`. Restore validates metadata and known GM actor accounts, retains all current history (including post-backup actions), and merges missing saved IDs as `origin: "backup"` with new local cursor numbers. Conflicting metadata for an existing ID rejects the entire restore. Every successful restore adds a fresh live restore event in the same transaction. Older backups without audit data cannot erase current history. Newly recovered entries are explicitly backup-sourced, not new live attestations; the public SHA-256 checksum does not prove backup authenticity. The per-campaign audit cap is 100000 entries; a full audit store blocks covered changes rather than silently omitting logs. Archival/retention tooling and dedicated audit exports remain planned. Credentials are not restored and referenced GM accounts must already exist. Restart existing services to load the migration and endpoints.

## Included

Integration verification: run `node --test` for API, persistence/recovery, and player-client regressions. Tests include finalized-character browser-handler routing, pending-request locking, stale character responses, and combined campaign recovery across inventories/proposals, conditions, COMMS, and publications. A synthetic browser check on 01 Nov 2026 also verified GM character approval and all five restored player views; no live database was used.

- Campaign situation dashboard and illustrated route sketch
- Personnel roster with condition and status notes
- Travel day, waypoint, distance, food, fuel, and weather tracking
- Field journal entries
- Browser-local autosave and JSON campaign export
- Standalone [Campaign Setup Tool prototype](campaign-setup.html) with atlas import, batch terrain, visibility eligibility, settlement descriptors, faction influence, and schema-v2 export/reopen. The GM Tool imports immutable source packages and independently publishes text reports and explicitly selected point-layer maps.
- Optional development fixture seeds a separate SQLite `The Long Road` runtime with clock/resources, route stops, personnel, journal, and a sample player seed for testing the runtime read API.
- Authenticated [Player Interface](player-interface.html) with Character, Inventory, published Sitrep/Map, and COMMS. Accepted inventory and own proposals are server-backed; legacy samples remain hidden prototype data.

## Ruleset Fidelity

When a feature models a game mechanic, use the Twilight: 2000 Fourth Edition core rules and applicable official supplements. Keep campaign rulings and homebrew distinct, and do not silently substitute guessed procedures. The current dashboard is a campaign bookkeeping aid, not a complete rules engine; consult the rulebooks for procedures it does not explicitly implement.

Standalone setup drafts and local sample records use browser storage. Server campaign records, inventories, and proposals use SQLite and private runtime backups; browser sample exports are not substitutes for database recovery.

## Product Direction

The product has three connected surfaces: a GM-operated Campaign Setup Tool, a GM runtime tool that imports and runs its campaign package, and a browser-based Player Interface for 1-4 players. Each player has an assigned character and personal inventory; the GM controls published situation-report information. Dice-governed item actions must use verified Fourth Edition procedures. See [FEATURES.md](FEATURES.md) for the full product scope and [ROADMAP.md](ROADMAP.md) for delivery phases, dependencies, and completion checks. These are product goals, not a claim that every surface is already implemented.
