# Twilight: 2000 Fourth Edition - Fresh Session Startup

Updated: 06 November 2026. This is active development guidance, not a production-readiness certification.
The original 02 November session figures are historical; see the [session archive](../archive/session-2026-11-02/SESSION_ARCHIVE_INDEX.md).

## Start With Current Context

- Work in the assigned checkout/worktree, not a hardcoded personal path or another session's checkout.
- Read [project instructions](../.github/copilot-instructions.md), [FEATURES.md](FEATURES.md), [ROADMAP.md](ROADMAP.md), [DATA_MODEL.md](DATA_MODEL.md), and [README.md](README.md).
- Consult dated completion reports and archives only for historical evidence. Current source and verified current feature status supersede earlier snapshots.
- Setup is a prototype; GM runtime and Player Interface remain partial. Passing tests do not establish complete rules coverage, licensed-archive acceptance, cross-host asset portability, or safe internet deployment.
- Confirm the requested scope and inspect `git status` before editing. Preserve unrelated user changes.

## Environment And Service

Use the Node version required by [package.json](../package.json) (currently Node 24 or newer).
Run commands from the assigned repository/worktree root. Install dependencies only when needed.

```powershell
node --version
git status --short
npm ci
```

For a new local database, configure the one-time GM bootstrap token before starting:

```powershell
$env:FIELDBOOK_BOOTSTRAP_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
node server\main.cjs
```

Default listeners:

- GM: `http://localhost:8081/`; setup: `http://localhost:8081/campaign-setup.html`.
- Player: `http://localhost:8080/player-interface.html`.
- Combat: `http://localhost:8081/combat.html?campaign=<id>`.
- Status documentation: run `node server\status-pages.cjs`, then open `http://127.0.0.1:8091/`.

The service binds to `0.0.0.0` by default. HTTP is for a trusted LAN only, not the internet or untrusted networks.
`FIELDBOOK_HOST`, `FIELDBOOK_GM_PORT`, and `FIELDBOOK_PLAYER_PORT` override listeners. Explicit `FIELDBOOK_PORT` enables the legacy single-port mode only when neither role-specific port is set.
`FIELDBOOK_DB_PATH` selects the database; the default is `data/fieldbook.sqlite`. Do not use a shared live database for tests.
Authentication remains required; use disposable isolated fixtures for review rather than production bypasses.

## Current Architecture And Handoff

Discover module and test inventories from source instead of relying on fixed counts.

- `server/main.cjs`: service startup, role-specific listeners, backup scheduler and automation.
- `server/app.cjs`: protected pages, routing, owned offline assets, setup-save integration.
- `server/runtime-store.cjs`: SQLite model, migrations, setup import, runtime state and recovery.
- `server/setup-packages.cjs`: validated, versioned GM-owned setup JSON and copied image storage.
- `campaign-setup.html`: browser-local initial campaign authoring, separate from runtime.
- `index.html`: GM runtime; `player-interface.html`: explicitly published player projection.
- `map-coordinates.js` and `campaign-package-contract.js`: shared coordinate and package validation.
- `tests/`: Node built-in runner regressions; inspect nearby tests for the owning surface.

Setup selects Static image or Map extract. Images require a GM-entered width in kilometres and validated pixel dimensions; x/y kilometres originate at bottom-left, with the 10 km grid anchored at top-left. Geographic extracts retain latitude/longitude. Manual bounds selection is deferred; never invent geography or image scale.

**Save setup to server** creates JSON in `gmpack/campsetups/` and copies static images with ownership/dimension sidecars to `data/maps/<normalized-campaign>/`. Each save creates a new version. Upload staging and PMTiles remain in `data/maps/atlas/`; legacy `data/offline-basemaps/` reads remain supported. Reopen requires validation and explicit local-draft replacement; downloaded JSON can be imported into the runtime. Saving does not import or publish anything.

Runtime mutations do not update setup drafts or previously published player snapshots. Scheduled and event-triggered backup infrastructure is implemented; broader recovery and cross-host asset portability remain partial. Transfer package/backup JSON, required assets, and ownership sidecars together, with destination-account ownership handled explicitly.

## Working Method

1. Identify the UI, API, data boundary and nearby tests before editing.
2. Verify applicable Fourth Edition procedures and required inputs **before** implementing rules logic. Check `gmpack/ocr/` and referenced analysis, retaining source citations. If insufficient or ambiguous, request an authoritative book/page reference and keep effects GM-managed; do not infer official rules from existing code.
3. Implement the smallest complete change within the user's scope. Keep setup, runtime, and player publication distinct.
4. Validate relevant behavior, authorization, persistence and error paths. Report failures and unverified dependencies explicitly.
5. Update current feature/roadmap status and existing deployment copies when applicable. Preserve dated historical reports; add superseded pointers where old behavior could be mistaken for current guidance.
6. Inspect the final diff. Do not revert unrelated changes or automatically commit, push, merge, tag, or build a deployment ZIP.
7. Commit only with explicit user authorization; stage only intended files, include the required co-author trailer, and follow normal review/merge protections when authorized.

## Verification Commands

Use the smallest relevant selector; run the full suite when the scope warrants it. Documentation-only edits need no build, but run existing documentation/path/synchronization tests that cover changed files.

```powershell
node --test tests\campaign-desk-ui.test.cjs tests\status-pages.test.cjs
node --test --test-name-pattern="pattern" tests\campaign-setup-import-client.test.cjs
npm test
npm run lint -- --quiet
git diff --check
```

Record actual results with the revision/date and environment. Do not require an obsolete fixed test total or equate a test count with coverage.
For the merged image workflow on 06 November 2026 (`9daa3ec`), the recorded run was 331 passed, zero failed/skipped on Node 26.13.0; that is a dated baseline, not a permanent expected count.

## Invariants And Troubleshooting

- Enforce GM ownership, 1-4 separate player seats, and assigned-character permissions at the server boundary.
- Player responses expose only authorized public data; setup eligibility is not publication.
- Verify all positions and supported geometry vertices in the campaign's declared coordinate space.
- Rules-dependent inventory/character proposals remain pending until GM review; unverified mechanics remain GM-managed.
- Preserve revision checks, transactional mutations/recovery, and audit history. Restore withdraws report/map publication for explicit re-review.
- Keep credentials, runtime data, generated exports and binary assets out of source control.
- For failures, reproduce and inspect logs/source before changing anything. Do not blindly revert another session's work or replace a live database.

The default database contains `audit_events`, not `audit_log`:

```sql
SELECT * FROM audit_events ORDER BY sequence DESC LIMIT 10;
```

Use the current roadmap and the user's request to choose work; historical priority recommendations are not new authorization.
