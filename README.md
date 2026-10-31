# Fieldbook

A small, local-first game master desk for a Twilight: 2000 Fourth Edition campaign. This is an independent fan utility, not an official product.

## Run

The standalone prototype can still be opened directly from `index.html` for local evaluation, but direct file access bypasses server authentication. For login-gated access, use the HTTP LAN service described below.

## Tests

Run the dependency-free test suite with `node --test`. Node is only required for tests; the browser tools still run directly from the HTML files.

## LAN Auth API

The Node service serves the login page, gates browser surfaces by GM/player roles, and exposes owner-scoped runtime campaign and player-seed endpoints. There is no public registration: a GM creates the username and shares its one-time activation token, then assigns at most one seed per username per campaign. Players select an assigned campaign, complete only GM-left-blank fields, and finalize required fields. After finalization, field edits are pending until the GM approves them. The sample dashboard and live influence edits remain browser-local; player inventory, published campaign data, and shared live play are not connected. The service requires Node 24 or newer and a first-run bootstrap token. The HTTP listener binds to all network interfaces on port 8080 by default. HTTP does not encrypt passwords or session cookies; use only on a trusted LAN and do not expose the port to the internet or untrusted networks.

In PowerShell, configure a one-time bootstrap token before starting the service:

```powershell
$env:FIELDBOOK_BOOTSTRAP_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
node server/main.cjs
```

The first successful account bootstrap removes the stored bootstrap-token hash. Authentication routes include `POST /api/auth/bootstrap`, `POST /api/auth/activate`, `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout`; sessions use HttpOnly, SameSite=Strict cookies. GM user routes are `GET /api/users` and `POST /api/users`. Campaign routes include `POST /api/campaigns/import-setup`, `GET /api/campaigns`, `GET /api/campaigns/:id`, `GET /api/campaigns/:id/character-changes`, and `POST /api/campaigns/:id/character-changes/:requestId/review`. Player routes are `GET /api/player/campaigns`, `GET|PUT /api/player/campaigns/:id/character`, and `POST /api/player/campaigns/:id/character/finalize`; GM seed assignment uses `POST /api/campaigns/:id/player-seeds`. Set `FIELDBOOK_HOST`, `FIELDBOOK_PORT`, and `FIELDBOOK_DB_PATH` to override the listener and SQLite location.

## Included

- Campaign situation dashboard and illustrated route sketch
- Personnel roster with condition and status notes
- Travel day, waypoint, distance, food, fuel, and weather tracking
- Field journal entries
- Browser-local autosave and JSON campaign export
- Standalone [Campaign Setup Tool prototype](campaign-setup.html) with Field Papers atlas import, batch terrain, GM-managed location visibility, a location-backed GM-defined settlement generator, overlapping faction influence, multi-settlement faction links with prominence order, and schema-v2 package export/reopen. The GM Tool imports packages into GM-owned SQLite runtime records and can select their maps; its sample dashboard and live influence edits remain browser-local, while player publication remains planned.
- Standalone [radio-handset Player Interface prototype](player-interface.html) with a separate browser-local store and a read-only GM condition-snapshot receiver; authenticated GM publishing and cross-device delivery are not connected

## Ruleset Fidelity

When a feature models a game mechanic, use the Twilight: 2000 Fourth Edition core rules and applicable official supplements. Keep campaign rulings and homebrew distinct, and do not silently substitute guessed procedures. The current dashboard is a campaign bookkeeping aid, not a complete rules engine; consult the rulebooks for procedures it does not explicitly implement.

Campaign data is stored in this browser using local storage. Export a JSON record before clearing browser data or moving to another browser. The sample campaign can be removed or edited in the page's script.

## Product Direction

The product has three connected surfaces: a GM-operated Campaign Setup Tool, a GM runtime tool that imports and runs its campaign package, and a browser-based Player Interface for 1-4 players. Each player has an assigned character and personal inventory; the GM controls published situation-report information. Dice-governed item actions must use verified Fourth Edition procedures. See [FEATURES.md](FEATURES.md) for the full product scope and [ROADMAP.md](ROADMAP.md) for delivery phases, dependencies, and completion checks. These are product goals, not a claim that every surface is already implemented.
