# T2K 4E Combat Expansion - Quick Reference

## Heavy Weapons API Quick Start

### Grenade (Fragmentation)
```javascript
const result = await combatClient.resolveHeavyWeapon({
  weaponName: "M67 Grenade",
  baseDamage: 6,
  threshold: 4,
  weaponType: "grenade-frag",
  shooterAgilityDie: "D10",
  shooterMobilityDie: "D8",
  agilityRoll: 10,
  mobilityRoll: 8,
  targetArmorLevel: 0
});
```

**Result**: Direct hit
- Primary hex: 6 damage
- Adjacent hexes: 3 damage
- Affected: 7 hexes total
- Critical: Yes (6 >= threshold 4)

### Grenade (Shaped Charge)
```javascript
const result = await combatClient.resolveHeavyWeapon({
  weaponName: "PZFAUST Warhead",
  baseDamage: 7,
  threshold: 5,
  weaponType: "grenade-shaped",
  agilityRoll: 9,
  mobilityRoll: 7,
  targetArmorLevel: 2  // Armor ×2 against shaped charge
});
```

**Result**: Direct hit
- Primary hex: 7 - (2×2) = 3 damage
- Adjacent hexes: None (shaped charge only affects primary)
- Armor penetration: Doubles against shaped charges

### Mine (Anti-Personnel)
```javascript
const result = await combatClient.resolveHeavyWeapon({
  weaponName: "M14 AP Mine",
  baseDamage: 5,
  threshold: 3,
  weaponType: "mine-anti-personnel",
  agilityRoll: 10,
  mobilityRoll: 5,
  targetArmorLevel: 0
});
```

**Result**: Direct hit on trigger
- Primary hex: 5 damage
- No blast radius
- No adjacent hex damage

## Vehicle Combat API Quick Start

### Standard Vehicle Hit
```javascript
const result = await combatClient.resolveVehicleCombat({
  vehicleName: "T-80",
  targetingType: "standard",
  vehicleStructureValue: 6,
  weaponPenetration: 7,
  shooterAgilityDie: "D10",
  shooterRangedCombatDie: "D8",
  range: "medium",
  agilityRoll: 9,
  rangedCombatRoll: 7,
  modifierDeltas: []
});
```

**Result**: Hit
- Penetration: 7 > Structure 6 = PENETRATED
- Penetration margin: 7 - 6 = 1
- Damage effect: IMMOBILIZED (margin 1-2)

### Vulnerable Spot Hit
```javascript
const result = await combatClient.resolveVehicleCombat({
  vehicleName: "T-80",
  targetingType: "vulnerable",  // ×2 penetration
  vehicleStructureValue: 6,
  weaponPenetration: 4,        // Effective: 8
  agilityRoll: 10,
  rangedCombatRoll: 8
});
```

**Result**: Hit
- Effective penetration: 4 × 2 = 8
- Penetration margin: 8 - 6 = 2
- Damage effect: IMMOBILIZED

### Armor Withstands
```javascript
const result = await combatClient.resolveVehicleCombat({
  vehicleName: "T-80",
  targetingType: "standard",
  vehicleStructureValue: 8,
  weaponPenetration: 5,
  agilityRoll: 9,
  rangedCombatRoll: 7
});
```

**Result**: Hit but glanced off
- Penetration: 5 < Structure 8 = NOT PENETRATED
- Damage effect: GLANCED-OFF (no effect)

## Damage Effects Reference

### Penetration Margin
- **≤ 0**: Glanced-off (armor holds)
- **1-2**: Immobilized (vehicle can't move but still functions)
- **≥ 3**: Destroyed (vehicle non-functional, may burn/explode)

### Grenade Types
| Type | Blast Radius | Armor Effect | Damage Type |
|------|--------------|--------------|------------|
| Frag | 7 hexes (1+6) | Normal | Fragments |
| Shaped | 1 hex only | ×2 penetration | Armor-piercing |
| Mine AP | 1 hex only | Normal | Fragments |
| Mine AV | 1 hex only | ×2 penetration | Armor-piercing |

## GM Interface Tabs

### Ranged Attack Tab
- Weapon selection and damage
- Range and modifiers
- Dice rolls (AGI + Ranged Combat)
- Armor and ammo tracking

### Close Combat Tab
- Weapon info
- Strength and Close Combat rolls
- Armor reduction
- Simple hit/miss and damage

### Grenade Tab
- Quick grenade throw
- Blast power and threshold
- AGI + Mobility rolls

### Heavy Weapon Tab
- Advanced grenade/mine attacks
- Weapon type selection (frag/shaped/mine)
- Scatter for missed shots
- Full blast radius calculation

### Vehicle Tab
- Vehicle targeting and structure
- Weapon penetration
- Standard vs vulnerable spots
- Armor penetration effects

## Dice Roll Ranges

All rolls are **1-12** on a D12 die:
- **1-5**: Failure (no success)
- **6-9**: 1 success (©)
- **10-12**: 2 successes (©©)

Success requires either die to roll 6+.

## Test Coverage

**Heavy Weapons**: 20+ tests
- Grenade frag hits and blast
- Shaped charge armor penetration
- Mine attacks
- Scatter calculations
- Armor reduction
- Critical hits

**Vehicle Combat**: 15+ tests
- Armor penetration
- Vulnerable spots
- Damage effects
- Range modifiers
- No-penetration scenarios

**Total**: 116 tests, 100% pass rate

## Examples by Weapon

### M67 Fragmentation Grenade
- Base Damage: 6
- Threshold: 3
- Blast: 7 hexes (frag pattern)
- Armor: Normal reduction

### PZFAUST 3 Shaped Charge
- Base Damage: 7
- Threshold: 5
- Blast: 1 hex only
- Armor: ×2 against shaped charge

### AT4 Anti-Vehicle
- Base Damage: 8
- Threshold: 6
- Blast: 1 hex only
- Armor: ×2 against shaped charge

### T-80 Tank
- Structure Value: 6
- Known Vulnerabilities: Engine deck (×2), Turret ring (×2)
- Weapon Examples: 7+ penetration to damage

### Humvee (Light Vehicle)
- Structure Value: 3
- Minimal armor
- Most small arms penetrate
- Can be destroyed by grenades

## Result Fields Explained

### Heavy Weapons Result
```json
{
  "hit": { "isHit": true, "location": "Direct hit on target hex" },
  "blast": {
    "primaryHexDamage": 6,      // Direct target damage
    "adjacentHexDamage": 3,      // Surrounding hex damage (frag only)
    "affectedHexes": 7,          // Total hexes affected
    "damageType": "fragments"    // "fragments" or "shaped-charge"
  },
  "damage": {
    "primaryHex": { "base": 6, "armor": 0, "total": 6 },
    "adjacentHex": { "base": 3, "armor": 0, "total": 3 }  // null if shaped
  },
  "critical": null,  // or { threshold: 4, damageDealt: 6, ... }
  "summary": {
    "outcome": "HIT",
    "primaryDamage": 6,
    "adjacentDamage": 3,
    "hexesAffected": 7,
    "isCritical": false,
    "damageType": "fragments"
  }
}
```

### Vehicle Result
```json
{
  "hit": { "isHit": true, "targetType": "standard" },
  "damage": {
    "weaponPenetration": 8,
    "vehicleStructure": 6,
    "effectivePenetration": 8,      // ×2 if vulnerable spot
    "armorPenetrated": true,
    "penetrationMargin": 2           // Effective - Structure
  },
  "effect": {
    "outcome": "immobilized",       // "glanced-off", "damaged", "immobilized", "destroyed"
    "description": "Vehicle is immobilized - cannot move"
  },
  "summary": {
    "outcome": "HIT",
    "vehicleEffect": "immobilized",
    "armorPenetrated": true,
    "description": "Hit on standard spot - vehicle immobilized"
  }
}
```

## Integration Notes

- All combat results logged to campaign audit trail
- Combat log includes attacker, target, weapon, rolls, and outcome
- Results can be published to players via situation report
- GM can review complete combat history for campaign
- Compatible with existing ranged, close combat, and grenade systems
