# Fieldbook

A small, local-first game master desk for a Twilight: 2000 Fourth Edition campaign. This is an independent fan utility, not an official product.

## Run

The standalone prototype can still be opened directly from `index.html` for local evaluation, but direct file access bypasses server authentication. For login-gated access, use the HTTP LAN service described below.

## Tests

Run the dependency-free test suite with `node --test`. Node is only required for tests; the browser tools still run directly from the HTML files.

## LAN Auth API

The Node service enforces GM/player roles and campaign ownership. Dashboard records, factions, prominence, report/map drafts, and COMMS messages persist in SQLite. GMs explicitly publish reports/maps; active players and GMs broadcast through their campaign channel. Inventory and broader rules-governed gameplay remain unconnected. Node 24 or newer is required; HTTP defaults to port 8080 without encryption. Use only on a trusted LAN, never the internet or untrusted networks.

In PowerShell, configure a one-time bootstrap token before starting the service:

```powershell
$env:FIELDBOOK_BOOTSTRAP_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
node server/main.cjs
```

The first successful account bootstrap removes the stored bootstrap-token hash. Authentication routes include `POST /api/auth/bootstrap`, `POST /api/auth/activate`, `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout`; sessions use HttpOnly, SameSite=Strict cookies. GM user routes are `GET /api/users` and `POST /api/users`. Campaign routes include `POST /api/campaigns/import-setup`, `GET /api/campaigns`, `GET /api/campaigns/:id`, `GET /api/campaigns/:id/runtime`, `GET /api/campaigns/:id/character-changes`, and `POST /api/campaigns/:id/character-changes/:requestId/review`. Player routes are `GET /api/player/campaigns`, `GET|PUT /api/player/campaigns/:id/character`, and `POST /api/player/campaigns/:id/character/finalize`; GM seed assignment uses `POST /api/campaigns/:id/player-seeds`. Set `FIELDBOOK_HOST`, `FIELDBOOK_PORT`, and `FIELDBOOK_DB_PATH` to override the listener and SQLite location.

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
- Sender and game-time values are derived from the authenticated seat and authoritative campaign clock, not the browser. GM replies use label/role `GM`/`gm`. If the campaign has no clock, `gameTime` is `null` and the UI shows **Game time not set**. The current clock has date/day only; no time of day is inferred. Sent timestamps are server UTC timestamps. Stored sender/time snapshots do not change when the campaign clock or assignment later changes.
- GET returns `{ "messages": [ ... ], "hasEarlier": false }`, ordered oldest-to-newest within the latest 200. Only GM responses additionally include `campaignRevision`; no account IDs, raw seats/characters, GM notes, or setup data enter the channel projection. POST increments the campaign revision to protect concurrent restore. Responses: `401` unauthenticated, `403` wrong role/cross-origin, `404` inaccessible campaign, `422` invalid text/fields, `409` full archive. Per-campaign storage is bounded at 10000 messages.

COMMS refreshes on opening, **Refresh**, returning to the page, and every 15 seconds while visible, rather than instantaneous push. Browser storage is not used for messages. Campaign switches and failed reads clear stale displayed messages; in-flight sends cannot populate a different selected channel. Text is rendered literally, not as HTML. Read receipts, unread flags, per-player deletion, moderation, pagination, and push delivery remain planned.

Runtime-v1 backups include the complete stored COMMS archive, not just the visible 200 messages. Restore validates campaign/sender references, text, time, and ordering and preserves IDs and snapshots atomically. Older backups without `commsMessages` recover an empty archive. Credentials remain excluded, and referenced accounts must exist on the host. Restart an existing Node service to load the new endpoints and migration.

## Included

- Campaign situation dashboard and illustrated route sketch
- Personnel roster with condition and status notes
- Travel day, waypoint, distance, food, fuel, and weather tracking
- Field journal entries
- Browser-local autosave and JSON campaign export
- Standalone [Campaign Setup Tool prototype](campaign-setup.html) with atlas import, batch terrain, visibility eligibility, settlement descriptors, faction influence, and schema-v2 export/reopen. The GM Tool imports immutable source packages and independently publishes text reports and explicitly selected point-layer maps.
- Optional development fixture seeds a separate SQLite `The Long Road` runtime with clock/resources, route stops, personnel, journal, and a sample player seed for testing the runtime read API.
- Authenticated [Player Interface](player-interface.html) with Character, published Sitrep/Map, and campaign COMMS. Inventory remains inactive; legacy samples are not connected runtime data.

## Ruleset Fidelity

When a feature models a game mechanic, use the Twilight: 2000 Fourth Edition core rules and applicable official supplements. Keep campaign rulings and homebrew distinct, and do not silently substitute guessed procedures. The current dashboard is a campaign bookkeeping aid, not a complete rules engine; consult the rulebooks for procedures it does not explicitly implement.

Campaign data is stored in this browser using local storage. Export a JSON record before clearing browser data or moving to another browser. The sample campaign can be removed or edited in the page's script.

## Product Direction

The product has three connected surfaces: a GM-operated Campaign Setup Tool, a GM runtime tool that imports and runs its campaign package, and a browser-based Player Interface for 1-4 players. Each player has an assigned character and personal inventory; the GM controls published situation-report information. Dice-governed item actions must use verified Fourth Edition procedures. See [FEATURES.md](FEATURES.md) for the full product scope and [ROADMAP.md](ROADMAP.md) for delivery phases, dependencies, and completion checks. These are product goals, not a claim that every surface is already implemented.
