# Milestone 2: Personnel Roster Refinement — Implementation Plan

**Status:** 🟡 **PARTIAL** — Basic API exists, unit templates and UI refinements needed

**Target Completion:** Parallel with Milestone 4b (Weather & Travel)

---

## Current State (Baseline)

### What Exists
- **Personnel table** in SQLite with minimal schema:
  ```
  personnel (
    campaign_id,     -- Foreign key to campaign
    id,              -- Unique personnel ID
    name,            -- Display name
    role,            -- Position/title
    condition,       -- Status (OK, wounded, fatigued, etc.)
    readiness,       -- Availability (ready, resting, etc.)
    sort_order       -- Display order in roster
  )
  ```

- **Runtime API** (read/write):
  - `GET /api/campaigns/:id/runtime` — Returns personnel list
  - `POST /api/campaigns/:id/runtime` — Update personnel (with revision control)

- **No UI** in GM Tool for personnel management (form exists but not integrated)
- **No templates** — Each personnel entry created from scratch
- **No derived rules** — Attributes, skills, morale, advancement not tracked

### What's Missing (Milestone 2 Scope)

1. **Extended Personnel Data**
   - Attributes (STR, AGI, INT, EMP with ratings)
   - Skills and proficiencies
   - CUF (Combat Utility Factor)
   - Equipment/gear loadout
   - Morale/stress state
   - Promotion history

2. **Unit Templates**
   - Pre-defined archetypes (from Referee's Manual page 37)
   - Quick-clone from template
   - Save custom templates within campaign
   - Template versioning and inheritance

3. **Roster UI Improvements**
   - Grid/table view with sortable columns
   - Bulk operations (apply condition, adjust readiness)
   - Search and filter
   - Drag-to-reorder or assign to slots
   - Status indicators (color/icon)
   - Personnel details modal/sidebar

4. **Campaign Dashboard Integration**
   - Party composition summary
   - Total combat capability estimate
   - Morale/readiness aggregate
   - Casualties/status changes this session

5. **Derived Rules & Effects** (Phase 2)
   - Encumbrance calculation from equipment
   - Morale recovery/degradation
   - Skill advancement from use
   - Aging effects
   - Promotion mechanics

---

## Data Model Extension

### Personnel Schema (Extended)

```sql
CREATE TABLE personnel_v2 (
  campaign_id TEXT NOT NULL REFERENCES campaigns(runtime_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  
  -- Identity
  name TEXT NOT NULL,
  role TEXT NOT NULL,                    -- Title/specialty
  archetype_id TEXT,                     -- Template source (if from template)
  
  -- Attributes (T2K 4E ratings: A/B/C/D or dice: D12/D10/D8/D6)
  attribute_strength TEXT NOT NULL,      -- STR
  attribute_agility TEXT NOT NULL,       -- AGI
  attribute_intelligence TEXT NOT NULL,  -- INT
  attribute_empathy TEXT NOT NULL,       -- EMP
  
  -- Skills (JSON array: {name, rating, specialty})
  skills_json TEXT NOT NULL,
  
  -- Combat Utility
  cuf_rating TEXT NOT NULL,              -- C (D8), D (D6), etc.
  
  -- Status
  condition TEXT NOT NULL,               -- OK, wounded, fatigued, dead
  readiness TEXT NOT NULL,               -- ready, resting, recovering
  morale_state TEXT NOT NULL,            -- high, normal, low, broken
  stress_damage INTEGER NOT NULL DEFAULT 0,
  
  -- Equipment (JSON: {item, category, weight, condition})
  equipment_json TEXT NOT NULL,
  
  -- History
  sort_order INTEGER NOT NULL,
  promoted_to_rank TEXT,
  joined_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  
  PRIMARY KEY (campaign_id, id),
  UNIQUE (campaign_id, sort_order)
) STRICT;
```

### Templates Table

```sql
CREATE TABLE npc_archetypes (
  campaign_id TEXT,                      -- NULL for global templates
  id TEXT NOT NULL,
  
  -- Template identity
  name TEXT NOT NULL,                    -- "Conscript," "NCO," etc.
  description TEXT,
  source TEXT,                           -- "Referee's Manual p.37", "GM-created"
  
  -- Base attributes
  attribute_strength TEXT NOT NULL,
  attribute_agility TEXT NOT NULL,
  attribute_intelligence TEXT NOT NULL,
  attribute_empathy TEXT NOT NULL,
  
  -- Base skills (JSON)
  skills_json TEXT NOT NULL,
  
  -- Base CUF
  cuf_rating TEXT NOT NULL,
  
  -- Starting equipment (JSON)
  equipment_json TEXT NOT NULL,
  
  -- Notes for GM
  notes TEXT,
  
  created_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(runtime_id) ON DELETE CASCADE
) STRICT;
```

---

## Reference Data: NPC Archetypes

**Source:** Referee's Manual, page 37 — Typical NPC Characters

### Placeholder Archetypes (To Be Replaced with Actual Data)

```json
{
  "archetypes": [
    {
      "id": "conscript",
      "name": "Conscript Soldier",
      "source": "Referee's Manual p.37",
      "attributes": {
        "strength": "C",
        "agility": "C", 
        "intelligence": "D",
        "empathy": "D"
      },
      "skills": [
        { "name": "Ranged Combat", "rating": "C" },
        { "name": "Mobility", "rating": "D" }
      ],
      "cuf": "D",
      "equipment": [
        { "name": "Rifle", "category": "weapon" },
        { "name": "Uniform", "category": "armor" }
      ]
    },
    {
      "id": "nco",
      "name": "Non-Commissioned Officer",
      "source": "Referee's Manual p.37",
      "attributes": {
        "strength": "B",
        "agility": "B",
        "intelligence": "C",
        "empathy": "C"
      },
      "skills": [
        { "name": "Ranged Combat", "rating": "B" },
        { "name": "Leadership", "rating": "C" },
        { "name": "Mobility", "rating": "C" }
      ],
      "cuf": "C",
      "equipment": []
    }
  ]
}
```

**STATUS:** Awaiting data extraction from Referee's Manual page 37

---

## Implementation Phases

### Phase 1: Extended Schema & Template System

1. **Database Migration**
   - Alter personnel table to include new fields
   - Create npc_archetypes table
   - Migrate existing personnel data (backward compatible)

2. **API Endpoints**
   - `GET /api/campaigns/:id/templates` — List available templates
   - `POST /api/campaigns/:id/personnel/from-template` — Clone template
   - `PUT /api/campaigns/:id/personnel/:personId` — Update extended fields
   - `POST /api/campaigns/:id/templates` — Save custom template

3. **Tests**
   - Personnel with full attributes can be created and retrieved
   - Template cloning preserves all fields
   - Stale edits handled correctly
   - Audit trail records personnel changes

### Phase 2: GM Tool UI

1. **Personnel Manager Page** (admin.html or personnel.html)
   - Table view: name, role, attributes, status
   - Sortable columns
   - Action buttons: edit, delete, clone, assign to slot
   - Quick-apply condition/readiness dropdowns
   - Search filter by name/role

2. **Personnel Detail Modal**
   - Full attributes and skills
   - Equipment list with weight calculation
   - Morale/stress indicators
   - Promotion history
   - Notes

3. **Template Selection Modal**
   - Browse available archetypes
   - Preview template stats
   - Clone with optional customization

4. **Dashboard Widget**
   - Party composition summary
   - Total combat readiness
   - Morale trend
   - Casualty count

### Phase 3: Rules Integration (Deferred)

- Encumbrance calculation from equipment weight
- Morale recovery mechanics
- Skill advancement tracking
- Promotion milestone tracking

---

## Exit Checks (Milestone 2 Completion)

- [ ] Personnel table extended with attributes/skills/CUF
- [ ] NPC archetype templates from Referee's Manual implemented
- [ ] GM can create personnel from template in <10 seconds
- [ ] Roster UI shows all personnel with status indicators
- [ ] Bulk operations work (apply condition to multiple)
- [ ] Personnel changes tracked in audit trail
- [ ] Tests cover template cloning and roster updates
- [ ] All changes appear on player handsets within 1 second

---

## Dependencies

- **Player's Manual reference:** Character attributes, skills system, CUF rating (to verify)
- **Referee's Manual page 37:** NPC archetype profiles (IMAGE AWAITED)
- **Milestone 1:** Persistence and authorization (✓ complete)

---

## Notes

- Keep templates separate from campaign data (global vs. per-campaign scoping)
- Enforce role verification at API boundary (GM-only)
- Maintain 100% test coverage
- Do not automate rules effects until explicitly verified against source
