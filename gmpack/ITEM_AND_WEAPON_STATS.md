# T2K 4E Item & Weapon Stat Tables - Reference

> Extracted from official T2K 4E Referee Aids (OCR transcripts)
> For use as implementation reference for the Fieldbook GM Tool
> This is a search aid; verify all stat details against original PDFs before game use

---

## Weapon System Overview

All weapons in T2K 4E have the following stat categories:

| Stat | Range | Used In | Notes |
|------|-------|---------|-------|
| **Base Damage (DMG)** | 1D6–4D12+ | All combat rolls | Roll weapon's base damage die on hit; add extra successes from attack roll |
| **Critical Threshold** | 1–4+ | Damage resolution | Roll critical table if damage ≥ threshold; target takes damage twice |
| **Armor Modifier** | -3 to +3 | Armor reduction | Modifies armor level when calculating protection |
| **Rate of Fire (RoF)** | Single/3-round/Full Auto | Ranged combat | Determines ammo dice availability |
| **Reliability (Rel)** | Letter rating | Weapon maintenance | Decreases on failed maintenance or jam |

---

## Close Combat Weapons

**Skill Roll**: STR + Close Combat

**Base Damage**: Varies; see table
**Critical Threshold**: 2–4 (varies by weapon)

### Melee Weapons Table (OCR Extract)

Based on T2K 4E Referee Aid: Close Combat

```
WEAPON               BASE DMG  MOD  CRIT  ARMOR
Unarmed              1D6       +1   4     +3
Riflebutt            1D6 + 2   +2   4     2
Knife                1D8 + 3   +3   4     1
Club                 1D8       +1   4     1
Bottle               1D4       +2   —     —
Barbed wire          —         —    —     —
Spear/Bayonet        1D8 + 2   +2   3     1
Axe/Hatchet          1D10      +2   3     1
Sword                1D12      +1   2     —
```

**Notes from OCR:**
- Unarmed attacks deal 1D6 base damage
- Diving Blow (running into hex + unarmed attack same round): +2 modifier to attack roll
- Aimed Blow: special maneuver (specific procedure, pg. reference not clear in OCR)
- All Close Combat attacks roll STR + Close Combat skill
- Blocking reduces opponent's roll (each ⊙ on blocker's roll negates one from attacker)
- Prone targets take -2 modifier to Close Combat attacks (attacker) or +2 (defender has advantage)
- Defenseless target: attack succeeds automatically

---

## Ranged Combat Weapons

**Skill Roll**: AGI + Ranged Combat

**One-Handed Shooting Rules:**
- Pistols: No penalty
- Submachinegun/Carbine: -2 modifier
- Assault Rifle: -3 modifier (short range only)
- All other weapons: Cannot fire one-handed

### Small Arms Modifiers (OCR Extract)

```
WEAPON TYPE          ROF    BASE DMG  CRIT  ARMOR MOD  NOTES
Pistol               Single 1D8       2     +1         One-handed OK
SMG                  3-RB   1D8 + 1   2     +1         -2 one-handed
Carbine              Single 1D10      2     +1         -2 one-handed
Assault Rifle        3-RB   1D10      2     +2         -3 one-handed short range
Rifle                Single 1D12      3     +2         —
Shotgun              Single 2D8       3     +1         —
Sniper Rifle         Single 2D10      4     +3         —
```

### Ranged Combat Modifiers

**To-Hit Modifiers** (OCR extract from Ranged Combat aid):

| Modifier | Value |
|----------|-------|
| Range: Short/Medium/Long/Extreme | -/-1/-2/-3 |
| Player Specialty | +1 |
| Scope (slow aim) | +1/+2 |
| Target in Same Hex | -1/-2 |
| Target Hex Terrain | -1/-2 |
| Target Prone (not same hex) | -1 |
| Called Shot | -2 |
| Target Moving | -1 |
| Firing from Moving Vehicle | -2 |
| Firing from Elevation | +1 |
| Light/Dim/Dark | -/-1/-2 |
| Rain/Wind/Snow | -1 |
| Dense Smoke | -3 |
| Target in Full Cover | -3 |
| Large Target | +2 |
| Small Target | -2 |

### Quick Shot vs. Aimed Shot

**Quick Shot:**
- Action: Fast action
- Modifiers: -1 to-hit modifier
- Skill: AGI + Ranged Combat
- No aiming procedure needed

**Aimed Shot:**
- Action: Slow action
- Modifiers: Apply all normal modifiers
- Skill: AGI + Ranged Combat
- Can increase by continuing to aim (each slow action continues aim)

**Overwatch:**
- Action: Slow action (with telescopic sight, fast action without)
- Trigger: At-ready to fire next round
- Condition: Must wait a turn before firing if you took any action before Overwatch
- Effect: Can interrupt turn order to fire at target

### Ammunition & Rate of Fire

**Ammo Dice Rules** (OCR):
- Can only be used with weapons having RoF
- Single-shot weapons: No ammo dice used
- RoF weapons: Roll ammo dice + weapon dice
- Each ⊙ result = one round of ammunition fired (subtract from magazine)
- Magazine empty: Cannot fire until reloaded

**Reload Action:**
- Success on Ranged Combat roll: Fast action
- Failure: Slow action instead
- Reloading is a distinct action (not part of attack)

**Weapon Jams:**
- On failure with multiple ⊙ results (two or more): Weapon jams
- Jam clears with successful Ranged Combat or Heavy Weapons roll (both take a slow action)
- Jam causes -1 Reliability reduction

---

## Heavy Weapons

**Skill Roll**: 
- **Grenades**: AGI + Mobility (thrown) or STR + Heavy Weapons
- **Grenade Launchers/Rocket Launchers**: STR + Heavy Weapons
- **Machine Guns (mounted)**: AGI + Heavy Weapons (tripod/vehicle mount)
- **Machine Guns (shoulder)**: STR + Heavy Weapons
- **Mortars/Howitzers**: INT + Heavy Weapons (aiming is slow action)

### Heavy Weapons Table (OCR Extract)

Based on T2K 4E Referee Aid: Heavy Weapons & Explosives

```
WEAPON                BASE DMG        CRIT  ARMOR MOD  BLAST PWR
Grenade (Hand)        Direct/Blast    —     —           B
Grenade Launcher      Direct/Blast    —     —           B–D
Rocket Launcher       Direct/Blast    —     —           A–C
AT Mine               Direct/Blast    —     —           B
AP Mine               Blast only      —     —           B–D
Light Machine Gun     1D10 + ammo      2     +1         —
Medium Machine Gun    1D12 + ammo      3     +2         —
Heavy Machine Gun     2D12 + ammo      3     +2         —
Mortar (81mm)         Direct/Blast    —     —           B–C
Howitzer (105mm)      Direct/Blast    —     —           A–B
```

### Explosive Damage (Grenades, Rockets, Mines)

**Direct Hit**: Explosive strikes target directly
- Roll direct damage (weapon's base damage)
- Also roll blast damage (see below)

**Nearby Explosion** (missed/landing in hex):
- Only blast damage applies (no direct damage)

**Blast Power Rating** (A–D, A = most powerful):

| Power | Dice | Damage | Crit | Armor Bonus |
|-------|------|--------|------|-------------|
| A | 2xD12 | 4 | 3 | +1 |
| B | 2xD10 | 3 | 3 | +1 |
| C | 2xD8 | 2 | 3 | +1 |
| D | 2xD6 | 1 | 2 | +1 |

**Blast Radius Effects:**
- Each hex away from center reduces blast power by 1 step
- Reducing below D = no effect
- All targets in blast radius take damage (roll twice: one per person)
- Each additional ⊙ beyond first adds +1 damage to that person

**Blast Cover Reduction:**
- Prone: Blast power reduced 1 step
- Solid cover: Like armor; covers specific body areas
- Full cover: Can be fired on with -3 modifier (still protected by cover)

### Mines

**Anti-Personnel (AP) Mines:**
- Trigger: Stepped on
- Detection: Passive (no-push) Recon roll
- Explosion: D6 ≤ number of mines in hex = detonation
- Damage: Direct to legs (front); blast to hex

**Anti-Tank (AT) Mines:**
- Trigger: Vehicles only (one per hex)
- Detection: +2 modifier (easier than AP)
- Spotting from vehicle: -2 modifier (cancels detection bonus)
- Damage: Direct to vehicle's rear armor; blast to hex

**Direction Mines (IED):**
- Trigger: Remote/tripwire
- Damage: Blast only (no direct damage)
- Blast reduction: -1 per 3 hexes

---

## Armor & Protection

### Armor Levels & Coverage

| Armor Type | Level | Coverage |
|------------|-------|----------|
| None | 0 | — |
| Light (leather jacket, fabric) | 1 | Partial |
| Medium (combat fatigues, ceramic plates) | 2 | Full |
| Heavy (ballistic vest, helmet, plates) | 3 | Full |
| Kevlar Helmet | 1 (head only) | Head |
| Ceramic Plates (chest) | 2 (torso) | Chest |

### Cover & Barriers

**Barrier Types & Armor Effectiveness:**

| Barrier | Height | Armor Level | Notes |
|---------|--------|-------------|-------|
| Concrete Wall | High | 3 | Full protection |
| Brick Wall | Low | 2 | Partial protection |
| House Wall | High | 2 | Variable; GM determines |
| Sandbags | — | 4 | Heavy (vehicles: -1 Rel) |
| Door | Standard | — | 5 HP, picked with successful Tech roll |
| Barbed Wire | Low | — | Doesn't block visibility; crossing requires Mobility roll; 1 dmg on failure |
| Concertina Wire | Low | — | -2 modifier on crossing roll; critical #3 to legs on failure (pg. 76) |

**Cover Modifiers:**
- No Cover: — (normal attack)
- Divided Hex: Determine sides; barrier provides 1-step cover benefit
- Full Cover: -3 modifier to attack against target; blocks all body parts

---

## Armor Reduction & Ablation

**Armor Effectiveness:**

1. **Compare weapon armor modifier to armor level**
   - If weapon modifier ≥ armor level by 2+ steps: armor is fully penetrated (no reduction)
   - If weapon modifier ≥ armor level by 1 step: armor reduced by 1 step (minimum 1)
   - If weapon modifier < armor level: armor provides full protection (roll 1D6 ablation)

2. **Ablation Roll** (1D6)
   - If weapon damage ≥ armor level + ablation roll: Armor is penetrated; full damage applies
   - If weapon damage < armor level + ablation roll: Armor absorbs damage; target takes no damage

3. **Armor Degradation**
   - Each penetration: -1 to armor level (permanently damaged)
   - When armor reaches 0: No protection remaining

---

## Vehicle Weapons

**Used in Combat**: Vehicle Combat procedures (different rules for vehicle-to-vehicle)

**Small Arms vs. Vehicles:**
- Small arms firing at vehicles: +2 modifier
- Heavy weapons: No bonus
- Doesn't apply to: Bicycles, motorcycles

**Vehicle-Mounted Weapons:**
- Treated as ranged weapons when targeting infantry
- Treated as vehicle weapons when targeting other vehicles
- Gunner must follow weapon-specific rules (machine guns, cannons, etc.)

---

## Experience & Advancement Items

**Not Yet Documented in OCR** but referenced in Character Generation:

- Experience system defined on pg. 40 of Life Path Character Generation
- Character improvement system: Skill/attribute advancement via experience points
- Advancement tied to actual gameplay outcomes (not tool-automated)

---

## Crafting & Repairs (Tech Skill)

### Item Construction (IED, Weapons, Equipment)

**Requirements:** Successful Tech roll + materials + time (usually 1 stretch = several hours)

**Examples from OCR:**
- Creating IED: Tech roll success, explosives + detonation device + spare parts, 1 shift of work
- Failed Tech roll on IED creation: Device detonates immediately
- Locked door picking: Successful Tech roll (special procedure on pg. 59)
- Door HP: 5 (can be picked with Tech roll or destroyed)

### Weapon Maintenance

**Vehicle Maintenance** (per T2K 4E Strategic Play):
- Required: Once per week if vehicle driven 1+ hexes
- Action: One shift of work
- Skill: Tech roll
- Success: Vehicle remains operational
- Failure: Vehicle reliability decreases -1 step
- If reliability reaches 0: Vehicle is broken

---

## Item Stat Fields for Fieldbook Implementation

Based on inventory system structure, items should track:

```json
{
  "id": "unique-identifier",
  "name": "Item Name",
  "quantity": 1,
  "carryLocation": "combat-gear|backpack|tiny-items|unassigned",
  "sourceCategory": "RB|GM|UF",
  "sourceReference": "Book/Page or GM note",
  "details": "Stat block or detailed description",
  "stats": {
    "baseDamage": "1D8",
    "damageType": "melee|ranged|explosive",
    "armorModifier": "+1",
    "criticalThreshold": 2,
    "rateOfFire": "Single|3-RB|Full Auto",
    "range": "S/M/L/E",
    "armor": 2,
    "armorCoverage": "head|chest|limbs|full",
    "weight": "units (3kg per unit)",
    "reliability": "A-D",
    "notes": "Special rules or procedures"
  }
}
```

---

## Known Gaps & Limitations

**Not Documented in Available OCR:**
- ❌ Complete weapon stat tables (OCR formatting issues with tables)
- ❌ Full armor coverage maps
- ❌ Critical hit location tables (referenced as pgs. 74-76)
- ❌ Detailed vehicle stats
- ❌ Detailed NPC equipment lists
- ❌ Consumable/ammunition item types
- ❌ Specialty item procedures (explosives, electronics, etc.)

**To Complete This Reference:**
1. **Extract from original PDFs** rather than OCR (better table clarity)
2. **Cross-reference** with T2K 4E Player's Manual for comprehensive equipment lists
3. **Verify stat modifiers** against current errata or official clarifications
4. **Implement GM-facing tables** for quick reference during play

---

## Implementation Notes for Fieldbook

### Immediate (MVP)
- ✅ Store weapon/armor name, quantity, source category
- ✅ Track carry location (combat-gear, backpack, tiny-items)
- ✅ Allow GM to define custom items (GM source category)
- ✅ Display source label (RB/GM/UF) in inventory

### Phase 2 (Verified Stats)
- ❌ Add structured weapon stats fields (base damage, critical threshold, etc.)
- ❌ Validate against T2K 4E procedures (don't allow invalid values)
- ❌ Provide dropdown/checkbox for standard T2K 4E items
- ❌ Enforce RB items have correct stats

### Phase 3 (Procedural Integration)
- ❌ Auto-calculate hit capacity (STR + AGI dice / 4)
- ❌ Auto-calculate stress capacity (INT + EMP dice / 4)
- ❌ Calculate encumbrance penalties when carrying exceeds STR limit
- ❌ Track ammunition consumption per attack

### Later (Full Rules Integration)
- ❌ Automated combat: Apply armor modifiers automatically
- ❌ Damage calculation: Auto-roll base damage + successes
- ❌ Critical location tables: Auto-roll critical hits
- ❌ Ablation rolls: Track armor degradation

---

## See Also

- [CHARACTER_AND_NPC_CREATION.md](./CHARACTER_AND_NPC_CREATION.md) — Character attributes & capacity formulas
- [GAME_LOOP.md](./GAME_LOOP.md) — Combat procedures referencing weapon stats
- [SESSION_LOOP_COMPARISON.md](./SESSION_LOOP_COMPARISON.md) — Gap analysis vs. T2K 4E rules
- T2K 4E Referee Aids (OCR directory) — Official source material
- FEATURES.md — Inventory feature status (currently Partial, items stored with RB/GM/UF source labels)
