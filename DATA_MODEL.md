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
| `accounts` | Account ID, GM-assigned login identifier, global role (`gm` or `player`), creating GM, password hash, disabled state, timestamps. New player accounts start disabled and are activated with a short-lived, single-use token; there is no public account registration. Never store plaintext passwords or expose password hashes to clients. |
| `account_invites` | Account ID, one-time token hash, expiry, creation time. Store only a hash; delete the invite when activated or expired. |
| `campaign_memberships` | Campaign ID, account ID, role (`gm` or `player`); the initial model allows one GM owner. A player membership must map to exactly one seat. |
| `player_seats` | Seat ID, campaign ID, account ID, assigned character ID, display label, active state, assignment time. This is the single ownership link; enforce unique `(campaign_id, account_id)` and `(campaign_id, character_id)` pairs and at most four active player seats per campaign. |
| `characters` | Character ID, campaign ID, seed/playable status, and bounded character fields. GM-authored seed fields explicitly carry a player-editable flag determined at assignment; only fields left blank by the GM are player-editable. Player ownership is derived from the seat assignment. |
| `inventory_items` | Item ID, campaign ID, owner character ID, item fields, quantity, source category (`RB`, `GM`, `UF`), source reference, verification status, and acceptance state. |
| `runtime_dashboard_state` | Per-campaign date/day, distance, rations, fuel, weather and note, active route-stop index, and update timestamp. Values are GM-entered campaign state, not inferred rules outcomes. |
| `situation_reports` | Implemented per-campaign saved draft, separate current published JSON, publication time, and monotonic optimistic report revision. Only title, body, and manually entered game time are allowed in report payloads. Withdrawal keeps the draft but clears the published fields. |
| `map_publications` | Implemented per-campaign map draft, explicit schema-v1 current player snapshot, publication timestamp, and optimistic map revision. Drafts select location IDs, ordered selected-location route IDs, bounded labeled point markings, and a GM-set position. Published data omits source notes/visibility, descriptions, terrain/factions, atlas, and raw annotations. |
| `route_stops` | Ordered campaign route entries linked to locations, with a display detail and distance from the preceding stop. |
| `personnel` | GM-managed roster entries with role, condition, readiness label, and stable display order; these do not replace player-character records. |
| `maps`, `locations`, `terrain_cells` | Campaign-scoped map metadata, bounds/atlas references, editable map annotations, locations and visibility eligibility, and axial Q/R terrain labels. Retain map-rendering coordinates separately from grid references. |
| `settlements`, `factions`, `faction_influence_cells`, `settlement_factions` | Campaign-scoped setup/runtime records, independent overlapping faction influence, and explicit per-settlement faction prominence order. These records have no rules effects unless a verified procedure is separately implemented. |
| `routes`, `waypoints`, `resources`, `journal_entries`, `gm_notes`, `events`, `missions` | Campaign runtime records with stable IDs, timestamps, and explicit visibility. GM notes default to GM-only. Rules-driven effects remain unimplemented until verified. |
| `character_change_requests` | Character field edits submitted by the assigned seat after finalization. Store proposed values, `pending`/`approved`/`rejected` status, submitter seat, timestamps, reviewing GM, and review note. Pending requests never alter accepted character data. |
| `item_proposals` | Player-authored item/data proposals scoped to the submitting seat; include status, submission time, reviewer, review time, and decision. |
| `comms_messages` | Implemented campaign-scoped stable ID/send order, private sender account reference, public sender-label/role snapshot, single-line text, nullable game date/day snapshot, and UTC sent timestamp. Visible only to the owning GM and active campaign seats. Read/delivery receipts are planned. |
| `publications` | Planned full publication history, publisher, and withdrawal/supersession records. Current report and map tables retain drafts and one published snapshot each, not audit/history records. |
| `audit_events` | Planned actor account/seat, campaign, action, target, server/game time, and outcome history for approvals, publications, assignments, and dice-governed actions. The current report revision is conflict protection, not an audit log. |

All IDs are opaque stable strings generated by the service. Relationships are campaign-scoped and enforced with foreign keys/unique constraints. Clients cannot choose another campaign's IDs to gain access.

`GET /api/campaigns/:id/runtime` returns the owning GM's campaign summary, dashboard state, ordered route, personnel, and journal. `PUT` on the same route supports partial dashboard-state updates and replacement personnel/journal lists in one transaction; route definitions remain read-only. Both responses omit accounts, seats, player characters, GM notes, and setup source contents.

GM report actions use `/api/campaigns/:id/situation-report` with a report-specific `expectedRevision` checked inside the SQLite transaction. Publish copies the saved draft; preview is read-only. The player endpoint independently checks active campaign assignment and constructs a fresh allow-listed projection with only title, body, game time, and publication timestamp. It never serializes the GM campaign object or draft. Runtime-v1 backups add an optional draft record; restore clears current publication and advances report revision. Older backups recover an empty draft, and failed restores remain atomic.

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
| Approve/reject a request or proposal | Allowed; decision is audited | Denied |
| Build, publish, replace, or withdraw player view | Allowed; each published revision is audited | Denied |
| Send/read group COMMS | Read/send within owned campaign; moderation planned | Send as self; read messages for active assigned campaigns only |
| Access another campaign or another seat's private data | Denied unless separately assigned a GM role | Denied |

Authenticate the account on the server and derive campaign role and player seat from the authenticated session and database membership. Never trust a client-supplied role, seat ID, character ID, campaign ID, or `RB`/`GM`/`UF` claim as authorization. Check campaign membership and record ownership on every endpoint, including exports and nested resources.

A GM may assign at most one player seed to a username in each campaign. New accounts remain disabled until the player activates the GM-issued single-use token and chooses a password. A player selects only from campaigns linked to their own active seat. Seed responses contain only the fields explicitly included by the GM; each field left blank at assignment may be completed by that player. Finalization requires all GM-marked required fields and changes the character from `seed` to `playable`. After finalization, the player may propose edits to character fields; these remain pending until the GM approves or rejects them. Approval applies the proposed fields atomically, rejection leaves the character unchanged, and only one request per character may be pending. These seed fields are identity/backstory data and do not infer or calculate game rules.

## Mutation and Review Rules

- A player request or item proposal is pending data, not a mutation to accepted campaign state. Only a GM approval action may apply it, in one transaction that also records the reviewer and audit event.
- Seed assignment and account invitation are one transaction. A player may update only fields marked player-editable while the character status is `seed`; finalization checks required fields and atomically changes status to `playable`.
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
- Implemented backup slice: `GET /api/campaigns/:id/backup` exports supported campaign rows with stable IDs and a checksum. `POST /api/campaigns/:id/restore` restores only the selected owned campaign, requires its expected revision plus replacement confirmation, and additionally confirms older backups. Restore preserves source revision provenance but advances the active revision monotonically. Accounts and credentials are not restored; referenced accounts must already exist. Browser-local faction edits and future publication/audit systems are not part of this format yet.
- Player exports, if added, use only `fieldbook.player-view`; they must never be an alternate route to full runtime backups.
- Keep credentials, session secrets, and password hashes out of JSON exports and logs. Store a database backup separately from the live database and document a restore check before calling backups reliable.

## Phase 0 Verification Gates

Before treating this contract as implemented:

- Round-trip a setup-v2 package into a new runtime campaign without modifying the source package; reject malformed/unsupported packages atomically.
- Export and restore a runtime save while preserving IDs, revisions, assignments, and GM-only visibility.
- Exercise one-player and four-player campaigns with separate sessions.
- Verify GM-created usernames only, unique user-to-seed assignment per campaign, account activation expiry and single use, blank-only seed completion, required-field finalization, pending post-finalization edits, GM approval/rejection, and denied cross-seat access.
- Verify server-side denial for unauthenticated access, cross-campaign access, cross-seat character/inventory access, GM-only records, unpublished content, and player attempts to mutate accepted state.
- Verify that player proposals remain pending until GM approval and that approval/roll/publication records are auditable.
- Verify that a withdrawn publication disappears from player responses and that an older backup cannot silently overwrite a newer active campaign.
