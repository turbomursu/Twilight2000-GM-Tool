/**
 * Combat Calculator Tests
 * 
 * Tests for dice roll result calculation
 * All tests use pre-determined dice values (no random generation)
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseDie,
  calculateSuccesses,
  validateRangedAttackInput,
  getRangeModifier,
  calculateToHitModifier,
  resolveRangedAttack,
  resolveGrenade,
  resolveCloseCombat
} = require("../server/combat.cjs");

test("parseDie - parses die notation correctly", () => {
  assert.equal(parseDie("D6"), 6);
  assert.equal(parseDie("D8"), 8);
  assert.equal(parseDie("D10"), 10);
  assert.equal(parseDie("D12"), 12);
  assert.equal(parseDie("d6"), 6); // Case insensitive
  assert.equal(parseDie(10), 10); // Already numeric
});

test("parseDie - rejects invalid die sizes", () => {
  assert.throws(() => parseDie("D4"), /Invalid die size/);
  assert.throws(() => parseDie("D20"), /Invalid die size/);
  assert.throws(() => parseDie("invalid"), /Invalid die notation/);
});

test("calculateSuccesses - correctly determines successes", () => {
  // No success
  let result = calculateSuccesses(1);
  assert.equal(result.successes, 0);
  assert.equal(result.isSymbol, false);
  
  result = calculateSuccesses(5);
  assert.equal(result.successes, 0);
  assert.equal(result.isSymbol, false);
  
  // One success
  result = calculateSuccesses(6);
  assert.equal(result.successes, 1);
  assert.equal(result.isSymbol, true);
  
  result = calculateSuccesses(9);
  assert.equal(result.successes, 1);
  assert.equal(result.isSymbol, true);
  
  // Two successes
  result = calculateSuccesses(10);
  assert.equal(result.successes, 2);
  assert.equal(result.isSymbol, true);
  
  result = calculateSuccesses(12);
  assert.equal(result.successes, 2);
  assert.equal(result.isSymbol, true);
});

test("getRangeModifier - returns correct range modifiers", () => {
  assert.equal(getRangeModifier("short"), 0);
  assert.equal(getRangeModifier("medium"), -1);
  assert.equal(getRangeModifier("long"), -2);
  assert.equal(getRangeModifier("extreme"), -3);
  assert.equal(getRangeModifier("invalid"), 0); // Default
});

test("calculateToHitModifier - calculates total modifier", () => {
  const input = {
    range: "medium",
    modifierDeltas: [-1, 2] // -1 from target, +2 from elevation
  };
  
  const result = calculateToHitModifier(input);
  assert.equal(result.modifier, 0); // -1 + (-1) + 2 = 0
  assert.equal(result.breakdown.range, -1);
  assert.equal(result.breakdown.custom, 1);
});

test("resolveRangedAttack - successful hit", () => {
  const input = {
    weaponName: "AK-74",
    weaponBaseDamage: 4,
    weaponThreshold: 4,
    range: "medium",
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 10,
    targetArmorLevel: 1,
    modifierDeltas: [0],
    ammoDieType: 0,
    ammoAvailable: 0
  };
  
  // Both dice fail to hit (3 + 4) with -1 modifier
  const result = resolveRangedAttack(input, 3, 4);
  
  assert.equal(result.hit.isHit, false);
  assert.equal(result.summary.outcome, "MISS");
  assert.equal(result.damage, null);
});

test("resolveRangedAttack - hit with damage", () => {
  const input = {
    weaponName: "Rifle",
    weaponBaseDamage: 4,
    weaponThreshold: 4,
    range: "short",
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 10,
    targetArmorLevel: 1,
    modifierDeltas: [0],
    ammoDieType: 0,
    ammoAvailable: 0
  };
  
  // Agility rolls 7 (success, 1 symbol)
  const result = resolveRangedAttack(input, 7, 3);
  
  assert.equal(result.hit.isHit, true);
  assert.equal(result.summary.outcome, "HIT");
  assert.equal(result.damage.base, 4);
  assert.equal(result.damage.strengthBonus, 2);
  assert.equal(result.damage.armor, 1);
  assert.equal(result.damage.total, 5); // 4 + 2 - 1 = 5
});

test("resolveRangedAttack - critical hit", () => {
  const input = {
    weaponName: "Rifle",
    weaponBaseDamage: 4,
    weaponThreshold: 4,
    range: "short",
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 10,
    targetArmorLevel: 0,
    modifierDeltas: [0],
    ammoDieType: 0,
    ammoAvailable: 0
  };
  
  // Both dice hit (10 + 8 both success)
  const result = resolveRangedAttack(input, 10, 8);
  
  assert.equal(result.hit.isHit, true);
  assert.equal(result.damage.total, 6); // 4 + 2 - 0 = 6
  assert.notEqual(result.critical, null); // Critical exists
  assert.equal(result.summary.isCritical, true); // 6 >= 4 threshold
});

test("resolveRangedAttack - with magazine and ammo consumption", () => {
  const input = {
    weaponName: "AK-74",
    weaponBaseDamage: 4,
    weaponThreshold: 4,
    range: "short",
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 10,
    targetArmorLevel: 1,
    modifierDeltas: [0],
    ammoDieType: 8,
    ammoAvailable: 10
  };
  
  // Agility 7 (success), RC 5 (no success), ammo dice [6, 10, 8] (3 symbols = 3 spent)
  const result = resolveRangedAttack(input, 7, 5, [6, 10, 8]);
  
  assert.equal(result.hit.isHit, true);
  assert.equal(result.rolls.ammo.spent, 3);
  assert.equal(result.rolls.ammo.remaining, 7); // 10 - 3 = 7
  assert.equal(result.damage.total, 5); // 4 + 2 - 1 = 5
});

test("resolveRangedAttack - insufficient ammo", () => {
  const input = {
    weaponName: "SMG",
    weaponBaseDamage: 3,
    weaponThreshold: 4,
    range: "short",
    shooterAgilityDie: "D8",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 8,
    targetArmorLevel: 0,
    modifierDeltas: [0],
    ammoDieType: 8,
    ammoAvailable: 1
  };
  
  // Ammo dice [1, 1, 3] = 3 symbols, but only 1 ammo available
  assert.throws(
    () => resolveRangedAttack(input, 7, 5, [1, 1, 3]),
    /Not enough ammo/
  );
});

test("resolveGrenade - successful throw", () => {
  const result = resolveGrenade(
    { throwerName: "Player 1" },
    7, // Agility 7 (success)
    5, // Mobility 5 (no success)
    {
      name: "Hand Grenade",
      blastPower: "D",
      threshold: 2,
      targetArmorLevel: 0
    }
  );
  
  assert.equal(result.hit.isHit, true);
  assert.equal(result.summary.outcome, "HIT");
});

test("resolveGrenade - missed throw", () => {
  const result = resolveGrenade(
    { throwerName: "Player 1" },
    3, // Agility 3 (no success)
    4, // Mobility 4 (no success)
    {
      name: "Hand Grenade",
      blastPower: "D",
      threshold: 2,
      targetArmorLevel: 0
    }
  );
  
  assert.equal(result.hit.isHit, false);
  assert.equal(result.summary.outcome, "MISS");
});

test("resolveCloseCombat - successful melee attack", () => {
  const result = resolveCloseCombat(
    { attackerName: "Player 1" },
    8, // Strength 8 (success, 1 symbol)
    5, // Close Combat 5 (no success)
    {
      name: "Knife",
      baseDamage: 3,
      threshold: 4
    },
    1 // Target armor
  );
  
  assert.equal(result.hit.isHit, true);
  assert.equal(result.damage.base, 3);
  assert.equal(result.damage.strengthBonus, 1); // D8 = 1 bonus
  assert.equal(result.damage.armor, 1);
  assert.equal(result.damage.total, 3); // 3 + 1 - 1 = 3
  assert.equal(result.critical, null); // 3 < 4 threshold, so no critical
});

test("resolveCloseCombat - critical melee hit", () => {
  const result = resolveCloseCombat(
    { attackerName: "Player 1" },
    11, // Strength 11 (success, 2 symbols)
    10, // Close Combat 10 (success, 2 symbols)
    {
      name: "Club",
      baseDamage: 4,
      threshold: 1
    },
    0 // No armor
  );
  
  assert.equal(result.hit.isHit, true);
  assert.equal(result.damage.base, 4);
  assert.equal(result.damage.strengthBonus, 2); // 11 > 8 = 2 bonus
  assert.equal(result.damage.total, 6); // 4 + 2 - 0 = 6
  assert.notEqual(result.critical, null); // Critical object exists
  assert.equal(result.summary.isCritical, true); // 6 >= 1 threshold
});

test("resolveCloseCombat - missed attack", () => {
  const result = resolveCloseCombat(
    { attackerName: "Player 1" },
    2, // Strength 2 (no success)
    3, // Close Combat 3 (no success)
    {
      name: "Punch",
      baseDamage: 1,
      threshold: 4
    },
    1
  );
  
  assert.equal(result.hit.isHit, false);
  assert.equal(result.summary.outcome, "MISS");
  assert.equal(result.damage, null);
});

test("validateRangedAttackInput - validates all required fields", () => {
  const validInput = {
    weaponName: "Rifle",
    weaponBaseDamage: 4,
    weaponThreshold: 4,
    range: "short",
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 10,
    targetArmorLevel: 1,
    modifierDeltas: [],
    ammoDieType: 0,
    ammoAvailable: 0
  };
  
  // Should pass with valid input
  const errors = validateRangedAttackInput(validInput);
  assert.equal(errors.length, 0);
  
  // Should fail with missing weapon name
  const invalidInput = { ...validInput, weaponName: undefined };
  const invalidErrors = validateRangedAttackInput(invalidInput);
  assert(invalidErrors.length > 0);
  assert(invalidErrors[0].includes("Weapon name"));
});

test("Combat system - integrated workflow: pistol at medium range", () => {
  // Scenario: Player shoots AK-74 at medium range with +1 modifier (elevation)
  // Rolls: Agility 9, Ranged Combat 6, Strength D10
  
  const input = {
    weaponName: "AK-74",
    weaponBaseDamage: 4,
    weaponThreshold: 4,
    range: "medium",
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 10,
    targetArmorLevel: 1,
    modifierDeltas: [1, 0], // Elevation +1
    ammoDieType: 0,
    ammoAvailable: 0
  };
  
  const result = resolveRangedAttack(input, 9, 6);
  
  // Agility 9: success (1 symbol), modified total: 9 - 1 + 1 = 9 (still hits)
  // RC 6: success (1 symbol), modified total: 6 - 1 + 1 = 6 (hits)
  assert.equal(result.hit.isHit, true);
  
  // Damage: 4 (base) + 2 (STR D10 bonus) - 1 (armor) = 5
  assert.equal(result.damage.total, 5);
  
  // Critical if damage >= 4 threshold
  assert.notEqual(result.critical, null);
  
  assert.equal(result.summary.outcome, "HIT");
  assert.equal(result.summary.isCritical, true);
});

console.log("✓ Combat calculator tests complete");
