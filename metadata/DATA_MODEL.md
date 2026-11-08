# Runtime Data Model and Access Rules

**Status:** Phase 0 design draft. This document defines the first shared-data contract for review; it does not claim that the current browser prototypes implement it.

## Decisions and Boundaries

- The GM-hosted LAN service is authoritative. SQLite on the host stores active campaign state. Browser storage may hold temporary drafts or caches, but it is not authoritative.
- The service uses plain HTTP only on a trusted LAN. Credentials and session cookies are unencrypted in transit; do not expose the listener to the internet or untrusted networks.
- Setup packages, runtime saves, and player-facing publications are separate versioned formats. JSON is the import, export, and backup format, not a shared live database.
- Importing a setup package creates a new runtime campaign. It does not keep the runtime linked to later edits of the source package.
- The initial campaign has one GM owner and zero to four player seats. Each occupied player seat has one authenticated account and one assigned player character.
- Server-side authorization applies to every read and write. Hiding controls in the browser is not an access boundary.
- Game rules, campaign state, GM rulings, and player proposals remain separate data. Unverified rule interpretations never become automatic mechanics.

## Versioned Documents

Keep these formats distinct:

| Format | Purpose | Visibility |
| --- | --- | --- |
| `fieldbook.campaign-setup`, schema v2 | Initial campaign authored in Campaign Setup; current format is defined by the setup package contract. | GM-only |
| `fieldbook.campaign-runtime`, schema v1 | Complete authoritative runtime backup, including private state, seats, and audit history. | GM-only; never serve to a player client |
| `fieldbook.player-view`, schema v1 | Deliberately constructed current publication for a campaign. | Shared with that campaign's player seats |

Every document has a `schemaVersion`. Runtime exports also include `exportedAt`; runtime records carry stable IDs and timestamps. Unknown schema versions are rejected without changing stored data. Imports are validated completely and applied in one database transaction or not at all.

A runtime import generates a new runtime campaign ID, records the source package ID and checksum, and preserves setup record IDs within the new campaign. Re-importing the same setup therefore creates an independent campaign rather than overwriting an existing one. The original setup JSON is retained as an immutable source snapshot for provenance; runtime edits never modify it.

## Runtime Entities

Use normalized SQLite tables and foreign keys for relationships, ownership, and authorization. Store bounded structured payloads such as GeoJSON properties or an imported package snapshot as JSON where that is a natural fit; do not make a whole live campaign one unvalidated JSON blob.

| Entity | Core data and relationships |
| --- | --- |
| `campaigns` | Runtime ID, name, setting, premise, era, game date/time, runtime schema version, revision, created/updated timestamps, active state. |
| `setup_imports` | Campaign ID, source package ID/version, import time, checksum, immutable source JSON. One campaign has one initial setup import. |
| `accounts` | Account ID, GM-assigned login identifier, global role (`gm` or `player`), creating GM, password hash, disabled state, forced-password-change flag, timestamps. GM-created player accounts receive a temporary password and must change it before accessing campaign pages or APIs; there is no public account registration. Never store plaintext passwords or expose password hashes to clients. |
| `account_invites` | Legacy compatibility table; the schema upgrade clears existing invite hashes and new accounts do not use activation tokens. GM password resets also remove any legacy invite row. |
| `player_seed_templates` | GM owner, player account, display label, bounded T2K 4E character-template JSON, and timestamps. Global to the owning GM, not attached to any campaign; each player account has one template. Assignment copies template fields into a campaign character and does not mutate the source template. |
| `campaign_memberships` | Campaign ID, account ID, role (`gm` or `player`); the initial model allows one GM owner. A player membership must map to exactly one seat. |
| `player_seats` | Seat ID, campaign ID, account ID, assigned character ID, display label, active state, assignment time. This is the single ownership link; enforce unique `(campaign_id, account_id)` and `(campaign_id, character_id)` pairs and at most four active player seats per campaign. |
| `characters` | Character ID, campaign ID, seed/playable status, and bounded character fields. GM-authored seed fields explicitly carry a player-editable flag determined at assignment; only fields left blank by the GM are player-editable. Player ownership is derived from the seat assignment. |
| `character_conditions` | Implemented campaign/character foreign keys, optimistic revision, active/cleared marker, bounded public condition JSON, separate private GM notes, and GM updater/timestamp. Nullable numeric/flag values are unknown, not healthy/zero. No rules effects or capacities are derived. |
| `inventory_items` | Implemented stable item ID, campaign/character foreign keys, revision/active flag, bounded item fields, quantity, manual carry location, accepted RB/GM/UF category/reference, and GM reviewer/time. Removed rows remain inactive. RB/GM acceptance is a human GM source review, not automated book verification; UF remains unverified. |
| `runtime_dashboard_state` | Per-campaign date/day and HH:MM, distance, ration-days, fuel, weather, last rolled shift, remaining forced-Cloudy shifts, route stop, and timestamp. Six-hour advances and the GM-defined midday food schedule are bookkeeping, not inferred rules outcomes. |
| `roll_table_catalog` | Single global schema-v1 catalog JSON and optimistic revision, shared by GM accounts on one service and deliberately independent of campaigns. Only GM-authenticated API reads/writes are allowed; player projections never include it. |
| `campaign_combat_weapons` | Campaign-scoped GM-only custom weapon name, resolver category, and its entered weapon fields. A successful explicit calculation may insert an Other/custom weapon; normalized campaign/name uniqueness makes repeat saves idempotent and conflicting details never overwrite an existing entry. Stored fields are GM-provided calculator inputs, not verified or inferred rules data. Runtime backups preserve these rows. |
| `daily_supply_usage` | Campaign/date unique midday marker, ration-days actually used (0 or 1), and UTC timestamp. GM-defined food schedule; clock HH:MM, reserve, and usage recover together. |
| `situation_reports` | Implemented per-campaign saved draft, separate current published JSON, publication time, and monotonic optimistic report revision. Only title, body, and manually entered game time are allowed in report payloads. Withdrawal keeps the draft but clears the published fields. |
| `map_publications` | Implemented per-campaign map draft, explicit schema-v2 player snapshot, publication timestamp, and optimistic map revision. Drafts select location IDs, ordered selected-location route IDs, bounded labeled points, supported LineString/single-ring Polygon geometries, and a GM-set position. Geometry vertices use longitude/latitude for geographic maps or x/y kilometres for image maps; image geometry is not geographic GeoJSON. Initial basemap references come from setup; the owner/revision-checked runtime boundary can replace compatible static-image or raster/MVT PMTiles references without altering the immutable setup source or existing player snapshot. Image extents require a matching static image. Explicit publication carries selected basemap credit/license and excludes source notes/visibility, descriptions, terrain/factions, atlas, and raw annotations. |
| `route_stops` | Ordered campaign route entries linked to locations, with a display detail and distance from the preceding stop. |
| `personnel` | GM-managed roster entries with role, condition, readiness label, and stable display order; these do not replace player-character records. |
| `maps`, `locations`, `terrain_cells` | Campaign-scoped map metadata, imported geographic bounds/atlas references or explicit image extent, locations/visibility eligibility, and axial Q/R terrain labels. Geographic bounds use `{south,west,north,east}` and positions `{lat,lng}`. Image bounds use `{type:"image-km",widthPixels,heightPixels,widthKm}` and positions `{x,y}` in kilometres from bottom-left; height follows pixel aspect ratio and grid origin is top-left. `bounds_json` retains the discriminated extent without schema migration. Preserve coordinate space through setup packages, runtime backups, and publication; never reinterpret image coordinates as geography. Manual extent selection is removed from setup for now. Offline image/PMTiles bytes and ownership sidecars transfer separately from SQLite/JSON backups. |
| Server setup files (outside SQLite) | Versioned schema-v2 JSON under app-root `gmpack/campsetups/` with owning-GM metadata; copied static-image assets and ownership/dimension sidecars under `data/maps/<normalized-campaign>/`. Saved JSON references the copied asset UUID; filesystem paths are server-generated, never accepted from a client. Prior versions and source uploads remain intact. GM-only retrieval validates ownership; runtime/player asset reads retain their existing authorization. |
| `settlements`, `factions`, `faction_influence_cells`, `settlement_factions` | Campaign-scoped setup/runtime records, independent overlapping faction influence, and explicit per-settlement faction prominence order. These records have no rules effects unless a verified procedure is separately implemented. |
| `routes`, `waypoints`, `resources`, `journal_entries`, `gm_notes`, `events`, `missions` | Campaign runtime records with stable IDs, timestamps, and explicit visibility. GM notes default to GM-only. Rules-driven effects remain unimplemented until verified. |
| `character_change_requests` | Character field edits submitted by the assigned seat after finalization. Store proposed values, `pending`/`approved`/`rejected` status, submitter seat, timestamps, reviewing GM, and review note. Pending requests never alter accepted character data. |
| `inventory_proposals` | Implemented character-scoped submitter, add/update/remove intent, target item/revision, proposed fields/source claim, pending/approved/rejected status, submission/reviewer timestamps, and player-visible review note. Approved additions retain the created item ID. Player history filters both character and submitting account. |
| `comms_messages` | Implemented campaign-scoped stable ID/send order, private sender account reference, public sender-label/role snapshot, single-line text, nullable game date/day snapshot, and UTC sent timestamp. Visible only to the owning GM and active campaign seats. Read/delivery receipts are planned. |
| `publications` | Planned full past-content snapshot history. Current report/map tables retain draft and current snapshot; their covered mutation actions now have separate GM audit metadata. |
| `audit_events` | Implemented append-only metadata: stable UUID, local sequence cursor, campaign, GM actor ID/label, action, target type/ID/label, related character/proposal IDs, target/campaign revision pairs, UTC time, nullable game date/day, and live/backup origin. Event bodies omit notes/content. Owner-only reads; broader action coverage remains planned. |

All IDs are opaque stable strings generated by the service. Relationships are campaign-scoped and enforced with foreign keys/unique constraints. Clients cannot choose another campaign's IDs to gain access.

`GET /api/campaigns/:id/runtime` returns the owning GM's campaign summary, dashboard state, ordered route, locations, personnel, journal, and conflicts. `PUT` supports partial dashboard-state updates and replacement route/personnel/journal/conflict lists plus location-coordinate edits, guarded by `expectedRevision` in one transaction. Route stops contain either an existing `locationId` or an input-only `hex: {q, r}`, with `detail` and non-negative integer `kmFromPrevious`. Hex requests resolve against the imported 10 km axial grid origin and current map extent at the server: reuse a location at that center or create a GM-only `Waypoint` with canonical grid reference and position. The GM route editor derives leg distances from nearest in-bounds hex centers in both geographic and image-km coordinate modes; when a legacy waypoint has no valid center, its saved distance remains manually editable. It also shows a read-only marching estimate along the straight line between those centers, using assigned terrain for each entered hex: 2 hexes per shift in Road/Open and 1 in other recognized terrain. Mixed-terrain estimates sum per-hex rates and round up to a whole shift; they are explicitly planning estimates, not a full rules resolution. Missing/unknown terrain or an invalid path suppresses the estimate. Driving remains GM-managed. These derived values are not persisted. Invalid/out-of-area cells, duplicate stops, unauthorized writes and revision conflicts roll back the entire save, including new locations. Persisted routes still reference location IDs; no schema change is needed. Route planning does not change recorded party position or publish a player map. Responses omit accounts, seats, player characters, GM notes, and setup source contents.

GM report actions use `/api/campaigns/:id/situation-report` with a report-specific `expectedRevision` checked inside the SQLite transaction. Publish copies the saved draft; preview is read-only. The player endpoint independently checks active campaign assignment and constructs a fresh allow-listed projection with only title, body, game time, and publication timestamp. It never serializes the GM campaign object or draft. Runtime-v1 backups add an optional draft record; restore clears current publication and advances report revision. Older backups recover an empty draft, and failed restores remain atomic.

## Campaign Clock Boundary

The owning GM's six-hour action checks the campaign revision and computes time from authoritative state. Midnight changes date/day; crossing midday consumes one shared ration-day only if that date has no usage marker. Zero reserves record zero used. Clock, daily usage, journal, and audit are one transaction. Manual clock edits do not process prior noons. Restore recovers usage with clock/reserves; missing legacy time initializes at 00:00. New message/audit stamps capture nullable HH:MM without inventing historical times. Fuel, items, carrying, and dice rules are not inferred.

## Strategic Weather Roll Boundary

The owning GM records a physical d6 result and selects the matching improve/worsen symbol from the Strategic Play Referee Aid. The local aid does not expose a numeric mapping for those symbols, so no face threshold is inferred. `POST /api/campaigns/:id/weather-roll` checks GM ownership and campaign revision, permits one roll per shift, applies the chosen one-step state change, and records the d6, symbol outcome, and resulting weather in the GM journal/audit trail. GM-defined weather has no automatic roll.

When a shift ends in Rain/Snow, the next six-hour clock advance returns the state to Cloudy and sets one forced Cloudy shift. Weather rolls remain blocked until that shift completes. Clock transitions and weather duration are atomic with journal/audit writes. Runtime backups preserve both the last rolled shift and the forced-Cloudy counter; older backups initialize those fields to no prior roll and no lock. These controls do not modify character or attack rolls.

## Audit Boundary

Append events only inside the authoritative mutation transaction. Actor ID/label and clock/revision metadata are derived server-side; no client event creation/edit/deletion is exposed. SQLite triggers reject audit update/delete. Owner-only GET pagination reads at most 100 records; player projections do not include audit entries. Current coverage is condition save/clear, direct inventory changes and proposal decisions, report/map mutation actions, and restore. Player submissions, dashboard/faction writes, character review/assignment, auth events, and full content snapshots remain separate planned coverage.

Runtime-v1 backups carry optional validated audit rows. Restore never deletes current history: matching IDs must have identical immutable metadata, missing saved entries get a fresh local sequence and backup-origin label, and a live restore event is appended atomically. Pre-restore later history remains available even when target state is rolled back. Unknown GM actor accounts, conflicting IDs, invalid metadata, quotas, or insertion failures reject the whole restore. Existing labels/timestamps are snapshots, not recomputed from current names. Backup-origin entries are imported provenance, not cryptographically authenticated live records; database administrators can bypass local triggers. Cap 100000 events per campaign; retention/archival tooling is planned.

## Character Condition Boundary

Only the owning GM writes complete condition records or clears them, with the expected record revision checked inside a transaction. Player reads derive the character from the active seat and return a new allow-listed public projection; private notes/updater metadata never enter that response. Public text is deliberately player-visible. Clearing keeps an inactive revision marker with empty public/private fields. Runtime-v1 backups retain conditions and GM notes; restore validates ownership/fields and advances revisions. Missing older rows clear existing data but preserve revision markers. Source timestamps are preserved for restored records. Condition state becomes available on successful save/restore, not through the separate report/map publication workflow. Automatic rules effects, capacities, and carrying remain GM-managed.

## Inventory Boundary

Player inventory reads and proposals require active character assignment. Only an owning GM may alter accepted items or decide proposals. Existing-item changes and approvals compare item revisions inside SQLite transactions; approval rechecks the current submitter assignment. The GM independently confirms source category/reference for adds/edits, with a reference required for RB. Unknown fields, including unimplemented rule statistics, are rejected. Only accepted item fields and the player's own proposal/review data reach player clients; private accounts, other inventories/submissions, and GM notes do not. Item details and review feedback are explicitly player-visible.

Runtime-v1 backups contain accepted/removed rows and full proposal history. Validate bounds, source fields, IDs, character relationships, and actor/reviewer ownership before restore. Restore preserves item/proposal IDs, advances item revisions, and rebases only pending proposals matching the saved item revision. Invalid data or database failures roll back everything. Old backups without inventory recover empty arrays. Manual carry categories do not establish weight, capacity, or encumbrance effects; those require separate Fourth Edition verification.

## COMMS Boundary

COMMS player responses contain only message ID, sender label/role, text, date/day stamp, and sent timestamp. Sender identity and clock values are assigned inside the write transaction; player input can contain only text. Null game time is explicit when no clock exists. Message reads/writes require active campaign access and cannot target another seat or campaign through payload fields. Accepted sends increment campaign revision. Reads return the latest 200; backups preserve all stored messages up to the 10000-message cap. Restore validates actor membership, text, time, unique IDs/order, and account availability; older backups with no archive recover an empty one. No per-player receipts or moderation are implemented yet.

## Map Publication Boundary

Map APIs use a separate map-specific revision. GM writes check ownership and revision inside the SQLite transaction; previews construct the same allow-listed schema used by player reads. Active assigned players have a GET-only map endpoint. GM selection is deliberate publication authorization, including a selected source GM-only location; setup eligibility alone never publishes anything. Routes reference only selected campaign locations and all points must remain inside map bounds. Optional map draft records are validated in runtime-v1 backups. Restore recovers the draft, withdraws the snapshot, and advances its revision; absent older records become empty drafts. Public OSM geography is not hidden by omitting campaign overlays.

## Character Seed Life-Path Shape

The seed editor stores each manually recorded career term in `character.lifePath.careerTerms`, ordered by `termNumber`. This is a record of choices and outcomes, not a rules engine. Rolls, ratings, career eligibility, aging, injuries, promotion, war checks, and gear remain GM-entered until verified against the Players' Manual. Each term has this shape:

```json
{
	"id": "term-stable-id",
	"termNumber": 1,
	"career": "",
	"skillAdvances": [],
	"promotion": { "skill": "", "roll": "", "outcome": "" },
	"specialties": [],
	"aging": { "yearsAged": null, "effect": "" },
	"warCheck": { "roll": "", "outcome": "" },
	"injuryOutcome": "",
	"notes": ""
}
```

`yearsAged` is a non-negative integer or `null` when not recorded. `skillAdvances` and `specialties` are lists to preserve separate entries. `legacyCareerNotes` temporarily preserves the old schema-v1 free-text career-term field during migration; it can be cleared after its contents are transferred into term records.

## Player-View Contract

A player response is assembled by the server from an explicit allow-list. It contains only:

- The current published campaign situation and any map, route, position, or dispatch data explicitly included in that publication.
- The requesting player's assigned character and that character's accepted inventory.
- COMMS messages addressed to the campaign group.
- That player's own pending requests and proposals, with their review status.

It never contains GM notes, unpublished or withdrawn content, hidden threats, another seat's identity/account data, another player's character/inventory, or another player's private submissions. Location visibility eligibility is not publication: eligible content remains hidden until included in a published snapshot. Player-view snapshots are separate from internal campaign records; do not serialize internal rows and try to hide fields in the browser.

## Authorization Rules

| Action | GM owner | Player seat |
| --- | --- | --- |
| Read campaign runtime | All records in the owned campaign | Only current player view, own assigned character/inventory, group messages, and own submissions |
| Edit campaign, map, route, resources, journal, GM notes, seats, assignments | Allowed within owned campaign | Denied |
| Edit accepted character or inventory state | Allowed; record consequential changes | Denied; submit a change request instead |
| Submit character or inventory change | Not applicable | Allowed only for own assigned character/inventory |
| Add a proposed item or edit to item data | Allowed to review and accept | Allowed as a pending proposal only; cannot create accepted rules data |
| Approve/reject a request or proposal | Allowed; inventory decisions have audit events, character-review audit events planned | Denied |
| Build, publish, replace, or withdraw player view | Allowed; each published revision is audited | Denied |
| Send/read group COMMS | Read/send within owned campaign; moderation planned | Send as self; read messages for active assigned campaigns only |
| Access another campaign or another seat's private data | Denied unless separately assigned a GM role | Denied |

Authenticate the account on the server and derive campaign role and player seat from the authenticated session and database membership. Never trust a client-supplied role, seat ID, character ID, campaign ID, or `RB`/`GM`/`UF` claim as authorization. Check campaign membership and record ownership on every endpoint, including exports and nested resources.

A GM may create a player login and a T2K 4E character template independently of all campaigns. An unassigned player can activate their account but sees no campaigns and has no campaign character or seat. The GM's global template list is owner-scoped. Assignment selects a runtime campaign and copies the template into a campaign character; later edits to the template do not change assigned characters. A GM may assign that player at most once in each campaign, with no more than four active seats per campaign. New accounts remain disabled until the player activates the GM-issued single-use token and chooses a password. A player selects only from campaigns linked to their own active seat. Seed responses contain only the fields explicitly included by the GM; each field left blank at assignment may be completed by that player. Finalization requires all GM-marked required fields and changes the character from `seed` to `playable`. After finalization, the player may propose edits to character fields; these remain pending until the GM approves or rejects them. Approval applies the proposed fields atomically, rejection leaves the character unchanged, and only one request per character may be pending. The seed template records final ratings and manual life-path outcomes; it does not automate or validate Fourth Edition character-generation procedures.

## Mutation and Review Rules

- A player request or item proposal is pending data, not a mutation to accepted campaign state. Only a GM approval action may apply it, in one transaction that also records the reviewer and audit event.
- Creating a global player template and its new account invitation is one transaction. Campaign assignment separately inserts the player membership, campaign character copy, and seat atomically. A player may update only fields marked player-editable while the character status is `seed`; finalization checks required fields and atomically changes status to `playable`.
- After finalization, player edits are submitted as `character_change_requests`. Only the assigned player can submit; one pending request is allowed per character. GM approval applies the proposed fields atomically and records reviewer/time; rejection records the decision without modifying the character.
- Removing or changing a seat assignment is a GM action. It does not silently transfer that player's old local/session identity to another seat.
- An assigned character is a campaign copy of a player seed. Later edits to the independent GM seed do not alter the assigned character.
- A player-selected item source category is an unverified claim until the GM checks the cited Fourth Edition source. Keep `sourceCategory`, citation, and verification status distinct. Proposed or unverified item data cannot enter accepted inventory as verified rules data.
- For dice-governed item actions, record actor, character, action, relevant inputs, roll, outcome, and source/procedure reference. If the applicable procedure is unclear or unverified, leave the action pending GM adjudication; do not automate it.
- Do not calculate carrying capacity or encumbrance penalties until the Fourth Edition procedure, required character inputs, and item weights are verified. Otherwise label the limitation and keep the effect GM-managed.
- Every accepted mutation increments the campaign revision and updates server timestamps. Important decisions and publication changes append audit events; audit history is not edited by players.

## SQLite and Recovery Rules

Faction-layer writes replace only one campaign faction's influence cells or one settlement's ordered links. Ownership and `expectedRevision` are checked inside the write transaction; invalid references, duplicates, and stale revisions leave data unchanged. Runtime backups include these rows and prominence ranks. Browser overlays are not authoritative for selected runtime campaigns.

- Use database transactions for setup import, player-request approval, inventory changes, seat assignment, and publication replacement.
- Enforce foreign keys, unique membership/seat constraints, valid status enums, and campaign ownership in the service and database where practical.
- Keep runtime schema migrations explicit and ordered. Back up the SQLite database before migration; do not silently discard unknown fields or downgrade newer data.
- JSON runtime backups include private GM data and must be labeled GM-only. Validate before restore; preview the target campaign and require confirmation before replacing it. Preserve an existing database if validation or restore fails.
- Implemented backup slice: private runtime backups include supported records, report/map drafts, inventories/proposals, conditions, COMMS, and audit metadata. Same-owned-campaign restore requires revision and replacement/older-backup confirmation, advances live revisions, withdraws publication, and merges audit history without erasing later entries. Accounts/credentials are not restored; referenced accounts must exist. Legacy browser overlays and full past-content publication archives remain outside this format.
- Player exports, if added, use only `fieldbook.player-view`; they must never be an alternate route to full runtime backups.
- Keep credentials, session secrets, and password hashes out of JSON exports and logs. Store a database backup separately from the live database and document a restore check before calling backups reliable.

## Phase 0 Verification Gates

Before treating this contract as implemented:

- Round-trip a setup-v2 package into a new runtime campaign without modifying the source package; reject malformed/unsupported packages atomically.
- Export and restore a runtime save while preserving IDs, revisions, assignments, and GM-only visibility.
- Exercise one-player and four-player campaigns with separate sessions.
- Verify GM-created usernames only, temporary-password delivery and forced first-login change, GM password reset, unique user-to-seed assignment per campaign, blank-only seed completion, required-field finalization, pending post-finalization edits, GM approval/rejection, and denied cross-seat access.
- Verify server-side denial for unauthenticated access, cross-campaign access, cross-seat character/inventory access, GM-only records, unpublished content, and player attempts to mutate accepted state.
- Verify that player proposals remain pending until GM approval and that approval/roll/publication records are auditable.
- Verify that a withdrawn publication disappears from player responses and that an older backup cannot silently overwrite a newer active campaign.
