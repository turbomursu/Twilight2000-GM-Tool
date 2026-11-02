# Player Party Faction - Phase 1 Implementation Complete

**Status**: ✅ MVP Implementation Complete
**Date**: 2026-11-01
**Schema Version**: 15

---

## What Was Implemented

### Core Infrastructure

1. **Database Schema Changes**
   - Added `faction_type` to factions table (values: `'player-party'`, `'npc'`)
   - Added `is_player_controlled` (boolean) to flag player-owned factions
   - Added `current_location_id` to track party location (nullable, no FK constraint for flexibility)
   - Added `morale_rating` (A-D) per T2K 4E Unit Morale rules
   - Added `resources_json` for shared party resources (future use)
   - Created `party_members` table to track character-to-party relationships
   - Created unique index to ensure only one player-party faction per campaign

2. **Auto-Creation on Campaign Import**
   - When a campaign is imported, `importSetupPackage()` automatically:
     - Creates a "Player Party" faction with ID `party-{runtime_id}`
     - Sets initial location to first starting location (or first map location if not found)
     - Sets default morale to C
     - Sets color to Blue (#4A90E2)
     - Marks as `is_player_controlled = 1`

3. **Automatic Member Sync**
   - New function `syncPartyFactionMembers()` syncs party membership from active player seats
   - Called automatically before reading faction layers
   - Removes members whose characters are no longer assigned
   - Adds members for newly assigned characters
   - Tracks `joined_at` timestamp for each member

4. **API Endpoint**
   - `GET /api/campaigns/{id}/party` — Returns party faction data including:
     - Party ID, name, description, color
     - Current location ID and name
     - Morale rating
     - Resources (if stored)
     - Party member list (character IDs, names, display labels)
   - Only accessible to GM (authorization check built in)

### Files Changed

| File | Changes |
|------|---------|
| [server/runtime-store.cjs](/server/runtime-store.cjs) | Schema version 15 migration, party creation in import, member sync function, getPartyFaction() getter |
| [server/campaigns.cjs](/server/campaigns.cjs) | Import getPartyFaction, add `/api/campaigns/{id}/party` endpoint |
| [gmpack/PLAYER_PARTY_FACTION_DESIGN.md](/gmpack/PLAYER_PARTY_FACTION_DESIGN.md) | Comprehensive design document with 4-phase roadmap |

---

## How It Works

### Campaign Import Flow

```
User imports setup package
  ↓
importSetupPackage() creates base campaign
  ↓
Parse locations, settlements, factions from package
  ↓
[NEW] Create "Player Party" faction with:
  - type: 'player-party'
  - location: first starting location
  - morale: 'C'
  - color: '#4A90E2'
  ↓
Campaign ready for play
```

### Party Member Sync

When GM loads faction layers or party data:

```
Request faction layers
  ↓
syncPartyFactionMembers() runs:
  - Query active player seats (character IDs)
  - Remove stale members (no longer assigned)
  - Add new members (newly assigned)
  ↓
Faction layers returned with party included
```

### Player Visibility

**What players see:**
- Party faction appears in faction influence layers (if GM publishes map)
- Party location shows on published map (GM controls publication)
- Party member names (own + other player characters)

**What players DON'T see:**
- GM-only party notes
- Internal resource tracking
- Morale change reasons
- Party location until GM publishes

---

## Testing & Verification

### Basic Flow Verified
✅ Server starts without errors
✅ Database schema version 15 creates successfully
✅ Campaign import works
✅ Party faction auto-created on import
✅ Party member sync functions work
✅ GET /api/campaigns/{id}/party endpoint accessible

### Sample Party Response
```json
{
  "party": {
    "id": "party-{runtime_id}",
    "name": "Player Party",
    "description": "The player character group",
    "color": "#4A90E2",
    "type": "player-party",
    "isPlayerControlled": true,
    "currentLocationId": "location-start",
    "currentLocationName": "Starting Village",
    "moraleRating": "C",
    "resources": null,
    "members": [
      {
        "characterId": "char-1",
        "name": "Alice",
        "displayLabel": "Player 1"
      },
      {
        "characterId": "char-2",
        "name": "Bob",
        "displayLabel": "Player 2"
      }
    ]
  }
}
```

---

## Current Limitations

### Not Yet Implemented (Phase 2-4)
- ❌ GM dashboard panel for party management
- ❌ GM controls to change party location
- ❌ GM controls to change party morale
- ❌ GM controls to manage party resources
- ❌ Party location updates in published map
- ❌ Auto-publish party morale to players
- ❌ Party influence hex editor
- ❌ Party settlement prominence management
- ❌ Resource consumption tracking
- ❌ Auto-calculate morale from highest Command skill
- ❌ Party UI in Player Interface

### Authorization
✅ Party operations restricted to GM (campaign_memberships.role = 'gm')
✅ Player reads only return published data
✅ Server enforces all permissions (not just UI hiding)

### Data Consistency
✅ Party creation atomic within import transaction
✅ Member sync idempotent (safe to call multiple times)
✅ Removal of characters cascades to party_members
✅ Unique party per campaign enforced by index

---

## Next Steps (Phase 2 - GM Party Management UI)

### 1. GM Dashboard Panel
- Display current party faction in campaign dashboard
- Show party location, morale, members
- Show party influence on map (read-only initially)
- Link to party management controls

### 2. Party Location Control
- Dropdown to select location
- Update `factions.current_location_id` on change
- Persist in database
- Re-publish map if map publication includes party

### 3. Party Morale Editor
- Dropdown A-D
- Update `factions.morale_rating`
- Audit trail (log morale changes)
- Optional: auto-suggest based on session events

### 4. Party Resources (Optional)
- Text inputs for ammo, fuel, rations
- Store in `resources_json`
- Display in dashboard
- Optional: subtract per shift (automation)

### Dependencies
- Requires faction layer UI updates to display party separately
- Requires map publication updates to include party location in published map
- Requires audit logging for morale/location changes

---

## Architecture Notes

### Why Party as a Faction?
- Reuses existing faction infrastructure (influence cells, settlements)
- Party appears naturally in faction UI without special cases
- Scales to future multi-party scenarios
- Separates party concerns from individual character concerns

### Why `faction_type` Instead of Separate Table?
- Simpler schema (one table instead of two)
- Preserves faction ID stability
- Easier to extend (can add more types later)
- All faction operations work uniformly

### Why `current_location_id` Without FK?
- Allows flexibility (location might not exist yet during import)
- Avoids circular dependency during import
- Application code validates location exists

### Sync Strategy
- `syncPartyFactionMembers()` runs before reads, not on writes
- Idempotent (safe to call multiple times)
- Ensures consistency without triggers
- Can be called explicitly for testing/debugging

---

## Code Locations

**Schema Migration:**
- [server/runtime-store.cjs:519-545](/server/runtime-store.cjs#L519-L545) — Version 15 migration

**Party Creation:**
- [server/runtime-store.cjs:1099-1114](/server/runtime-store.cjs#L1099-L1114) — Auto-create in importSetupPackage

**Member Sync:**
- [server/runtime-store.cjs:1126-1158](/server/runtime-store.cjs#L1126-L1158) — syncPartyFactionMembers function

**Party Getter:**
- [server/runtime-store.cjs:1706-1749](/server/runtime-store.cjs#L1706-L1749) — getPartyFaction function

**API Endpoint:**
- [server/campaigns.cjs:215-222](/server/campaigns.cjs#L215-L222) — GET /api/campaigns/{id}/party

---

## Rollback Plan

If issues discovered:
1. Stop server, backup database
2. Revert commits: `git revert HEAD`
3. Delete database files (`*.db*`)
4. Downgrade schema version to 14:
   - Manually update `PRAGMA user_version` to 14
   - Or delete database and start fresh
5. Restart server

---

## Performance Impact

- Schema additions: Minimal (4 new columns, 1 new table)
- Member sync: O(n) where n = number of player seats, runs once per faction layer read
- API response: 1-2 small queries + JSON serialization

No significant performance impact expected.

---

## See Also

- [PLAYER_PARTY_FACTION_DESIGN.md](./PLAYER_PARTY_FACTION_DESIGN.md) — Full design including phases 2-4
- [DATA_MODEL.md](../metadata/DATA_MODEL.md) — Overall data model
- [GAME_LOOP.md](./GAME_LOOP.md) — Campaign progression and party morale context
- [CHARACTER_AND_NPC_CREATION.md](./CHARACTER_AND_NPC_CREATION.md) — Unit Morale rules reference
