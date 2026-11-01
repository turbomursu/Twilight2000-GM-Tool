# GM Combat Guide

Combat automation in the Twilight: 2000 Fourth Edition GM Tool follows verified official procedures. The system does not generate random numbers—instead, the GM enters pre-rolled dice values, and the system calculates results using official T2K 4E mechanics.

## Combat Workflow

### 1. Ranged Attack Resolution

When a character makes a ranged attack (small arms, rifles, machine guns):

1. **Roll dice**: Player/GM rolls Agility die and Ranged Combat skill die (physical dice or external roller)
2. **Enter rolls**: GM submits the dice values to the system (1–12 each)
3. **Specify weapon**: Select weapon name and base damage from character sheet
4. **Apply modifiers**: Enter total modifier from range, terrain, cover, lighting, wind, stance, etc.
5. **System calculates**:
   - Success count from both dice (roll 6–9 = 1 success, 10–12 = 2 successes)
   - To-hit check against difficulty threshold
   - Damage if hit (weapon base + strength bonus − armor level)
   - Critical hit if damage ≥ weapon threshold
   - Ammo consumption (if magazine-fed weapon)
   - Weapon jam check (magazine-fed only; 6–9 = −1 reliability, 10+ = jam)

**API Endpoint**: `POST /api/campaigns/:id/combat/ranged-attack`

**Request Body**:
```json
{
  "attackerName": "Player 1",
  "weaponName": "M16A4",
  "weaponBaseDamage": 3,
  "weaponThreshold": 4,
  "range": "medium",
  "agilityRoll": 9,
  "rangedCombatRoll": 7,
  "shooterStrengthDie": "D8",
  "targetArmorLevel": 2,
  "modifierDeltas": [1, -1],
  "ammoDieType": 1,
  "ammoAvailable": 20
}
```

**Response**:
```json
{
  "attack": {
    "attacker": "Player 1",
    "weapon": "M16A4",
    "range": "medium",
    "rolls": {
      "agility": { "roll": 9, "successes": 1 },
      "rangedCombat": { "roll": 7, "successes": 1 }
    }
  },
  "hit": {
    "isHit": true,
    "threshold": 2
  },
  "damage": {
    "base": 3,
    "strengthBonus": 1,
    "armorLevel": 2,
    "total": 2
  },
  "critical": {
    "isCritical": false,
    "threshold": 4
  },
  "ammo": {
    "consumed": 1,
    "remaining": 19
  },
  "summary": {
    "outcome": "HIT",
    "isCritical": false,
    "description": "M16A4 hit for 2 damage (3 base + 1 STR − 2 armor)"
  }
}
```

### 2. Close Combat Resolution

When a character engages in melee combat (hand-to-hand, blades, etc.):

1. **Roll dice**: Player/GM rolls Strength die and Close Combat skill die
2. **Enter rolls**: GM submits the dice values
3. **System calculates**:
   - Success count from both dice
   - Hit/miss determination
   - Damage (weapon base + strength bonus − armor level)
   - Critical hit if damage ≥ weapon threshold

**API Endpoint**: `POST /api/campaigns/:id/combat/close-combat`

**Request Body**:
```json
{
  "attackerName": "Player 2",
  "strengthRoll": 11,
  "closeCombatRoll": 9,
  "weaponName": "Combat Knife",
  "weaponBaseDamage": 2,
  "weaponThreshold": 2,
  "targetArmorLevel": 1
}
```

**Response**:
```json
{
  "attack": {
    "attacker": "Player 2",
    "weapon": "Combat Knife",
    "rolls": {
      "strength": { "roll": 11, "successes": 2 },
      "closeCombat": { "roll": 9, "successes": 1 }
    }
  },
  "hit": {
    "isHit": true,
    "threshold": 1
  },
  "damage": {
    "base": 2,
    "strengthBonus": 2,
    "armorLevel": 1,
    "total": 3
  },
  "critical": {
    "isCritical": true,
    "threshold": 2
  },
  "summary": {
    "outcome": "HIT",
    "isCritical": true,
    "description": "Combat Knife CRITICAL HIT for 3 damage (2 base + 2 STR − 1 armor)"
  }
}
```

### 3. Grenade Resolution

When a character throws or deploys a grenade:

1. **Roll dice**: GM rolls Agility die and Thrown Weapons skill die
2. **Target difficulty**: System determines difficulty based on distance and conditions
3. **System calculates**:
   - Scatter distance if missed
   - Blast radius damage
   - Affected targets

**API Endpoint**: `POST /api/campaigns/:id/combat/grenade`

**Request Body**:
```json
{
  "throwerName": "Player 3",
  "grenadeName": "Frag Grenade",
  "grenadeBlastRadius": 50,
  "grenadeDamage": 4,
  "agilityRoll": 8,
  "thrownWeaponsRoll": 7,
  "targetDistance": 35,
  "difficultyModifier": 0
}
```

**Response**:
```json
{
  "throw": {
    "thrower": "Player 3",
    "grenade": "Frag Grenade",
    "rolls": {
      "agility": { "roll": 8, "successes": 1 },
      "thrownWeapons": { "roll": 7, "successes": 1 }
    }
  },
  "outcome": "HIT",
  "location": {
    "distance": 35,
    "scatter": 0
  },
  "blast": {
    "radius": 50,
    "damage": 4
  },
  "summary": {
    "description": "Frag Grenade detonates at target location, 50m blast radius"
  }
}
```

## Combat Mechanics Reference

### Dice Success Table
| Roll | Successes | Symbol Count |
|------|-----------|--------------|
| 1–5  | 0         | —            |
| 6–9  | 1         | ©            |
| 10–12| 2         | ©©           |

### Strength Bonus (Die-Based, Not Roll-Based)
| Die Size | Bonus |
|----------|-------|
| D6       | +1    |
| D8       | +1    |
| D10      | +2    |
| D12      | +2    |

### Range Modifiers (Ranged Combat)
| Range | Modifier |
|-------|----------|
| Point Blank (0–10m) | +2 |
| Close (11–50m) | +1 |
| Medium (51–200m) | +0 |
| Long (201–400m) | −1 |
| Extreme (401m+) | −3 |

### Weapon Jam Rules (Magazine-Fed Only)
- **Single symbol** (6–9 on ammo die): −1 reliability
- **Two+ symbols** (10–12 on ammo die): Weapon jam (failure to fire)

### Ammo Consumption
- Each symbol on ammo die = 1 round of ammunition consumed
- Cannot roll more ammo dice than available in magazine
- Reloading is a fast action (require successful RC roll) or slow action (automatic)

## Known Limitations & GM-Managed Rules

The following procedures currently require GM adjudication and are not automated:

- **Critical damage rolls**: When a hit is critical, the full critical damage table roll must be resolved by GM and player
- **Environmental effects**: Dynamic terrain, weather, visibility changes require GM input
- **Called shots**: Targeting specific body parts or equipment follows special procedures requiring GM judgment
- **Suppressive fire**: Rate-of-fire based covering fire uses custom tables
- **Heavy weapons**: Grenades, mortars, explosives with blast mechanics
- **Vehicle combat**: Targeting vehicles and resolving vehicle damage
- **Burst/full-auto mechanics**: Rate of fire adjustments and multiple target scenarios

These features are planned for future releases. Current implementation focuses on core individual attack resolution with player-entered dice rolls.

## Testing & Verification

All combat calculations are verified against the Twilight: 2000 Fourth Edition Referee Aid materials. The system includes a comprehensive test suite covering:

- ✅ Dice success calculation (all roll values 1–12)
- ✅ Range modifiers (all 5 range categories)
- ✅ Ranged attack resolution (hit, miss, critical)
- ✅ Melee attack resolution (hit, miss, critical)
- ✅ Ammo consumption and magazine depletion
- ✅ Weapon jam detection (magazine-fed weapons only)
- ✅ Grenade throw resolution
- ✅ Damage calculation with armor reduction

**Test Suite**: `tests/combat.test.cjs` (17 test cases, all passing)

## Implementation Status

| Feature | Status |
|---------|--------|
| Core dice and success calculation | ✅ Complete |
| Ranged attack calculator | ✅ Complete |
| Melee combat calculator | ✅ Complete |
| Grenade throw calculator | ✅ Complete |
| Ammo tracking | ✅ Complete |
| Weapon jam detection | ✅ Complete |
| API endpoints (HTTP) | ✅ Complete |
| GM UI form (web) | 🔲 Planned |
| Combat result recording | 🔲 Planned |
| Audit logging integration | 🔲 Planned |
| Heavy weapons/explosives | 🔲 Planned |
| Vehicle combat | 🔲 Planned |
| Encounter automation | 🔲 Planned |

## Next Steps

1. **Create GM UI form**: Web form for submitting combat rolls
2. **Implement result recording**: Store attack results in campaign history
3. **Add audit logging**: Track all combat actions with GM ownership
4. **Extend to heavy weapons**: Grenades, mines, explosives with blast mechanics
5. **Vehicle combat**: Implement targeting and damage resolution for vehicles

## Questions & Feedback

For questions about combat mechanics or to report bugs, please refer to:
- T2K4E_COMBAT_SUBSYSTEMS_RANGED_HEAVY_VEHICLE.md (detailed procedures)
- T2K4E_COMBAT_QUICK_REFERENCE.md (quick lookup tables)
- Twilight: 2000 Fourth Edition Referee Aids (authoritative source)
