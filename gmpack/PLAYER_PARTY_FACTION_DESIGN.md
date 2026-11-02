# Player Party as Special Faction - Feature Design

> Design for making player characters part of an auto-created "Party" faction
> Party has shared location, influence, and controlled areas like other factions

---

## Overview

**Goal**: Integrate the player character group as a trackable faction within the existing faction system, enabling:
- Shared party location (single hex where all player characters are positioned)
- Party influence on the map (hexes controlled/influenced by the party)
- Party prominence in settlements (party relationships with non-player factions)
- Unified party morale and resources at faction level
- GM tracking of party-level state separate from individual character state

**Implementation**: Auto-create a special "Party" faction per campaign at import/creation time. Treat it as a regular faction but with special properties and GM-only controls.

---

## Data Model Changes

### 1. Factions Table (Enhanced)

**Current Schema:**
```sql
CREATE TABLE factions (
  runtime_campaign_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT,
  PRIMARY KEY (runtime_campaign_id, id)
);
```

**Enhanced Schema:**
```sql
CREATE TABLE factions (
  runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT,
  faction_type TEXT NOT NULL CHECK (faction_type IN ('player-party', 'npc')) DEFAULT 'npc',
  is_player_controlled INTEGER NOT NULL CHECK (is_player_controlled IN (0, 1)) DEFAULT 0,
  current_location_id TEXT,  -- Location ID for party position; NULL for NPC factions
  morale_rating TEXT CHECK (morale_rating IN ('A', 'B', 'C', 'D')) DEFAULT 'C',  -- Party morale only
  resources_json TEXT,  -- JSON: {ammo, fuel, rations, supplies, notes}
  PRIMARY KEY (runtime_campaign_id, id),
  FOREIGN KEY (runtime_campaign_id, current_location_id) REFERENCES locations(runtime_campaign_id, id),
  UNIQUE (runtime_campaign_id, faction_type) WHERE faction_type = 'player-party'
);
```

**Rationale:**
- `faction_type`: Distinguishes "player-party" (auto-created, special) from "npc" (GM-created)
- `is_player_controlled`: Marks any faction that represents the player group (may add secondary parties later)
- `current_location_id`: Tracks party location (where all PCs are positioned)
- `morale_rating`: Party morale per T2K 4E rules (A-D, typically equals highest Command skill)
- `resources_json`: Party-level resource tracking (shared ammo, fuel, rations)
- `UNIQUE constraint`: Only one player-party faction per campaign

### 2. Party-Location Association

**New Table: party_position**
```sql
CREATE TABLE IF NOT EXISTS party_position (
  runtime_campaign_id TEXT PRIMARY KEY REFERENCES campaigns(runtime_id),
  faction_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (runtime_campaign_id, faction_id) REFERENCES factions(runtime_campaign_id, id),
  FOREIGN KEY (runtime_campaign_id, location_id) REFERENCES locations(runtime_campaign_id, id)
);
```

**Alternative**: Store location directly in factions table (simpler, already in design above)

**Rationale**: Single source of truth for party location; updateable by GM only.

### 3. Party Membership (Track Which Characters Belong to Party)

**New Table: party_members**
```sql
CREATE TABLE IF NOT EXISTS party_members (
  runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id),
  faction_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)) DEFAULT 1,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (runtime_campaign_id, faction_id, character_id),
  FOREIGN KEY (runtime_campaign_id, faction_id) REFERENCES factions(runtime_campaign_id, id),
  FOREIGN KEY (runtime_campaign_id, character_id) REFERENCES characters(campaign_id, id)
);
```

**Rationale:**
- Explicit link between player characters and party faction
- Tracks when characters join/leave (for campaign history)
- Supports dismissing or adding characters to party
- Allows multi-party scenarios (rare but supported)

---

## Initialization: Auto-Create Party Faction

### When Party is Created

**Trigger**: When a runtime campaign is imported from setup package

**Process**:
1. **Check if party faction exists**: Query for `faction_type = 'player-party'`
2. **If not exists**: Create it:
   ```sql
   INSERT INTO factions (runtime_campaign_id, id, name, description, faction_type,
                         is_player_controlled, color, morale_rating)
   VALUES (?, 'party-' || ?, 'Player Party', 'The player character group', 'player-party', 1,
           '#4A90E2', 'C')
   ```
3. **Auto-associate player characters**:
   - Query all active player seats
   - For each assigned character: Insert into party_members
   ```sql
   INSERT INTO party_members (runtime_campaign_id, faction_id, character_id, joined_at)
   SELECT ?, 'party-' || ?, character_id, ? FROM player_seats WHERE campaign_id = ?
   ```
4. **Set starting location**:
   - Query starting location (first route stop or GM-configured location)
   - Update factions.current_location_id
   ```sql
   UPDATE factions SET current_location_id = ?
   WHERE runtime_campaign_id = ? AND faction_type = 'player-party'
   ```

### Party Properties

| Property | Value | Editable |
|----------|-------|----------|
| ID | `party-{campaign-id}` | No (auto-generated) |
| Name | "Player Party" | Yes (GM only) |
| Type | player-party | No |
| Location | First route stop / GM-set | Yes (GM only) |
| Influence Cells | GM-defined (hex grid) | Yes (GM only) |
| Morale | C (default) | Yes (GM only) |
| Color | Blue (#4A90E2) | Yes (GM only) |
| Members | All active player characters | Auto-sync with player seats |

---

## GM Interface: Party Management

### Dashboard Party Panel (New Section)

**Shows:**
- Party name and description
- Current location (with map link)
- Party morale rating (A-D)
- Current members (player character list)
- Shared resources (ammo, fuel, rations)
- Faction influence on map (hexes controlled)
- Settlement relationships (prominence with other factions)

### GM Controls

**Party Location**:
- Dropdown/map picker to set current location
- Updates location-based resources/events
- Updates player-visible map position automatically

**Party Morale**:
- Dropdown A-D
- Syncs with Unit Morale rules (T2K 4E)
- Can be modified after session events

**Party Resources**:
- Text fields for ammo, fuel, rations
- Notes for resource state
- Tracks consumption per shift/session

**Party Influence**:
- Hex painter (like faction influence layers)
- Select hexes to mark as party-controlled
- Different visual style from NPC faction layers (e.g., bold border)

**Party Settlements**:
- Table showing settlements where party has prominence
- Set prominence rank relative to other factions
- Track settlement attitude toward party

---

## Player Interface: Party Visibility

### What Players See

✅ **Published by GM**:
- Party location (current hex/settlement)
- Party morale (after GM publishes)
- Party-level situation notes
- Party influence hexes (if GM publishes)
- Party members (own character + other player character names)

❌ **Never Published**:
- GM-only party notes
- Internal party resource tracking
- Party morale change causes
- Party faction influence details
- NPC faction data

**Implementation**: Party location uses existing map publication system. GM publishes party location as the map center/player position. Party morale and resources tracked in situation report or separate player-visible dashboard if GM chooses.

---

## Game Mechanics Integration (T2K 4E)

### Party Morale (T2K 4E Unit Morale)

**Definition** (from Character & NPC Creation reference):
- Party has morale rating A–D (dice size)
- Typically equals highest Command skill score in party
- Can be modified by session events
- Added to individual CUF rolls during stress

**Implementation in Fieldbook**:
1. Track party morale in factions.morale_rating
2. Suggestion: Display highest party member's Command skill as default
3. GM can override if morale changed by events
4. Optional: Calculate automatically if Command skill data is stored

### Party Location as Tactical Anchor

**Purpose**:
- All player characters start at same location (unless separated)
- Travel movement is party-based, not individual
- Resource consumption is party-shared
- Encounters affect party as unit

**Implementation**:
- Party.current_location_id is GM-set per session
- Published to players via map position
- Used for travel/encounter resolution
- Can change multiple times per session (during travel)

### Party Resources (Homebrew Extension)

**Optional**: Track shared party resources in factions.resources_json

**Fields**:
```json
{
  "ammunition": 150,
  "fuel_units": 8,
  "rations_days": 12,
  "medical_supplies": 3,
  "equipment_notes": "One vehicle down, one operational"
}
```

**Usage**:
- GM updates resources per shift/session
- Displays in dashboard
- Can trigger resource-scarcity scenarios
- Optional automation: subtract consumption per Strategic Play procedures

---

## Implementation Phases

### Phase 1: Core Party Faction (MVP)
- ✅ Add faction_type field to factions table
- ✅ Auto-create "player-party" faction on import
- ✅ Display party in faction layers UI (read-only for players)
- ✅ GM can set party location via location dropdown
- ✅ Party location appears on faction influence map
- ✅ Party morale tracking (manual entry)

**Effort**: 1-2 sprints

**Deliverable**: Players can see their party's location and faction color on map; GM can track party morale and location

### Phase 2: Party Management UI
- ✅ GM dashboard panel for party properties
- ✅ Party member list (auto-sync with player seats)
- ✅ Party morale editor
- ✅ Party influence hex painting
- ✅ Settlement prominence links
- ✅ Party location change tracking

**Effort**: 2-3 sprints

**Deliverable**: Full GM control over party faction like any other faction; party location visible in player interface

### Phase 3: Party Resources
- ✅ Resource tracking in factions table (ammo, fuel, rations)
- ✅ GM resource editor in dashboard
- ✅ Optional: Auto-subtract from travel shifts
- ✅ Display in situation report (if GM publishes)

**Effort**: 1-2 sprints

**Deliverable**: GM tracks shared party resources; visible in GM dashboard

### Phase 4: Party Mechanics Integration
- ✅ Auto-calculate party morale from highest Command skill
- ✅ Link party morale to character CUF rolls (procedural, not automated yet)
- ✅ Display suggested morale changes after session events
- ✅ Support party resource consumption per T2K 4E Strategic Play procedures

**Effort**: 2-3 sprints

**Deliverable**: Party morale and resources fully integrated with campaign procedures

---

## Data Flow: Session Example

### Before Session
1. **GM opens campaign**
   - Party faction auto-loaded
   - Current location: "Vansbro"
   - Morale: B (from last session)
   - Resources: 200 ammo, 5 fuel, 10 rations

2. **GM publishes situation report**
   - "Party at Vansbro, searching for fuel depot"
   - Party location auto-sets map center (players see their position)

3. **Players log in**
   - See "At Vansbro" in player interface
   - See party faction on map
   - Can submit character edits/proposals

### During Session
4. **GM runs travel shift** (Strategic Play)
   - Party travels from Vansbro to Mora (2 hexes)
   - GM updates party location to Mora
   - GM updates distance traveled (+ 40km)
   - GM deducts resources: -20 ammo, -1 fuel, -2 rations

5. **Party encounters hostile force**
   - Combat resolves (not yet automated)
   - GM updates resources: -50 ammo, +1 injured member
   - GM updates morale: B → C (due to injury and resource stress)

6. **Session ends**
   - GM saves party state
   - Journal entry: "Ambush at Mora; one injured; low fuel"
   - Party morale C, location Mora, fuel down to 4 units

### After Session
7. **Campaign backup includes party state**
   - Factions table: party location, morale, resources
   - Audit log: morale changes, location updates
   - Ready for next session

---

## Authorization & Access Control

### GM Authority
- ✅ Create/delete/edit party faction name/description
- ✅ Set party location
- ✅ Set party morale
- ✅ Update party resources
- ✅ Manage party influence hexes
- ✅ View all party data
- ✅ Add/remove party members (via player seat assignment)

### Player Authority
- ✅ View published party location
- ✅ View published party morale (if included in situation report)
- ✅ View party member names
- ✅ View party influence hexes (if included in published map)
- ❌ Cannot modify party state
- ❌ Cannot see GM-only party notes/resources
- ❌ Cannot change party location

### Server Enforcement
- All party updates require GM authorization (check campaign_memberships.role = 'gm')
- Player reads only allow published party data
- Location changes update both factions table and published map
- Morale changes tracked in audit log

---

## Migration & Backward Compatibility

### For Existing Campaigns
1. **Add new factions table columns** via ALTER TABLE
   - faction_type (default 'npc' for existing rows)
   - is_player_controlled (default 0)
   - current_location_id (nullable)
   - morale_rating (default 'C')
   - resources_json (nullable)

2. **Create party faction on first access**
   - If campaign lacks player-party faction, auto-create it
   - Associate all active player seats with party
   - Set location to first route stop

3. **No breaking changes**
   - Existing faction_influence_cells queries unchanged
   - Existing settlement_factions queries unchanged
   - UI gracefully shows new party faction

---

## Database Schema Migration Script

```sql
-- Add new columns to factions table
ALTER TABLE factions ADD COLUMN faction_type TEXT DEFAULT 'npc';
ALTER TABLE factions ADD COLUMN is_player_controlled INTEGER DEFAULT 0;
ALTER TABLE factions ADD COLUMN current_location_id TEXT;
ALTER TABLE factions ADD COLUMN morale_rating TEXT DEFAULT 'C';
ALTER TABLE factions ADD COLUMN resources_json TEXT;

-- Add constraint check (requires column exists first)
-- ALTER TABLE factions ADD CONSTRAINT check_faction_type
--   CHECK (faction_type IN ('player-party', 'npc'));
-- ALTER TABLE factions ADD CONSTRAINT check_morale
--   CHECK (morale_rating IN ('A', 'B', 'C', 'D'));

-- Create party_members table (tracks which characters belong to party)
CREATE TABLE IF NOT EXISTS party_members (
  runtime_campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
  faction_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (runtime_campaign_id, faction_id, character_id),
  FOREIGN KEY (runtime_campaign_id, faction_id) REFERENCES factions(runtime_campaign_id, id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_campaign_id, character_id) REFERENCES characters(campaign_id, id) ON DELETE CASCADE
);

-- Index for quick party membership queries
CREATE INDEX idx_party_members_faction
  ON party_members(runtime_campaign_id, faction_id)
  WHERE is_active = 1;
```

---

## API Endpoints (Proposed)

### Get Party Faction
```
GET /api/campaigns/:id/party
Response: { faction: {...}, members: [...], influence: [...] }
```

### Update Party Location
```
PUT /api/campaigns/:id/party
Body: { locationId: "...", expectedRevision: 3 }
Response: { faction: {...}, published: true/false }
```

### Update Party Morale
```
PATCH /api/campaigns/:id/party/morale
Body: { rating: "B", note: "Injured member" }
Response: { faction: {...} }
```

### Update Party Resources
```
PATCH /api/campaigns/:id/party/resources
Body: { ammunition: 150, fuel_units: 5, rations_days: 10 }
Response: { faction: {...} }
```

### Get Party Members
```
GET /api/campaigns/:id/party/members
Response: { members: [{id, name, condition, readiness}, ...] }
```

---

## Testing Strategy

### Unit Tests
- Party faction auto-creation on import
- Party member list accuracy
- Location updates update both factions and published map
- Morale changes tracked in audit log
- Authorization checks (GM-only updates)

### Integration Tests
- Campaign import creates party faction
- Player sees party location on map
- GM updates party location; players see change
- Morale change persists after save/restore
- Backup/restore includes party state

### Game Test
- Session: Party starts at "Sälen", GM updates to "Vansbro"
- Players see location update in map
- Party morale changes: C → B (victory scenario)
- Resources consumed: -50 ammo per combat encounter
- Campaign backup includes all party changes

---

## See Also

- [DATA_MODEL.md](../metadata/DATA_MODEL.md) — Current data model (factions, settlements)
- [GAME_LOOP.md](./gmpack/GAME_LOOP.md) — Campaign progression and party morale rules
- [CHARACTER_AND_NPC_CREATION.md](./gmpack/CHARACTER_AND_NPC_CREATION.md) — Unit morale mechanics (T2K 4E)
- ROADMAP.md — Feature delivery sequencing
- FEATURES.md — Current implementation status
