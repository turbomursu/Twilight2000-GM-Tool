/**
 * Heavy Weapons and Vehicle Combat Tests
 * 
 * Tests for:
 * - Heavy weapon attacks (grenades, mines) with blast mechanics
 * - Vehicle combat with armor and damage effects
 * - Combat logging and result recording
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveHeavyWeapon,
  resolveVehicleCombat,
  validateHeavyWeaponInput,
  validateVehicleCombatInput
} = require("../server/combat.cjs");

/**
 * Heavy Weapon Tests
 */

test("Heavy Weapon - validates input correctly", () => {
  const validInput = {
    weaponName: "M67 Grenade",
    baseDamage: 6,
    threshold: 4,
    weaponType: "grenade-frag",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 0
  };
  
  const errors = validateHeavyWeaponInput(validInput);
  assert.equal(errors.length, 0, "Valid input should have no errors");
});

test("Heavy Weapon - rejects invalid weapon type", () => {
  const input = {
    weaponName: "Unknown",
    baseDamage: 6,
    threshold: 4,
    weaponType: "invalid-type",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 0
  };
  
  const errors = validateHeavyWeaponInput(input);
  assert.ok(errors.some(e => e.includes("Weapon type")), "Should reject invalid type");
});

test("Heavy Weapon - grenade frag direct hit", () => {
  const input = {
    weaponName: "M67 Grenade",
    baseDamage: 6,
    threshold: 4,
    weaponType: "grenade-frag",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 0
  };
  
  // Both dice succeed (10 + 8 = 2 successes each)
  const result = resolveHeavyWeapon(input, 10, 8);
  
  assert.equal(result.hit.isHit, true, "Should be direct hit");
  assert.equal(result.blast.primaryHexDamage, 6, "Primary hex should take full damage");
  assert.equal(result.blast.adjacentHexDamage, 3, "Adjacent hexes should take half damage for frag");
  assert.equal(result.blast.affectedHexes, 7, "Frag grenade affects 7 hexes (primary + 6 adjacent)");
  assert.equal(result.summary.outcome, "HIT", "Outcome should be HIT");
  assert.ok(result.critical, "Damage 6 >= threshold 4 should be critical");
});

test("Heavy Weapon - grenade frag critical hit", () => {
  const input = {
    weaponName: "M67 Grenade",
    baseDamage: 5,
    threshold: 4,
    weaponType: "grenade-frag",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 0
  };
  
  // Damage 5 >= threshold 4
  const result = resolveHeavyWeapon(input, 10, 8);
  
  assert.equal(result.hit.isHit, true, "Should be direct hit");
  assert.equal(result.damage.primaryHex.total, 5, "Primary damage should be 5");
  assert.ok(result.critical, "Should have critical hit");
  assert.equal(result.critical.threshold, 4, "Critical threshold should be 4");
  assert.equal(result.summary.isCritical, true, "Summary should indicate critical");
  assert.equal(result.critical.description, "Detonation critical: maximum effect", "Critical description");
});

test("Heavy Weapon - grenade frag with armor reduction", () => {
  const input = {
    weaponName: "M67 Grenade",
    baseDamage: 6,
    threshold: 4,
    weaponType: "grenade-frag",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 2
  };
  
  const result = resolveHeavyWeapon(input, 10, 8);
  
  assert.equal(result.hit.isHit, true, "Should be direct hit");
  assert.equal(result.damage.primaryHex.armor, 2, "Armor reduction for frag grenades");
  assert.equal(result.damage.primaryHex.total, 4, "Damage 6 - 2 armor = 4");
  assert.equal(result.blast.adjacentHexDamage, 2, "Adjacent damage (4 / 2 = 2)");
});

test("Heavy Weapon - shaped charge direct hit (double armor penetration)", () => {
  const input = {
    weaponName: "HEAT Warhead",
    baseDamage: 7,
    threshold: 5,
    weaponType: "grenade-shaped",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 2
  };
  
  const result = resolveHeavyWeapon(input, 10, 8);
  
  assert.equal(result.hit.isHit, true, "Should be direct hit");
  assert.equal(result.damage.primaryHex.armor, 4, "Shaped charge armor ×2: 2 × 2 = 4");
  assert.equal(result.damage.primaryHex.total, 3, "Damage 7 - 4 armor = 3");
  assert.equal(result.blast.affectedHexes, 1, "Shaped charge only affects primary hex");
  assert.equal(result.damage.adjacentHex, null, "Shaped charge has no adjacent hex damage");
  assert.equal(result.summary.damageType, "shaped-charge (armor×2)", "Should indicate armor doubling");
});

test("Heavy Weapon - grenade miss without scatter", () => {
  const input = {
    weaponName: "M67 Grenade",
    baseDamage: 6,
    threshold: 4,
    weaponType: "grenade-frag",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 0
  };
  
  // Both dice fail (1 + 2 = no successes)
  const result = resolveHeavyWeapon(input, 1, 2);
  
  assert.equal(result.hit.isHit, false, "Should miss");
  assert.equal(result.summary.outcome, "MISS", "Outcome should be MISS");
  assert.equal(result.summary.scatterNeeded, true, "Scatter needed for grenade miss");
  assert.equal(result.blast.affectedHexes, 0, "No hex affected on miss");
});

test("Heavy Weapon - mine hit (no blast radius)", () => {
  const input = {
    weaponName: "Anti-Personnel Mine",
    baseDamage: 5,
    threshold: 3,
    weaponType: "mine-anti-personnel",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 0
  };
  
  const result = resolveHeavyWeapon(input, 10, 8);
  
  assert.equal(result.hit.isHit, true, "Should be direct hit");
  assert.equal(result.damage.primaryHex.total, 5, "Full damage on direct hit");
  assert.equal(result.blast.affectedHexes, 1, "Mine only affects primary hex");
  assert.equal(result.summary.damageType, "fragments", "Anti-personnel uses fragments");
});

test("Heavy Weapon - mine miss (no trigger)", () => {
  const input = {
    weaponName: "Anti-Tank Mine",
    baseDamage: 9,
    threshold: 6,
    weaponType: "mine-anti-vehicle",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 0
  };
  
  const result = resolveHeavyWeapon(input, 1, 2);
  
  assert.equal(result.hit.isHit, false, "Should miss trigger");
  assert.equal(result.summary.outcome, "MISS", "Outcome should be MISS");
  assert.equal(result.summary.description, "Mine trigger not activated or proximity failure", "Should explain mine miss");
});

test("Heavy Weapon - rejects invalid agility roll", () => {
  const input = {
    weaponName: "M67 Grenade",
    baseDamage: 6,
    threshold: 4,
    weaponType: "grenade-frag",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 0
  };
  
  assert.throws(() => resolveHeavyWeapon(input, 13, 8), /Invalid agility roll/);
  assert.throws(() => resolveHeavyWeapon(input, 0, 8), /Invalid agility roll/);
});

test("Heavy Weapon - rejects invalid mobility roll", () => {
  const input = {
    weaponName: "M67 Grenade",
    baseDamage: 6,
    threshold: 4,
    weaponType: "grenade-frag",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 0
  };
  
  assert.throws(() => resolveHeavyWeapon(input, 10, 13), /Invalid mobility roll/);
  assert.throws(() => resolveHeavyWeapon(input, 10, 0), /Invalid mobility roll/);
});

test("Heavy Weapon - damage floor prevents negative values", () => {
  const input = {
    weaponName: "M67 Grenade",
    baseDamage: 2,
    threshold: 4,
    weaponType: "grenade-frag",
    shooterAgilityDie: "D10",
    shooterMobilityDie: "D8",
    targetArmorLevel: 5 // Very heavy armor
  };
  
  const result = resolveHeavyWeapon(input, 10, 8);
  
  assert.equal(result.damage.primaryHex.total, 0, "Damage should never be negative");
  assert.equal(result.critical, null, "Cannot be critical with 0 damage");
});

/**
 * Vehicle Combat Tests
 */

test("Vehicle Combat - validates input correctly", () => {
  const validInput = {
    vehicleName: "T-80",
    targetingType: "standard",
    vehicleStructureValue: 6,
    weaponPenetration: 5,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "medium",
    modifierDeltas: []
  };
  
  const errors = validateVehicleCombatInput(validInput);
  assert.equal(errors.length, 0, "Valid input should have no errors");
});

test("Vehicle Combat - rejects invalid targeting type", () => {
  const input = {
    vehicleName: "T-80",
    targetingType: "invalid",
    vehicleStructureValue: 6,
    weaponPenetration: 5,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8"
  };
  
  const errors = validateVehicleCombatInput(input);
  assert.ok(errors.some(e => e.includes("Targeting type")), "Should reject invalid targeting");
});

test("Vehicle Combat - standard targeting hit, armor penetrated", () => {
  const input = {
    vehicleName: "T-80",
    targetingType: "standard",
    vehicleStructureValue: 4,
    weaponPenetration: 6,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "medium",
    modifierDeltas: []
  };
  
  // Agility roll succeeds (10)
  const result = resolveVehicleCombat(input, 10, 2);
  
  assert.equal(result.hit.isHit, true, "Should be hit");
  assert.equal(result.damage.armorPenetrated, true, "Penetration 6 > structure 4");
  assert.equal(result.damage.penetrationMargin, 2, "Penetration margin 6 - 4 = 2");
  assert.equal(result.effect.outcome, "immobilized", "Penetration margin 2 causes immobilized");
});

test("Vehicle Combat - vulnerable targeting, doubled penetration", () => {
  const input = {
    vehicleName: "T-80",
    targetingType: "vulnerable",
    vehicleStructureValue: 6,
    weaponPenetration: 4,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "medium",
    modifierDeltas: []
  };
  
  // Agility roll succeeds
  const result = resolveVehicleCombat(input, 10, 2);
  
  assert.equal(result.hit.isHit, true, "Should be hit");
  assert.equal(result.damage.effectivePenetration, 8, "Vulnerable spot doubles penetration: 4 × 2 = 8");
  assert.equal(result.damage.armorPenetrated, true, "Effective penetration 8 > structure 6");
  assert.equal(result.damage.penetrationMargin, 2, "Penetration margin 8 - 6 = 2");
});

test("Vehicle Combat - penetration margin determines damage effect", () => {
  // Test margin 0-1 = "damaged" - but actually it's 1 = damaged, >= 1 starts being immobilized
  // Let me check: penetration 5 vs structure 6 = no penetration at all
  // penetration 6 vs structure 6 = margin 0 = glanced off
  // penetration 7 vs structure 6 = margin 1 = damaged or immobilized?
  // Actually: margin >= 1 = penetrated, margin 1-2 = immobilized, margin >= 3 = destroyed
  
  // Test margin 1-2 = "immobilized"
  const input1 = {
    vehicleName: "Vehicle",
    targetingType: "standard",
    vehicleStructureValue: 6,
    weaponPenetration: 7,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "medium",
    modifierDeltas: []
  };
  
  let result = resolveVehicleCombat(input1, 10, 2);
  assert.equal(result.effect.outcome, "immobilized", "Margin 1 = immobilized");
  
  // Test margin 2-3 = "immobilized"
  const input2 = {
    vehicleName: "Vehicle",
    targetingType: "standard",
    vehicleStructureValue: 6,
    weaponPenetration: 8,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "medium",
    modifierDeltas: []
  };
  
  result = resolveVehicleCombat(input2, 10, 2);
  assert.equal(result.effect.outcome, "immobilized", "Margin 2 = immobilized");
  
  // Test margin >= 3 = "destroyed"
  const input3 = {
    vehicleName: "Vehicle",
    targetingType: "standard",
    vehicleStructureValue: 5,
    weaponPenetration: 10,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "medium",
    modifierDeltas: []
  };
  
  result = resolveVehicleCombat(input3, 10, 2);
  assert.equal(result.effect.outcome, "destroyed", "Margin 5 >= 3 = destroyed");
});

test("Vehicle Combat - armor withstands, no penetration", () => {
  const input = {
    vehicleName: "T-80",
    targetingType: "standard",
    vehicleStructureValue: 8,
    weaponPenetration: 5,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "medium",
    modifierDeltas: []
  };
  
  const result = resolveVehicleCombat(input, 10, 2);
  
  assert.equal(result.hit.isHit, true, "Should be hit");
  assert.equal(result.damage.armorPenetrated, false, "Penetration 5 < structure 8");
  assert.equal(result.effect.outcome, "glanced-off", "No penetration = glanced-off");
  assert.equal(result.summary.vehicleEffect, "glanced-off", "Summary should show glanced-off");
});

test("Vehicle Combat - miss on both dice", () => {
  const input = {
    vehicleName: "T-80",
    targetingType: "standard",
    vehicleStructureValue: 6,
    weaponPenetration: 5,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "medium",
    modifierDeltas: []
  };
  
  // Both dice fail (1 + 2)
  const result = resolveVehicleCombat(input, 1, 2);
  
  assert.equal(result.hit.isHit, false, "Should miss");
  assert.equal(result.summary.outcome, "MISS", "Outcome should be MISS");
  assert.equal(result.damage, null, "No damage on miss");
});

test("Vehicle Combat - range modifiers apply", () => {
  const input = {
    vehicleName: "T-80",
    targetingType: "standard",
    vehicleStructureValue: 6,
    weaponPenetration: 5,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "long",
    modifierDeltas: [-1]
  };
  
  // Agility roll 6 + long range modifier (-2) + custom (-1) = 3, fails
  const result = resolveVehicleCombat(input, 6, 10);
  
  assert.equal(result.attack.range, "long", "Should be long range");
  assert.equal(result.attack.totalModifier, -3, "Total modifier: -2 (long) + -1 (custom) = -3");
  assert.equal(result.rolls.agility.modifiedTotal, 3, "Modified agility: 6 + (-3) = 3");
  assert.equal(result.rolls.agility.isSuccess, false, "3 < 6 fails");
});

test("Vehicle Combat - rejects invalid rolls", () => {
  const input = {
    vehicleName: "T-80",
    targetingType: "standard",
    vehicleStructureValue: 6,
    weaponPenetration: 5,
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    range: "medium",
    modifierDeltas: []
  };
  
  assert.throws(() => resolveVehicleCombat(input, 13, 2), /Invalid agility roll/);
  assert.throws(() => resolveVehicleCombat(input, 10, 13), /Invalid ranged combat roll/);
});
