# Strategic Play Automation Loop - GM Action List

> Simple list of automated actions for the GM strategic play workflow
> Based on T2K 4E Strategic Play procedures (6-hour shifts)
> For future automation roadmap; NOT YET IMPLEMENTED

---

## Overview

The Strategic Play Loop is the operational time scale (~6 hours per shift) where the party moves across the map, manages resources, encounters opposition, and deals with complications. This list defines what actions the GM takes each shift.

---

## Pre-Shift Actions (GM Preparation)

### 1. Load Campaign & Previous State
- [ ] Open campaign in GM dashboard
- [ ] Load last saved state (location, resources, date/time, weather)
- [ ] Review journal entries from previous shifts
- [ ] Check active route waypoint

### 2. Announce Shift Summary to Players
- [ ] Publish situation report with current state:
  - Current location
  - Current date/time
  - Current resources (rations, fuel, ammo)
  - Party morale
  - Known threats/complications
  - Next objective/waypoint
- [ ] Publish map with party position visible
- [ ] Set expected duration for shift (how many IRL minutes)

### 3. Ready GM Tools
- [ ] Open T2K 4E Referee Aids (travel, encounters, morale, weather)
- [ ] Review terrain for current location and path to next waypoint
- [ ] Prepare faction/NPC state for current location
- [ ] Load settlement data if party is in settlement

---

## Shift Resolution Actions (Sequential)

### 4. Calculate Travel Movement
- [ ] Determine party movement intention (halt, cautious/slow, normal, hasty)
- [ ] Determine terrain between current and next waypoint
- [ ] Look up base movement rate (T2K 4E table):
  - Pavement: 10 km/hour
  - Field: 8 km/hour
  - Forest: 6 km/hour
  - Swamp: 4 km/hour
  - Mountain: 4 km/hour
- [ ] Apply movement modifier based on:
  - Party condition/readiness
  - Weather (if applicable)
  - Vehicle status (if any)
- [ ] Calculate distance traveled this shift
- [ ] Update party location (if moving multiple hexes, can update per hex or at shift end)

### 5. Roll Weather (T2K 4E Strategic Play Rules)
- [ ] Roll 1D6 for weather change:
  - Symbol result (≥4): Weather improves one step
  - No symbol (1-3): Weather worsens one step
- [ ] Track weather state progression:
  - Fair → Cloudy → Rain/Snow → Cloudy (minimum)
- [ ] Apply weather effects (if any):
  - Rain/Snow: movement penalty, visibility reduction
  - Heavy conditions: resource consumption increases
- [ ] Record weather condition and GM note

### 6. Check for Encounters (Procedural)
- [ ] Roll for encounter chance (table/threshold varies by location type):
  - Settlement: low chance of random encounter
  - Open terrain: moderate chance
  - Disputed territory: high chance
  - Enemy-held terrain: very high chance
- [ ] If encounter triggered:
  - Roll encounter type/table (military, civilian, creature, obstacle, etc.)
  - Roll opposition force composition
  - Determine opposition intention (hostile, neutral, fleeing, etc.)
  - Resolve encounter outcome (combat, negotiation, evasion, etc.)
- [ ] Record encounter in journal
- [ ] Apply any consequences:
  - Casualties/injuries
  - Ammo/fuel consumption
  - Morale impact
  - Route changes

### 7. Deduct Resource Consumption
- [ ] Calculate resource consumption for shift:
  - Rations: 1 day per party per shift (or ½ day if rationed/minimal)
  - Fuel: Based on distance and vehicle status
  - Ammunition: Only if combat occurred
- [ ] Deduct from running totals
- [ ] Flag if critical resources running low (<3 days rations, <2 fuel units, etc.)

### 8. Apply Morale Changes (If Events Warrant)
- [ ] Check for morale-affecting events:
  - Successful combat: morale +1 step (A-D, A=best)
  - Casualties/retreat: morale -1 step
  - Reaching objective: morale +1 step
  - Low resources: morale -1 step
  - Prolonged stress: morale -1 step per session
- [ ] Update party morale rating (A/B/C/D)
- [ ] Note morale change cause in journal
- [ ] Calculate morale CUF modifier (A=+2, B=+1, C=0, D=-1) for reference

### 9. Update Campaign Clock
- [ ] Advance game date by 6 hours
- [ ] Update time of day (midnight → dawn → morning → noon → afternoon → evening → night → midnight)
- [ ] Track elapsed days
- [ ] Check if supply consumption should record (if using daily consumption tracking)

### 10. Update Party Position
- [ ] If party reached next waypoint, update location to waypoint
- [ ] If still traveling, update hex position (if tracking hex-by-hex)
- [ ] Record travel path/route for journal
- [ ] Check if waypoint has story implications (settlement, strategic location, etc.)

### 11. Resolve Location Effects (If At Settlement or Significant Location)
- [ ] Check settlement/location conditions:
  - Security level (if applicable)
  - Attitude toward party (if applicable)
  - Leadership (if applicable)
  - Special conditions (occupied, damaged, abandoned, etc.)
- [ ] If settlement:
  - Determine faction presence/control
  - Check resupply availability (rations, fuel, ammo)
  - Roll for encounters/rumors
  - Determine NPC availability (contacts, missions, information)
- [ ] Record findings in journal

### 12. Handle Supply/Resupply (If At Source)
- [ ] If party at settlement or cache:
  - Determine available supplies (rations, fuel, ammo, medical)
  - Apply cost/barter (if needed)
  - Update party inventory
  - Record transaction in journal

### 13. Check for Complications (Optional)
- [ ] Roll for random complication (mechanical, social, environmental):
  - Vehicle breakdown
  - Supply spoilage
  - Lost party member
  - Deserter
  - Rumor/intelligence
  - Civilian encounter
  - Increased opposition activity
- [ ] If complication triggered:
  - Determine impact
  - Adjust resources/morale as needed
  - Record in journal

### 14. Update Faction/World State (As Relevant)
- [ ] Track faction actions in current location:
  - Reinforcements, patrols, checkpoints
  - Faction stance changes
  - Settlement control changes
- [ ] Update faction influence on map (if party actions affected it)
- [ ] Record any world-state changes (settlements conquered/lost, alliances formed, etc.)

---

## Post-Shift Actions (GM Record-Keeping)

### 15. Summarize Shift in Campaign Journal
- [ ] Create journal entry with:
  - Starting location and time
  - Distance traveled
  - Weather conditions
  - Encounters (if any)
  - Casualties/injuries (if any)
  - Resources consumed
  - Final location and time
  - Morale state
  - Notable events/complications
  - Next objective reminder

### 16. Publish Updated Situation Report
- [ ] Update for players:
  - New location and time
  - Updated resources (rations, fuel remaining)
  - Updated party morale
  - Updated personnel roster (if casualties)
  - Any published faction/world changes
  - Next phase/objective
  - Optional: next shift forecast (time, distance, expected conditions)

### 17. Publish Updated Map
- [ ] Update party position on map (if GM chooses to publish)
- [ ] Show current location (marked or centered)
- [ ] Optionally show traveled route
- [ ] Update any faction influence changes (if visible)

### 18. Save Campaign Backup
- [ ] Export full runtime backup
- [ ] Store with timestamp/shift number
- [ ] Retain at least 3 previous backups
- [ ] Use for recovery if rollback needed

### 19. Open Communication For Player Actions
- [ ] Notify players that shift is complete
- [ ] Allow 24-48 hours for player responses (async play assumption)
- [ ] Monitor COMMS for player questions/reactions
- [ ] Make GM decisions on player proposals
- [ ] Document any player-initiated changes

---

## Optional Shift Variations

### Halted Shift (Party Not Moving)
- Skip: Travel movement, distance calculation
- Include: Weather, resource consumption (reduced), complications
- Resolution focus: Settlement activities, faction interactions, recovery

### Combat Shift (Full Combat)
- Skip: Normal travel procedures
- Focus: Full combat resolution per T2K 4E Combat procedures
- After combat: Casualties, resource consumption, location continuation
- Morale impact: Increased variation based on outcome

### Hasty Movement (Pursuing/Fleeing)
- Increase: Movement rate, but increase encounter chance
- Increase: Resource consumption (fuel primarily)
- Risk: Mechanical breakdown, ambush
- Morale: May decrease from stress/exhaustion

### Urban/Settlement Shift (No Movement)
- Focus: Faction negotiations, supply acquisition, intelligence gathering
- Role-play: NPC interactions, decisions affecting settlement
- Complications: Local conflicts, authority encounters
- Resupply: Focus on availability and barter/cost

---

## Automation Checkpoints (Decision Points Requiring GM Input)

These actions require GM decision-making and cannot be fully automated:

1. **Movement Intention** — How does party travel? (halt/cautious/normal/hasty)
2. **Encounter Outcome** — How is encounter resolved? (combat/negotiation/evasion)
3. **Complication Choice** — Which complication (if any) affects shift?
4. **Resupply Decision** — What supplies can party access? At what cost?
5. **Faction Reaction** — How do factions respond to party presence/actions?
6. **Morale Interpretation** — What events trigger morale changes beyond rules?
7. **Location Narrative** — What is atmosphere/story of current location?
8. **Backup Creation Timing** — When to manually save (after each shift? every session?)

---

## Automation Output (What GM Sees)

After each shift, the automated loop generates:

1. **Updated Campaign State**
   - Current location (map position)
   - Current date/time
   - Resources remaining (rations, fuel, ammo)
   - Party morale rating
   - Personnel status (condition, readiness)
   - Weather conditions

2. **Shift Summary** (for GM review)
   - Distance traveled
   - Encounters resolved (if any)
   - Resources consumed
   - Morale changes (if any)
   - Complications (if any)
   - World state changes (if any)

3. **Journal Entry** (auto-generated, editable)
   - Readable narrative of shift events
   - Ready to publish or expand

4. **Published Data** (for players)
   - Updated situation report
   - Updated map with position
   - Updated COMMS channel notifying of shift completion

---

## Future Implementation Notes

### Phase 1: Manual + UI Assistance
- GM enters values, UI validates against rules
- Auto-calculate consumption/movement based on inputs
- Auto-roll dice (weather, encounters) with display
- Semi-automated journal entry creation

### Phase 2: Rules Automation
- Auto-roll weather, encounters, complications per T2K 4E tables
- Auto-calculate resource consumption based on movement
- Auto-apply morale adjustments per rules
- Auto-generate journal entries from events
- GM approves/edits before publishing

### Phase 3: Smart Assistance
- Suggest morale changes based on events
- Flag resource warnings (low rations, fuel running out)
- Recommend waypoint changes if supplies critical
- Suggest complications based on location/factions
- Predict next waypoint ETA

### Phase 4: Full Automation (Optional)
- Fully automated shift resolution with GM oversight
- GM reviews and approves/modifies auto-generated outcomes
- Non-player-facing shifts can run fully automatic
- Player-facing shifts require GM approval before publishing

---

## See Also

- [GAME_LOOP.md](./GAME_LOOP.md) — Complete game loop documentation
- [SESSION_LOOP_COMPARISON.md](./SESSION_LOOP_COMPARISON.md) — Comparison to official T2K 4E rules
- [CHARACTER_AND_NPC_CREATION.md](./CHARACTER_AND_NPC_CREATION.md) — Character rules including morale
- [ITEM_AND_WEAPON_STATS.md](./ITEM_AND_WEAPON_STATS.md) — Weapon/resource reference
