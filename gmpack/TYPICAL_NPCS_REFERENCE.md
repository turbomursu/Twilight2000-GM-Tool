# Typical NPCs Reference Data

**Source:** Referee's Manual — Typical NPCs Table

Extracted NPC profiles with complete T2K 4E attributes, skills, and equipment loadouts.

## NPC Profiles

### Civilian NPCs

#### Refugee
- **Attributes:** STR C, AGI C, INT C, EMP C
- **Hit Cap:** 4
- **CUF:** D
- **Skills:** Recon D, Survival C
- **Typical Gear:** Club or knife

#### Civilian
- **Attributes:** STR C, AGI C, INT C, EMP D
- **Hit Cap:** 4
- **CUF:** D
- **Skills:** Close Combat D, Driving D, Ranged Combat D, Recon D
- **Typical Gear:** Pistol or shotgun with one reload

#### Hunter
- **Attributes:** STR C, AGI B, INT C, EMP D
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Close Combat D, Driving D, Ranged Combat D
- **Typical Gear:** Hunting rifle with one reload or hunting bow with 36 arrows, knife

#### Marauder
- **Attributes:** STR B, AGI C, INT C, EMP D
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Close Combat B, Driving D, Ranged Combat C, Recon C
- **Typical Gear:** Assault rifle, hunting knife

### US Military NPCs

#### US Soldier
- **Attributes:** STR B, AGI B, INT C, EMP C
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Close Combat C, Driving C, Ranged Combat C, Recon C
- **Typical Gear:** M16A1 with one reload, bayonet, frag grenades

#### US Officer
- **Attributes:** STR C, AGI B, INT B, EMP B
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Ranged Combat C, Recon C, Command C, Persuasion C
- **Typical Gear:** M9 pistol with one reload, frag grenades

#### US Special Forces
- **Attributes:** STR B, AGI A, INT B, EMP C
- **Hit Cap:** 6
- **CUF:** B
- **Skills:** Close Combat B, Ranged Combat B, Recon B
- **Typical Gear:** M4A1 with two reloads, knife, frag grenades

#### US Intelligence
- **Attributes:** STR C, AGI B, INT B, EMP B
- **Hit Cap:** 5
- **CUF:** B
- **Skills:** Close Combat C, Ranged Combat C, Recon B, Persuasion B
- **Typical Gear:** M9 pistol with one reload, knife

### Soviet Military NPCs

#### Soviet Soldier
- **Attributes:** STR C, AGI C, INT C, EMP C
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Close Combat D, Driving C, Ranged Combat C, Recon C
- **Typical Gear:** AK-74 with one reload, bayonet, frag grenades, steel helmet

#### Soviet Officer
- **Attributes:** STR B, AGI B, INT B, EMP B
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Ranged Combat C, Recon C, Command C, Persuasion D
- **Typical Gear:** PM pistol with one reload, frag grenades

#### Soviet
- **Attributes:** STR B, AGI A, INT B, EMP B
- **Hit Cap:** 6
- **CUF:** B
- **Skills:** Close Combat B, Ranged Combat B, Recon B
- **Typical Gear:** AK-74 with two reloads, knife, frag grenades

#### Soviet Spetsnaz
- **Attributes:** STR B, AGI A, INT A, EMP B
- **Hit Cap:** 6
- **CUF:** B
- **Skills:** Close Combat B, Ranged Combat B, Recon B
- **Typical Gear:** AK-74 with two reloads, knife, frag grenades

### Other National Forces

#### Israeli Soldier
- **Attributes:** STR B, AGI B, INT C, EMP C
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Close Combat C, Driving C, Ranged Combat C, Recon C
- **Typical Gear:** Uzi with one reload, knife

#### Israeli Officer
- **Attributes:** STR C, AGI B, INT B, EMP B
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Ranged Combat D, Driving D, Command C, Persuasion C
- **Typical Gear:** Uzi or .38 Special pistol with one reload, frag grenades

#### Israeli Elite
- **Attributes:** STR B, AGI A, INT B, EMP B
- **Hit Cap:** 6
- **CUF:** B
- **Skills:** Close Combat B, Ranged Combat B, Recon B
- **Typical Gear:** AK-74 with two reloads, knife, frag grenades

#### British Soldier
- **Attributes:** STR B, AGI B, INT C, EMP C
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Close Combat D, Driving C, Ranged Combat C, Recon C
- **Typical Gear:** SA80 with one reload, bayonet

#### British Officer
- **Attributes:** STR C, AGI B, INT B, EMP B
- **Hit Cap:** 5
- **CUF:** C
- **Skills:** Ranged Combat C, Recon C, Command C, Persuasion C
- **Typical Gear:** P-88 pistol with one reload

---

## Data Structure Notes

### Attributes
- Ratings: A (elite), B (competent), C (average), D (poor)
- Standard military personnel: B-B or C-C mix
- Specialists typically have one elevated INT or EMP

### Hit Cap
- Typical range: 4-6
- Lower for civilians and support roles
- Higher for combat specialists

### CUF (Combat Utility Factor)
- D: Untrained or poorly equipped
- C: Standard military training
- B: Elite or highly trained
- Used to calculate combat effectiveness in group encounters

### Skills
- Listed in priority order for the role
- Ratings: A, B, C, D (same as attributes)
- Most combat roles include: Close Combat, Ranged Combat, Recon
- Leadership roles include: Command, Persuasion, Ranged Combat

### Typical Gear
- Weapon: Primary (rifle/SMG) or sidearm
- Reload counts specified (e.g., "one reload" = extra magazine)
- Special equipment noted (grenades, bayonets, etc.)
- Equipment reflects realistic 1990s military loadouts

---

## Usage for Milestone 2

These NPC profiles will be implemented as campaign-accessible templates in the personnel system:

1. **GM selects an NPC profile** (e.g., "US Soldier")
2. **System creates personnel record** with all listed attributes, skills, CUF, equipment
3. **GM can customize** name, condition, readiness before saving
4. **All stats verified** against Referee's Manual

This eliminates manual NPC creation and ensures consistent, rule-verified NPCs for quick use in sessions.
