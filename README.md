# Fieldbook

A small, local-first game master desk for a Twilight: 2000 Fourth Edition campaign. This is an independent fan utility, not an official product.

## Run

The standalone prototype can still be opened directly from `index.html` for local evaluation, but direct file access bypasses server authentication. For login-gated access, use the HTTPS LAN service described below.

## Tests

Run the dependency-free campaign-package contract tests with `node --test`. Node is only required for tests; the browser tools still run directly from the HTML files.

## LAN Auth API

The Node service serves the login page, gates browser surfaces behind an authenticated session, and exposes owner-scoped runtime campaign import/list/detail endpoints. Importing a setup package creates a new SQLite runtime campaign, and the GM interface can select its imported map. The sample dashboard and live influence edits remain browser-local; player APIs and shared player state are not connected. The service requires Node 24 or newer, a TLS certificate trusted by client devices, and a first-run bootstrap token. The HTTPS listener binds to all network interfaces on port 8443 by default.

In PowerShell, configure the certificate, private key, and a one-time bootstrap token before starting the service:

```powershell
$env:FIELDBOOK_TLS_CERT = "C:\path\to\lan-cert.pem"
$env:FIELDBOOK_TLS_KEY = "C:\path\to\lan-key.pem"
$env:FIELDBOOK_BOOTSTRAP_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
node server/main.cjs
```

The certificate must be valid for the host name clients use and trusted by those devices. The first successful account bootstrap removes the stored bootstrap-token hash. Authentication routes are `POST /api/auth/bootstrap`, `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout`; sessions use secure, HTTP-only, same-site cookies. Campaign routes are `POST /api/campaigns/import-setup`, `GET /api/campaigns`, and `GET /api/campaigns/:id`; they require an authenticated session and only expose campaigns owned by that account. Set `FIELDBOOK_HOST`, `FIELDBOOK_PORT`, and `FIELDBOOK_DB_PATH` to override the listener and SQLite location.

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
