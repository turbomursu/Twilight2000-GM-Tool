# T2K 4E Fieldbook Game Loop

> Comprehensive reference for game loop phases, time scales, and GM/player interactions
> Based on Twilight: 2000 Fourth Edition rules and Fieldbook tool architecture

---

## Overview

The game operates across three distinct time scales and scenarios:

1. **Campaign Setup** (one-time, GM-only)
2. **Session Loop** (repeats each play session; primary interaction)
3. **Combat Rounds** (~6 seconds each; tactical time scale)
4. **Travel Shifts** (~6 hours each; strategic time scale)

---

## Campaign Setup Phase (One-Time)

### 1. GM Creates Campaign in Setup Tool
- **Define Campaign Identity**
  - Name, setting (location), premise/scenario
  - Era (Twilight: 2000 setting)
  - Initial game date and time

- **Import Map**
  - Field Papers atlas GeoJSON import
  - Retains area/page extents and coordinates
  - Baseline for all map operations

- **Create Terrain Grid**
  - Assign 10km hexes (axial Q/R coordinates)
  - Reference T2K Referee Aid Strategic Play terrain table
  - Store terrain labels (Pavement, Field, Forest, Swamp, etc.)
  - Display values without applying mechanics

- **Define Locations**
  - Create location records with coordinates
  - Attach visibility eligibility (GM-only or player-visible)
  - Link to terrain grid (Q/R reference)
  - Retain latitude/longitude for map rendering

- **Create Settlements**
  - Select locations marked as settlements
  - Name and position from location editor
  - GM-defined scale (Camp, Village, Town, etc.)
  - Generate or manually edit descriptors (security, attitude, leadership)
  - Note population estimate (manual)

- **Define Factions**
  - Create faction records with identity
  - Assign faction influence to 10km hexes (independent overlapping layers)
  - Set settlement prominence order per faction
  - Factions are scenario aids; no automatic rules effects

- **Set Initial Routes & Waypoints**
  - Define travel route with ordered stops
  - Link stops to locations
  - Record distance between stops
  - Add route detail/flavor text

- **Add Scenario Notes**
  - GM-only premise, mission objectives
  - World state and background
  - Potential encounters and complications

### 2. Validate & Export
- **Validate Setup Package**
  - All required fields complete
  - GeoJSON/terrain/location data intact
  - No orphaned references

- **Export Setup Package** (versioned JSON contract)
  - Format: `fieldbook.campaign-setup`, schema v2
  - Immutable once exported
  - Can be reopened and edited; export creates new version

### 3. Import to GM Tool
- **Create Runtime Campaign**
  - Import setup package → new campaign ID in SQLite
  - Preserve setup record IDs for references
  - Record source package ID and checksum
  - Create initial dashboard state (game date, resources, weather)
  - Store immutable setup snapshot

### 4. Assign Players to Seats
- **Configure Player Seats** (1-4 players maximum)
  - Create unique player seat per account
  - Link seat to assigned character ID
  - Assign campaign membership (player role)
  - Set seat as active

- **Prepare Character Seeds**
  - Create character records (GM-authored seed)
  - Mark fields as GM-only or player-editable
  - Leave player-editable fields blank for player completion
  - Mark required fields for player finalization

---

## Session-Level Game Loop (Repeats Each Session)

### Phase 1: GM Prepares & Publishes

#### Review Current Campaign State
1. **Check Dashboard**
   - Current game date and day number
   - Distance traveled (kilometers)
   - Rations remaining (days supply)
   - Fuel units available
   - Current weather condition and notes
   - Active route-stop index (which location now?)

2. **Review Campaign Records**
   - Route stops and waypoints
   - Personnel roster (names, roles, conditions, readiness)
   - Journal entries (observations, mission updates, events)
   - Faction influence on map
   - Settlement status

#### Update Situation Report (GM Publication)
1. **Draft Situation Report**
   - Write title (situational heading)
   - Write body text (what players experience/know right now)
   - Manually set game date/time within report
   - No system-hidden information in published reports

2. **Preview Report**
   - Check rendering for clarity
   - Verify no spoilers or GM notes leaked

3. **Publish or Withdraw**
   - **Publish**: Makes report visible to all assigned players immediately
   - **Withdraw**: Hides current publication; keeps draft for revision
   - Records publication timestamp and revision number

#### Set Player Map Position
1. **Select Location on Campaign Map**
   - Click location where PCs are positioned
   - Mark with explicit point or region indicator

2. **Publish Map**
   - Map includes: locations, ordered route, published position marker
   - Omits: terrain grid, faction layers, raw annotations, GM notes
   - Players can scroll/zoom ±200% from current position
   - Reset button centers map on published player position

---

### Phase 2: Players Receive & React

#### Login & Access Campaign
1. **Player Authentication**
   - Sign in with player account
   - Select assigned campaign (typically only one option)
   - Session is player-role-scoped

2. **View Character & Campaign**
   - See assigned character seed/record in **Character** tab
   - View assigned personal inventory in **Inventory** tab
   - Read published situation report in **Sitrep** tab
   - Browse published campaign map in **Map** tab
   - Access group messaging in **COMMS** tab

#### Character Completion (First Session Only)
1. **Complete GM-Left-Blank Fields**
   - Edit fields marked as player-editable in seed
   - Fill in character appearance, background, personality
   - Finalize when all required fields complete

#### Take Actions During Session

**In-Character Communication:**
1. **Send COMMS Message**
   - Compose single-line message (to-all or to-GM)
   - System records sender name and campaign game time
   - Message visible to GM and all players in campaign
   - No guaranteed delivery order across browser sessions

**Character & Inventory Management:**
2. **Submit Character/Inventory Edit Proposals** (Post-Finalization)
   - Propose changes to character fields
   - Propose new items or item modifications
   - Proposal includes: proposed values, submitter seat, timestamp
   - Proposal stays **pending** until GM reviews

**Items must include source category:**
   - `RB` (Rulebook) — verified from T2K official sources
   - `GM` (GM-defined) — campaign-specific/homebrew
   - `UF` (Unverified) — player claimed source not yet verified
   - Source proposals are pending; cannot affect campaign until GM approves

3. **Browse Map** (Read-Only)
   - Scroll and pan across full published map
   - Zoom up to 200% (maximum)
   - Reset button centers map on current player position
   - No interactive measurements or calculations

#### No Direct Changes
- Players cannot directly modify character, inventory, or game state
- All post-finalization changes require GM review and approval
- Pending proposals never alter accepted character data

---

### Phase 3: GM Processes & Advances

#### Review Player Activity
1. **Read COMMS Messages**
   - See all messages sent during session
   - Note sender, timestamp, and content

2. **Review Change Proposals**
   - See pending character field edits
   - Review item proposals and source categories
   - Accept (apply to character) or reject (revert to prior)
   - Optional: Add review note for feedback

#### Update Campaign Runtime State

**Advance Time & Calendar:**
1. **Update Game Date & Clock**
   - Set current campaign date
   - Set time of day (if using time-of-day tracking)
   - Record number of days elapsed

**Weather & Environment:**
2. **Update Weather**
    - Roll 1D6 per Strategic Play rules and identify the matching weather symbol from the Referee Aid
    - Apply the aid's one-step improve or worsen result; do not infer a numeric face threshold when only the symbols are available
   - Conditions: Fair → Cloudy → Rain/Snow → Cloudy (min)
   - After heavy rain/snow, weather automatically reverts to Cloudy for ≥1 shift
   - Record weather condition and optional note

**Resources & Travel:**
3. **Track Resources**
   - Update ration days remaining (decrease per party consumption)
   - Update fuel units remaining (decrease per distance traveled)
   - Update distance traveled (kilometers)
   - Update active route-stop index (which location now?)

**Personnel & Conditions:**
4. **Update Personnel**
   - Track personnel roster (name, role, condition, readiness, display order)
   - Record injury/recovery status
   - Note stress or morale changes
   - Track deaths or departures

**Campaign Journal:**
5. **Add Journal Entries**
   - Record observations and discoveries
   - Note mission updates or complications
   - Document encounters and decisions
   - Timestamp all entries (game date, real time)
   - Optional entry kind/category (Observation, Combat, Event, etc.)

**Faction & Settlement Changes:**
6. **Update Factions & Influence** (If Relevant)
   - Adjust faction prominence in settlements
   - Modify faction influence on hexes (optional)
   - Record significant faction actions/reactions
   - Note relationship shifts

#### Save Runtime Backup
1. **Trigger Backup**
   - Download full campaign runtime as JSON
   - Format: `fieldbook.campaign-runtime`, schema v1
   - Includes: campaign state, characters, seats, journal, resources, all GM data

2. **Store Backups**
   - Keep multiple dated backups (manual)
   - Include checksum for integrity verification
   - Never expose to players

3. **Restore from Older Backup** (If Needed)
   - Select backup file
   - Preview: campaign name, export time, revision, checksum
   - Confirm replacement (for recent backups) or double-confirm (for old backups)
   - Restore resets published reports/maps to drafts; GM must republish

#### Prepare for Next Session
- Update setup package (optional; creates new version)
- Add notes for next GM session
- Preview upcoming route stops and encounters

---

### Phase 4: Repeat for Next Session
After GM closes session:
- Players may continue sending COMMS (GM reviews when back online)
- Players may submit edit proposals (remain pending until reviewed)
- GM reviews and processes at next session start
- Cycle repeats

---

## Combat Round Loop (~6 Seconds Per Round)

Used during tactical encounters (close combat, ranged firefight, ambush, etc.)

### Pre-Combat Setup

**Establish Initiative:**
1. Each participant draws one initiative card
2. Lowest card acts first
3. Surprises and ambushes go before normal initiative
4. Turn order established for the combat

**Set Starting State:**
- Determine terrain, visibility, range (hexes apart)
- Note cover, barriers, elevation
- Establish surprise/ambush conditions (if any)

### Per Participant Each Round

**Bank Actions at Round Start:**
- 2 Fast Actions
- 1 Slow Action
- Free Actions (list per combat type: movement, helping, etc.)

**Act in Initiative Order:**

1. **Declare Intent** (if needed)
   - Declare blocking (close combat) before attacker rolls
   - Declare push for skill roll
   - Declare overwatch position (ranged)

2. **Take Actions**
   - Spend fast or slow actions on: movement, attacks, aiming, special actions
   - Each action type has fixed cost (fast or slow)

3. **Movement** (if applicable)
   - Fast action: move 2 hexes (20 meters)
   - Make Mobility roll for additional hexes per success
   - Terrain affects movement speed/difficulty
   - Carrying backpack: -2 modifier to Mobility rolls

4. **Attack Resolution** (ranged, close combat, heavy weapons, etc.)
   - Declare attack type and target
   - Apply all relevant modifiers (range, terrain, stance, etc.)
   - Roll attribute + skill dice:
     - Close Combat: STR + Close Combat
     - Ranged: AGI + Ranged Combat
     - Heavy Weapons: STR + Heavy Weapons (or INT + Heavy Weapons for artillery)
   - On hit: Roll damage (weapon's base damage + successes)
   - Apply armor/ablation
   - Check for critical hit (specific thresholds per weapon)
   - Apply critical damage (roll crit table)
   - Apply stress if damage exceeds target's CUF

5. **End Turn**
   - Next participant in order takes actions
   - Continue until all combatants have acted

**Round End:**
- If combat ongoing, next round starts
- Actions refresh; new 2 fast + 1 slow + free actions available
- Initiative order remains same unless changed

### Combat Ends When:
- All enemies defeated/fled
- PCs defeated/captured/killed
- Combat objective achieved
- Participants agree to cease fire

### Post-Combat
- Record damage taken
- Track ammunition expended
- Note injuries and stress
- Award experience points (if earned)
- Recovery/medical treatment begins

---

## Travel/Strategic Play Loop (~6 Hours Per Shift)

Used during campaign travel between major encounters

### Start of Shift
1. **Determine Time of Day**
   - Morning, Day, Evening, Night
   - Set light level (full daylight, twilight, darkness)
   - Temperature varies by season and location

2. **Roll for Weather Change**
   - Roll 1D6 and apply the matching weather symbol shown in the Strategic Play Referee Aid
   - The local aid does not encode a numeric face mapping; record the physical result and GM-confirmed symbol outcome
   - Use cited visibility, ranged-attack, marching Stamina, and driving guidance for GM adjudication; do not infer blanket terrain modifiers

### Per-Participant Tasks

**Each PC performs one task** during the shift (or combination adding to full shift):

**Travel Tasks:**
- **Driving/Movement**: Requires Driving skill roll, terrain modifiers
- **Mobility Roll**: For difficult terrain (crawling, climbing)

**Exploration Tasks:**
- **Recon**: Spot enemies, discover locations, set ambush
- **Infiltration**: Move stealthily through terrain
- **Survival**: Find food, water, shelter

**Support Tasks:**
- **Tech Roll**: Vehicle maintenance (once per week per vehicle)
- **Medical**: Treat injuries
- **Scavenging**: Search for resources

### Resolve Tasks
- Roll relevant skill (modified by terrain, CUF for stress, etc.)
- Successes determine task quality/progress
- **Interruption Rule**: 3/4 of shift spent on primary task = benefits apply
- One shift interrupted can restart next shift

### Process Events
- Check for random encounters (per GM discretion)
- Resolve hazards or obstacles
- Apply NPCs/factions affecting party
- Discover locations/settlements

### Apply Resource Consumption
- Deduct rations per party size
- Deduct fuel per distance traveled
- Deduct ammunition if used
- Track water consumption

### Check for Campaign Changes
- Has unit morale changed? (major event)
- Did anyone suffer injury? (track Stress Capacity)
- Did war/faction status change? (campaign milestone)
- Did PC gain experience? (session/shift-based awards)

### Record Results
- Update journal entry for shift
- Note weather, distance, resources, events
- Record NPC interactions or messages

### Repeat
- Next shift begins (morning/day/evening/night cycles)
- Or campaign advances to next session

---

## Campaign Progression Model

### Short-Term: Single Session (1–3 Hours Real Time)

**Scope:** Tactical encounter or travel segment

**Activities:**
- Combat encounter or skill challenge
- Infiltration or reconnaissance
- Social interaction with NPCs
- Quick travel segment

**Update Frequency:**
- Player Interface updated frequently (situation report, map position)
- Combat rounds move fast (~1–2 minutes per round)
- COMMS messages exchanged

**Character Changes:**
- Stress/injury accumulation
- Equipment usage
- Temporary morale effects

---

### Medium-Term: Multiple Sessions (Days–Weeks Campaign Time)

**Scope:** Campaign progression, resource depletion, faction activity

**Activities:**
- Route advances through multiple stops
- Settlements encountered and explored
- Faction relationships evolve
- Personnel injuries/recovery tracked
- Unit morale rises/falls per events
- Resource consumption (rations/fuel) becomes significant

**Update Frequency:**
- Situation report updated per session (2–4 sessions per "day" of campaign time)
- Journal accumulates entries (observations, encounters, discoveries)
- Personnel conditions change
- Weather evolves

**Character Changes:**
- Stress accumulation → CUF rolling
- Experience accumulation → skill improvement
- Equipment wear/repair
- Relationship building with NPCs and group

---

### Long-Term: Campaign Arc (Months Campaign Time)

**Scope:** Major story events, war impact, character evolution

**Activities:**
- Major mission completion or failure
- Significant faction conflict/alliance
- War events affecting campaign setting
- Character advancement (attribute improvements, new skills)
- Leadership changes and morale shifts
- Campaign objective achievement or redefinition

**Update Frequency:**
- Situation reports become scenario updates
- Journal reflects campaign milestones
- Route may shift significantly
- New factions/locations introduced
- Major NPCs gain/lose prominence

**Character Changes:**
- Significant attribute improvements (via advancement)
- New specialties gained
- Moral code tests and changes
- Unit morale fundamentally altered
- Big Dream alignment/betrayal events

---

## Key System Boundaries & Authorization

### GM Authority (Enforced Server-Side)

✅ **Campaign Management:**
- Create, configure, and own campaigns
- Import setup packages
- Assign players to seats
- Control active state of campaign

✅ **Information Control:**
- Draft and publish situation reports
- Withdraw publications
- Set player map position and visibility
- Maintain GM-only notes and unrevealed state
- Keep faction secrets and encounter details hidden

✅ **Player Management:**
- Accept or reject character change proposals
- Approve or reject item proposals
- Manage personnel roster
- Record all campaign events in journal
- Issue COMMS messages to players
- Override any player decision (GM authority)

✅ **State Management:**
- Update dashboard (date, weather, resources, active stop)
- Update personnel conditions and readiness
- Add journal entries with full control
- Adjust faction influence and settlement prominence
- Backup and restore campaign (with confirmation for older backups)

---

### Player Authority (Enforced Server-Side)

✅ **First Session Only:**
- Complete GM-left-blank character seed fields
- Finalize character when required fields complete
- Choose character appearance, personality, background

✅ **All Sessions:**
- Send COMMS messages to GM and group (player-to-all)
- Browse published map (read-only, scroll/zoom to 200%)
- View own assigned character record
- View own assigned inventory
- Read GM-published situation report
- See own character condition/stress

✅ **Post-Finalization (Pending GM Approval):**
- Submit character field edit proposals
- Propose new inventory items
- Propose inventory modifications
- Submit proposals with source category (RB/GM/UF)

❌ **Cannot Do:**
- Modify character directly (all changes require GM approval)
- Change game state (date, weather, resources)
- Publish information to group
- Access other player's character/inventory
- View unrevealed locations or faction secrets
- See GM-only notes or hidden state
- Change own proposal after submission

---

## Not Yet Implemented (Planned)

- **Live gameplay actions** during active session
- **Dice-governed inventory use** with roll history
- **Full COMMS system** (delivery history, persistence)
- **Offline basemaps** (PMTiles or similar)
- **Publication history** (audit trail of what was published when)
- **NPC creation and management** tools
- **Broader campaign management** (logistics, market, diplomacy dashboards)
- **Multi-session persistent character advancement**
- **Automated morale/CUF changes** (still GM-managed)
- **Encounter tables and random generation**

---

## Data Persistence & Checkpoints

**Campaign Data Layers:**

| Layer | Format | Persistence | Access |
|-------|--------|-----------|--------|
| Setup Package | JSON (v2) | Immutable; can be re-exported | GM-only; not served to players |
| Runtime Campaign | SQLite | Per-session updates; in-memory during session | GM-only in API; authoritative source |
| Runtime Backup | JSON (v1) | Download on demand; restore with confirmation | GM-only; for archival/recovery |
| Player View | JSON (projected) | Computed from published reports/maps | Player-scoped; only published info |

**Versioning & Conflict Protection:**

- Campaign revision counter (incremented on any runtime change)
- Report revision (optimistic; prevents concurrent edit conflicts)
- Map revision (optimistic; prevents concurrent edit conflicts)
- Character change request status (pending/approved/rejected)
- Restore checks expected revision (prevents stale restore attempts)

**No Automatic Sync:**
- All GM state changes are explicit deliberate actions
- Players never see hidden GM state
- Publications are manually triggered (not automatic)
- Backups are manual (no autosave to cloud)

---

## Session Checklist

### Before Session
- [ ] Import or open existing campaign
- [ ] Review prior journal entries and situation
- [ ] Check route progress and next destination
- [ ] Review personnel conditions and any lingering effects
- [ ] Prepare scenario/encounter notes
- [ ] Decide on weather and update dashboard

### During Session
- [ ] Run encounter or travel using appropriate loop (combat/strategic)
- [ ] Track actions and outcomes
- [ ] Award experience (if applicable)
- [ ] Monitor player COMMS and proposals
- [ ] Update journal with session events
- [ ] Publish situation report(s) as narrative progresses

### After Session
- [ ] Review and process player proposals (accept/reject)
- [ ] Update campaign state (date, weather, resources, personnel)
- [ ] Finalize journal entries
- [ ] Backup campaign runtime
- [ ] Prepare notes for next session

---

## See Also

- [CHARACTER_AND_NPC_CREATION.md](./CHARACTER_AND_NPC_CREATION.md) — Character generation and attributes
- [1262543-T2kRefereeAidCloseCombatPrintable.pdf](../1262543-T2kRefereeAidCloseCombatPrintable.pdf) — Close combat procedures
- [1262543-T2kRefereeAidRangedCombatPrintable.pdf](../1262543-T2kRefereeAidRangedCombatPrintable.pdf) — Ranged combat procedures
- [1262543-T2kRefereeAidVehicleCombatPrintable.pdf](../1262543-T2kRefereeAidVehicleCombatPrintable.pdf) — Vehicle combat procedures
- [1262543-T2kRefereeAidHeavyWeaponsAndExplosivesPrintable.pdf](../1262543-T2kRefereeAidHeavyWeaponsAndExplosivesPrintable.pdf) — Heavy weapons procedures
- [1262543-T2kRefereeAidStrategicPlayPrintable.pdf](../1262543-T2kRefereeAidStrategicPlayPrintable.pdf) — Travel/strategic play procedures
- FEATURES.md — Current tool implementation status
- ROADMAP.md — Development phases and priorities
