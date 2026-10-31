# Fieldbook

A small, local-first game master desk for a Twilight: 2000 Fourth Edition campaign. This is an independent fan utility, not an official product.

## Run

The standalone prototype can still be opened directly from `index.html` for local evaluation, but direct file access bypasses server authentication. For login-gated access, use the HTTP LAN service described below.

## Tests

Run the dependency-free test suite with `node --test`. Node is only required for tests; the browser tools still run directly from the HTML files.

## LAN Auth API

The Node service serves the login page, gates browser surfaces by GM/player roles, and exposes owner-scoped runtime campaign, account, seed, and character-review endpoints. There is no public registration: a GM creates the username and shares its one-time activation token, then assigns at most one seed per username per campaign. Players select an assigned campaign, complete GM-left-blank seed fields, and finalize required fields. The Player Interface shows that server-owned character record; post-finalization edits remain pending until GM approval. The sample GM dashboard and live influence edits remain browser-local, and player situation reports, inventory, published maps, dispatches, and shared play are not connected. The service requires Node 24 or newer and a first-run bootstrap token. The HTTP listener binds to all network interfaces on port 8080 by default. HTTP does not encrypt passwords or session cookies; use only on a trusted LAN and do not expose the port to the internet or untrusted networks.

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

This read-only endpoint requires a signed-in GM who owns the campaign. It returns `404` when the caller does not own the campaign or when no runtime dashboard state is present. It does not modify browser-local dashboard data.

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

These are development/sample campaign values, not rules-derived results. Runtime write, save, and restore APIs are still planned.

## Included

- Campaign situation dashboard and illustrated route sketch
- Personnel roster with condition and status notes
- Travel day, waypoint, distance, food, fuel, and weather tracking
- Field journal entries
- Browser-local autosave and JSON campaign export
- Standalone [Campaign Setup Tool prototype](campaign-setup.html) with Field Papers atlas import, batch terrain, GM-managed location visibility, a location-backed GM-defined settlement generator, overlapping faction influence, multi-settlement faction links with prominence order, and schema-v2 package export/reopen. The GM Tool imports packages into GM-owned SQLite runtime records and can select their maps; its sample dashboard and live influence edits remain browser-local, while player publication remains planned.
- Optional development fixture seeds a separate SQLite `The Long Road` runtime with clock/resources, route stops, personnel, journal, and a sample player seed for testing the runtime read API.
- Standalone [radio-handset Player Interface prototype](player-interface.html) with a separate browser-local store and a read-only GM condition-snapshot receiver; authenticated GM publishing and cross-device delivery are not connected

## Ruleset Fidelity

When a feature models a game mechanic, use the Twilight: 2000 Fourth Edition core rules and applicable official supplements. Keep campaign rulings and homebrew distinct, and do not silently substitute guessed procedures. The current dashboard is a campaign bookkeeping aid, not a complete rules engine; consult the rulebooks for procedures it does not explicitly implement.

Campaign data is stored in this browser using local storage. Export a JSON record before clearing browser data or moving to another browser. The sample campaign can be removed or edited in the page's script.

## Product Direction

The product has three connected surfaces: a GM-operated Campaign Setup Tool, a GM runtime tool that imports and runs its campaign package, and a browser-based Player Interface for 1-4 players. Each player has an assigned character and personal inventory; the GM controls published situation-report information. Dice-governed item actions must use verified Fourth Edition procedures. See [FEATURES.md](FEATURES.md) for the full product scope and [ROADMAP.md](ROADMAP.md) for delivery phases, dependencies, and completion checks. These are product goals, not a claim that every surface is already implemented.
