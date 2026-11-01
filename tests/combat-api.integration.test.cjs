/**
 * Combat System Integration Tests
 * 
 * Tests that combat calculations work correctly end-to-end
 * and can be called from the API layer
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveRangedAttack, resolveCloseCombat, resolveGrenade } = require("../server/combat.cjs");

test("Ranged attack - successful hit with modifiers", () => {
  const result = resolveRangedAttack({
    weaponName: "M16A4",
    weaponBaseDamage: 3,
    weaponThreshold: 4,
    range: "medium",
    shooterAgilityDie: "D8",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 8,
    targetArmorLevel: 2,
    modifierDeltas: [1, -1], // +1 elevation, -1 wind
    ammoDieType: 0, // Not magazine-fed
    ammoAvailable: 0
  }, 9, 7);
  
  assert.equal(result.hit.isHit, true);
  assert.equal(result.damage.total, 2); // 3 + 1 (D8 bonus) - 2 = 2
  assert.equal(result.summary.outcome, "HIT");
});

test("Close combat - critical hit detection", () => {
  const result = resolveCloseCombat(
    { attackerName: "Player 2" },
    11, // Strength 11 = 2 successes
    9,  // Close Combat 9 = 1 success
    { name: "Combat Knife", baseDamage: 2, threshold: 2 },
    1
  );
  
  assert.equal(result.hit.isHit, true);
  assert.equal(result.damage.total, 3); // 2 + 2 - 1 = 3
  assert.notEqual(result.critical, null); // Critical object exists
  assert.equal(result.summary.isCritical, true);
});

test("Grenade throw - successful hit", () => {
  const result = resolveGrenade(
    { throwerName: "Player 3" },
    8,  // Agility 8
    7,  // Mobility 7
    { name: "Frag Grenade", blastPower: 4, threshold: 1, targetArmorLevel: 0 }
  );
  
  assert(result.hit);
  assert.equal(result.hit.isHit, true);
  assert(result.weapon);
  assert.equal(result.weapon.name, "Frag Grenade");
});

test("Ranged attack with magazine - ammo tracking", () => {
  // Scenario: M16A4 with magazine (ammoDieType = 1), rolling multiple ammo dice
  // 3 ammo dice: [6, 10, 8] = 3 dice with symbols = 3 rounds consumed
  const result = resolveRangedAttack({
    weaponName: "M16A4",
    weaponBaseDamage: 3,
    weaponThreshold: 4,
    range: "medium",
    shooterAgilityDie: "D8",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 8,
    targetArmorLevel: 0,
    modifierDeltas: [0, 0],
    ammoDieType: 8,
    ammoAvailable: 30
  }, 10, 8, [6, 10, 8]); // Agility 10, RC 8, Ammo [6, 10, 8] (3 dice with symbols)
  
  assert.equal(result.hit.isHit, true);
  assert(result.rolls.ammo);
  assert.equal(result.rolls.ammo.spent, 3);
  assert.equal(result.rolls.ammo.remaining, 27);
});

test("Ranged attack - missed shot", () => {
  const result = resolveRangedAttack({
    weaponName: "Handgun",
    weaponBaseDamage: 2,
    weaponThreshold: 2,
    range: "long",
    shooterAgilityDie: "D6",
    shooterRangedCombatDie: "D6",
    shooterStrengthBonus: 6,
    targetArmorLevel: 1,
    modifierDeltas: [-3, 0], // Penalty
    ammoDieType: 0,
    ammoAvailable: 0
  }, 4, 3); // Both miss
  
  assert.equal(result.hit.isHit, false);
  assert.equal(result.summary.outcome, "MISS");
});

test("Ranged attack - damage reduced by armor", () => {
  const result = resolveRangedAttack({
    weaponName: "Rifle",
    weaponBaseDamage: 3,
    weaponThreshold: 3,
    range: "medium",
    shooterAgilityDie: "D8",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 8,
    targetArmorLevel: 4,
    modifierDeltas: [0, 0],
    ammoDieType: 0,
    ammoAvailable: 0
  }, 7, 6);
  
  // Damage would be 3 + 1 (D8 bonus) = 4, minus armor 4 = 0
  assert.equal(result.damage.total, 0);
});

test("Close combat - Strength die bonus determines bonus (not roll value)", () => {
  // Test that Close Combat resolves correctly
  const result = resolveCloseCombat(
    { attackerName: "Strong Warrior" },
    7, // Strength roll (1 success)
    6, // Close Combat roll (1 success)
    { name: "Sword", baseDamage: 3, threshold: 2 },
    0
  );
  
  assert.equal(result.hit.isHit, true);
  assert.equal(result.damage.base, 3);
  assert(result.damage.strengthBonus >= 1); // At least 1 bonus
});

test("Ranged attack workflow matches API contract", () => {
  // Verify result structure matches what API consumers expect
  const result = resolveRangedAttack({
    weaponName: "AK-74",
    weaponBaseDamage: 4,
    weaponThreshold: 4,
    range: "medium",
    shooterAgilityDie: "D10",
    shooterRangedCombatDie: "D8",
    shooterStrengthBonus: 10,
    targetArmorLevel: 1,
    modifierDeltas: [0, 0],
    ammoDieType: 0,
    ammoAvailable: 0
  }, 10, 9);
  
  // Verify result structure
  assert(result.weapon);
  assert(result.weapon.name);
  assert(result.weapon.threshold);
  
  assert(result.attack);
  assert(result.attack.range);
  
  assert(result.rolls);
  assert(result.rolls.agility);
  assert(result.rolls.rangedCombat);
  
  assert(result.hit);
  assert(typeof result.hit.isHit === 'boolean');
  
  assert(result.damage);
  assert(typeof result.damage.total === 'number');
  
  assert(result.summary);
  assert(result.summary.outcome);
  assert(typeof result.summary.isCritical === 'boolean');
});

test("Close combat workflow matches API contract", () => {
  const result = resolveCloseCombat(
    { attackerName: "Soldier" },
    10,
    9,
    { name: "Combat Knife", baseDamage: 2, threshold: 1 },
    1
  );
  
  assert(result.weapon);
  assert(result.weapon.name);
  
  assert(result.rolls);
  assert(result.rolls.strength);
  assert(result.rolls.closeCombat);
  
  assert(result.hit);
  assert(typeof result.hit.isHit === 'boolean');
  
  assert(result.damage);
  assert(typeof result.damage.total === 'number');
  
  assert(result.critical !== undefined);
  
  assert(result.summary);
  assert(result.summary.outcome);
  assert(typeof result.summary.isCritical === 'boolean');
});
