# Session-Level Game Loop: Fieldbook vs. Official T2K 4E Rules

> Comparison of the Fieldbook GM Tool's session loop design against official Twilight: 2000 Fourth Edition procedures
> Based on T2K 4E Referee Aids and Life Path Character Generation document

---

## Summary

**The Fieldbook session loop is a GM-tool-specific operational structure, not a direct implementation of T2K 4E session procedures.** The Fieldbook loop focuses on *campaign management and data persistence* (GM updates dashboard, situation reports, player seat assignments) rather than describing the *actual gameplay procedures* defined in T2K 4E rules.

T2K 4E defines gameplay through three separate time scales—**Combat Rounds** (~6 seconds), **Travel Shifts** (~6 hours), and **Campaign Progression** (days/weeks/months)—but does not define a "session-level" structure in its official rules. Sessions are a table convention; how long they run and what they cover is GM-determined.

---

## Official T2K 4E Gameplay Structures

### **Combat (Tactical Time Scale: ~6 Seconds/Round)**

**Official Procedure (Per T2K 4E Referee Aids):**

1. **Initiate Combat**
   - Determine surprise/ambush conditions
   - Roll for surprise (if applicable)

2. **Draw Initiative**
   - Each participant draws one initiative card
   - Lowest card acts first
   - Surprises/ambushes go before normal initiative

3. **Per Round (Repeats Each Round)**
   - Each participant banks 2 fast actions + 1 slow action + free actions
   - Participants act in initiative order
   - Each participant:
     - Declares actions
     - Spends actions on movement, attacks, aiming, special actions
     - Rolls relevant skills (STR + Close Combat, AGI + Ranged Combat, etc.)
     - Applies modifiers
     - Resolves hits, damage, criticals
     - Stress from damage (CUF roll if damage > hit capacity)
   - Next participant acts
   - Continue until all have acted

4. **Round End**
   - If combat ongoing, refresh actions and repeat
   - If combat over, apply post-combat effects

**Fieldbook Alignment:**
- ✅ Fieldbook's Combat Round Loop accurately reflects this procedure
- ❌ **Not currently implemented in Fieldbook tool** (still Planned per FEATURES.md)
- ❌ No automated initiative, action tracking, or dice resolution yet

---

### **Strategic Play / Travel (Operational Time Scale: ~6 Hours/Shift)**

**Official Procedure (T2K 4E Referee Aid: Strategic Play):**

1. **Start Shift**
   - Determine time of day (Morning/Day/Evening/Night)
   - Set light level based on time and weather
   - Note temperature (seasonal)

2. **Roll for Weather Change**
   - Roll 1D6 and record the matching improve/worsen symbol from the Strategic Play Referee Aid
   - Do not assume a numeric face mapping from the available local transcription
   - Track: Fair → Cloudy → Rain/Snow (with auto-revert rules)

3. **Assign Tasks Per PC**
   - Each PC performs **one task per shift** (5-10 hours, typically ~6)
   - Can combine tasks: one character can march AND keep watch during travel
   - **Interruption Rule**: 3/4 of shift spent on task = benefits apply
   - One interrupted task can restart next shift
   - Typical tasks:
     - Travel/Driving (Driving skill roll)
     - Scouting/Infiltration (Recon skill)
     - Survival (scavenging food/water)
     - Vehicle maintenance (Tech roll; once per week per vehicle if driven)
     - Other party objectives

4. **Determine Travel Distance**
   - If traveling: calculate distance (terrain-dependent)
   - Track cumulative distance and resources consumed
   - Encounters typically happen ~halfway through shift

5. **Process Events**
   - Resolve encounters
   - Handle complications/hazards
   - Record results and discoveries

6. **Record Results**
   - Update campaign clock
   - Deduct resources (rations, fuel, ammunition)
   - Note journal entries

7. **Repeat** (Next shift or next session)

**Fieldbook Alignment:**
- ✅ Fieldbook's Travel/Strategic Loop mirrors this structure closely
- ✅ Dashboard tracks game date, rations, fuel, distance, weather
- ✅ Journal logs shift events and discoveries
- ✅ Personnel tracked (though still simplified)
- ❌ **Tasks and Skill Rolls not automated** (task resolution is GM-managed, not validated against rules)
- ❌ Interruption rule not tracked in tool
- ⚠️ Resource consumption is manual entry (not rule-driven)

---

### **Campaign Progression (Long-Term: Days/Weeks/Months)**

**Official Procedure:**

The T2K 4E rulebook defines *mechanics* that trigger during gameplay and sessions but does not define an explicit "campaign progression" structure. Instead, the following occur *during sessions*:

**After Each Session:**
- **CUF Advancement** (Life Path, pg. 40)
  - During any session where you successfully roll your CUF
  - Roll CUF base die; on result 1, CUF increases (max A)
  - When CUF increases: roll EMP die; on success, Empathy reduces one step

- **Unit Morale Changes** (Life Path, pg. 41)
  - After each session, unit morale may change per session events
  - Consult morale adjustment procedures

- **Character Code Changes** (Player Manual reference)
  - After session, may choose new moral code if current one was betrayed
  - May choose new Big Dream or new Buddy (one at a time)

- **Experience Awards**
  - Gained during gameplay (procedure on pg. 40)
  - Can be spent to improve skills/attributes

**No Official "Session Report" or "Publication" Procedure:**
- T2K 4E rules do not define publishing situation information to players
- Rules do not describe how/when players receive information
- This is a GM convention and tool-specific feature

**Fieldbook Alignment:**
- ✅ Dashboard tracks game date progression
- ✅ Journal logs session events
- ✅ Personnel and morale tracked (though not rule-driven)
- ❌ **CUF advancement not automated** (still manual/GM-managed)
- ❌ **Morale changes not procedure-driven** (still manual/GM-managed)
- ❌ **Experience tracking not implemented** (Planned)
- ✅ **Situation Report publishing is Fieldbook-specific innovation** (not in official rules; good for distributed play)

---

## Where Fieldbook Diverges from T2K 4E Rules

### 1. **Session-Level Abstraction**
- **T2K 4E**: Rules address *tactical* (combat) and *operational* (travel) time scales; sessions are a table-level convention
- **Fieldbook**: Adds a "session loop" layer to manage *campaign state persistence* and *player information distribution* (tool-specific)

### 2. **Situation Report / Information Publishing**
- **T2K 4E**: No official procedure for publishing/withholding information
- **Fieldbook**: Situation report is a deliberate GM publication tool (GM-only draft → publish/withdraw)
  - *Why*: Supports remote play where players can't infer unrevealed state from table presence
  - *Valid tool-specific innovation*: Not against rules, but not in them either

### 3. **Player Seat Assignment & Character Proposals**
- **T2K 4E**: Rules assume all players present at table; character changes happen immediately or not at all
- **Fieldbook**: Separate player seats with pending edit proposals for post-session review
  - *Why*: Supports asynchronous play; GM can approve/reject when ready
  - *Valid tool-specific innovation*: Formalizes "GM decides if character change is allowed"

### 4. **Dashboard State (Date, Weather, Resources)**
- **T2K 4E**: These are GM-managed campaign state; rules don't specify HOW to track
- **Fieldbook**: Centralizes in dashboard; weather roll is GM-entered (not automated)
  - *Good for*: Quick reference, shared campaign understanding
  - *Note*: Resource consumption is *manual entry*, not rule-driven

### 5. **Personnel Management**
- **T2K 4E**: Focuses on PC status; NPCs are brief (no standard format)
- **Fieldbook**: Roster feature for tracking NPC conditions/readiness
  - *Why*: Useful for longer campaigns; helps organize state
  - *Not rule-derived*: T2K 4E has no "NPC roster" procedure

### 6. **Combat & Task Resolution** (Not Implemented Yet)
- **T2K 4E**: Full procedures for initiative, actions, skill rolls, damage
- **Fieldbook**: Currently *Planned*; tool does not yet enforce these procedures
  - No automated combat round loop
  - No validation of action costs
  - No dice rolling or skill automation
  - No automatic stress/injury calculations

---

## Official T2K 4E Session Flow (For Comparison)

Here's what a session *actually* looks like per T2K 4E rules (implied, not explicit):

### **A Typical T2K 4E Session at the Table**

1. **GM Sets Scene**
   - Describe current situation and location
   - Present choice points or encounters

2. **Players Declare Intentions**
   - "I want to scout the settlement"
   - "I search for supplies"
   - "I keep watch"

3. **GM Resolves Tasks** (Using appropriate procedures)
   - **If tactical (close/ranged combat)**: Use combat loop (initiative, actions, rolls)
   - **If operational (travel/search)**: Use travel shift loop (task rolls, results)
   - **If social (negotiation/persuasion)**: Use opposed rolls or straightforward skill checks

4. **Record Outcomes**
   - Apply damage/stress
   - Consume resources
   - Advance clock

5. **Next Situation**
   - GM presents next choice or encounter
   - Repeat from step 2 until session ends

6. **After Session (GM's Responsibility)**
   - Award experience
   - Check for CUF advancement
   - Check for morale changes
   - Check for moral code betrayal
   - Record session notes

**Duration**: Varies by table; sessions might cover 1 combat, or 2-3 shifts of travel, or a mix

---

## Fieldbook Session Loop vs. Official Rules

### **Fieldbook's Phase 1: GM Prepares & Publishes**

| Fieldbook Step | Official T2K 4E | Alignment |
|---|---|---|
| Review dashboard (date, weather, resources) | GM prep; not in rules | ✅ Good practice |
| Draft situation report | No official equivalent | ✅ Tool innovation for remote play |
| Preview and publish | No official equivalent | ✅ Tool innovation |
| Set player map position | No official equivalent | ✅ Tool innovation |

**Assessment**: This phase is *tool-specific management*, not T2K 4E gameplay. It's preparation overhead that supports remote/asynchronous play (not in original rules).

---

### **Fieldbook's Phase 2: Players Receive & React**

| Fieldbook Step | Official T2K 4E | Alignment |
|---|---|---|
| Login and view situation report | No official equivalent | ✅ Tool-specific for remote play |
| Complete character seed (first session) | Part of character generation (at table) | ✅ Aligned; different delivery method |
| Send COMMS message | No official equivalent | ✅ Tool innovation; replaces verbal play |
| Submit inventory/character edit proposals | At-table negotiation (implicit) | ⚠️ Formalizes what's normally instant |
| Browse map | No official equivalent | ✅ Tool innovation; GM would describe/show physical map |

**Assessment**: This phase describes *player interface*, not T2K 4E gameplay. All actual game actions happen in Phase 3 (GM processes results).

---

### **Fieldbook's Phase 3: GM Processes & Advances**

| Fieldbook Step | Official T2K 4E | Alignment |
|---|---|---|
| Read COMMS messages | Normal table conversation | ✅ Equivalent |
| Review change proposals | Normal GM arbitration | ⚠️ Aligned (but async vs. immediate) |
| Advance game date/clock | Done during session (travel/combat loops) | ✅ Aligned |
| Roll weather change | Done per Strategic Play rules | ✅ Aligned |
| Track resources | Done during travel shifts | ✅ Aligned |
| Update personnel | GM-managed (no official format) | ✅ Good practice |
| Add journal entries | Optional GM note-taking | ✅ Aligned |
| Backup campaign | Not addressed in rules | ✅ Tool practice (data safety) |

**Assessment**: This is where *actual T2K 4E gameplay procedures* are applied. However:
- ❌ Fieldbook does NOT automate skill rolls or task resolution
- ❌ Combat procedures are not implemented
- ❌ Travel procedures are not validated against rules
- ✅ Structure matches T2K 4E time scales

---

## Missing from Fieldbook vs. Official Rules

### **Critical Gameplay Procedures Not Yet Implemented**

1. **Combat Round Automation**
   - No initiative card drawing
   - No action banking (2 fast + 1 slow per participant)
   - No skill roll validation
   - No damage/critical resolution
   - No automatic stress application

2. **Skill Roll Procedures**
   - No dice rolling engine
   - No modifiers applied
   - No opposed roll resolution
   - No success calculation
   - No group roll coordination

3. **Travel Task Resolution**
   - No task type validation
   - No Mobility/Driving/Recon roll automation
   - No terrain modifier application
   - No "3/4 shift" rule enforcement
   - No resource deduction (manual only)

4. **Character Development**
   - No experience tracking
   - No CUF advancement automation
   - No skill/attribute improvement
   - No morale change calculation
   - No moral code violation tracking

5. **Advancement Procedures** (Post-Session)
   - No CUF roll procedure
   - No morale adjustment procedure
   - No EMP reduction on CUF increase
   - No experience award calculation

---

## Fieldbook's Valid Innovations (Not Contrary to Rules)

### ✅ Situation Report Publishing
- **Not in T2K 4E** (table-based game assumes all players present)
- **Valuable for**: Remote/async play, ensuring shared campaign understanding
- **Impact on Rules**: None; purely presentation layer

### ✅ Player Seat System
- **Not in T2K 4E** (assigns one character per physical player)
- **Valuable for**: Supporting 1-4 player seats, character ownership tracking, permission enforcement
- **Impact on Rules**: None; supports authentication/authorization

### ✅ Pending Edit Proposals
- **Philosophically in T2K 4E** (GM makes final calls)
- **Valuable for**: Async play; players submit changes, GM reviews later
- **Impact on Rules**: None; formalizes "GM approval" process

### ✅ Situation Report Revision Tracking
- **Not in T2K 4E** (single shared table view)
- **Valuable for**: Preventing accidental overwrites, conflict resolution
- **Impact on Rules**: None; data safety

### ✅ Campaign Backup/Restore
- **Not in T2K 4E** (assumes single persistent campaign)
- **Valuable for**: Data safety, recovery from accidents, branching campaigns
- **Impact on Rules**: None; pure infrastructure

---

## Alignment Summary

| Category | Fieldbook | T2K 4E Rules | Status |
|----------|-----------|--------------|--------|
| **Campaign Setup** | Implemented | Rules-supported | ✅ Good |
| **Session Loop (Structure)** | Implemented | Not defined | ✅ Neutral (tool convention) |
| **Situation Publishing** | Implemented | Not in rules | ✅ Innovation |
| **Combat Procedures** | Planned | Fully defined | ❌ Gap |
| **Travel Procedures** | Partial (dashboard only) | Fully defined | ⚠️ Gap |
| **Skill Roll Automation** | Not started | Fully defined | ❌ Gap |
| **Experience Tracking** | Not started | Defined (pg. 40) | ❌ Gap |
| **Morale Changes** | Manual entry | Defined (pg. 41) | ❌ Gap |
| **CUF Advancement** | Manual entry | Defined (pg. 40) | ❌ Gap |
| **Character Proposals** | Implemented | Implicit (GM-approved) | ✅ Formalization |

---

## Recommendations for Fieldbook Development

### **To Better Align with T2K 4E Rules**

1. **Prioritize Combat Automation** (ROADMAP Phase X)
   - Implement initiative tracking
   - Validate action costs (fast/slow)
   - Automate skill rolls with modifiers
   - Enforce damage/critical procedures
   - Track stress application

2. **Formalize Travel Shifts** (ROADMAP Phase X)
   - Validate task types per T2K 4E
   - Automate terrain modifiers
   - Enforce 3/4 shift rule
   - Calculate resource consumption (rule-driven)
   - Track shift completion and rewards

3. **Implement Advancement Procedures** (ROADMAP Phase X)
   - Track experience awards (session/shift-based)
   - Automate CUF rolls (on successful CUF use)
   - Automate EMP reduction on CUF increase
   - Track morale changes (event-driven)
   - Formalize moral code violation tracking

4. **Preserve GM Authority** (Throughout)
   - Keep GM-only notes separate from published data
   - Never auto-apply rules without GM review
   - Offer GM override on any procedure
   - Keep unverified homebrew clearly labeled
   - Treat tool as aid, not replacement for GM judgment

---

## Conclusion

**Fieldbook's session loop is a valid *tool-specific* design that:**
- ✅ Supports remote/async campaign play (not in original rules)
- ✅ Manages campaign state persistence (good infrastructure)
- ✅ Separates GM-only from player-visible data (excellent security)
- ⚠️ Currently implements *structure* but not *procedures* (gap in automation)

**To reach "verified rules implementation", Fieldbook must:**
- ❌ Implement and automate T2K 4E combat procedures
- ❌ Implement and automate T2K 4E travel procedures
- ❌ Implement and automate T2K 4E advancement procedures
- ✅ Preserve GM authority in all automated procedures

The *session loop infrastructure* is sound; the *rules procedures* remain to be implemented in the tool layer.

---

## See Also

- [GAME_LOOP.md](./GAME_LOOP.md) — Full Fieldbook game loop documentation
- [CHARACTER_AND_NPC_CREATION.md](./CHARACTER_AND_NPC_CREATION.md) — Character creation procedures
- FEATURES.md — Current implementation status
- ROADMAP.md — Development priorities and phases
- T2K 4E Referee Aids (OCR directory) — Official source procedures
