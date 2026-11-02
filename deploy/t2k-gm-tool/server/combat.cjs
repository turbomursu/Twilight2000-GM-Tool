/**
 * T2K 4E Combat Calculator
 * 
 * Automates dice roll results calculation without generating random numbers.
 * GM rolls dice (physical or preferred method) and enters the results.
 * System calculates to-hit, damage, criticals, and other effects.
 */

/**
 * Dice roll representation
 * @typedef {Object} DiceRoll
 * @property {number} value - Result on the die (1-12)
 * @property {boolean} isSuccess - Whether this die scored 6+ (true/false)
 * @property {boolean} isDouble - Whether this is 10+ (2 successes, ©©)
 * @property {boolean} isSymbol - Whether this is a symbol (©)
 */

/**
 * Ranged combat attack input
 * @typedef {Object} RangedAttackInput
 * @property {string} weaponId - Weapon identifier
 * @property {string} weaponName - Display name
 * @property {number} weaponBaseDamage - Base damage value
 * @property {number} weaponThreshold - Damage threshold for criticals
 * @property {string} range - Range: 'short', 'medium', 'long', 'extreme'
 * @property {number} shooterAgilityDie - D6, D8, D10, or D12
 * @property {number} shooterRangedCombatDie - D6, D8, D10, or D12
 * @property {number[]} modifierDeltas - Array of modifier changes (+1, -1, etc)
 * @property {number} shooterStrengthBonus - STR die as a number (6, 8, 10, 12)
 * @property {number} targetArmorLevel - Armor reduction value (0-4)
 * @property {number} ammoDieType - For magazine weapons: D6, D8, D10, D12, or 0 for none
 * @property {number} ammoAvailable - Rounds remaining in magazine
 */

/**
 * Parses a die size notation (D6, D8, D10, D12) to numeric value
 * @param {string|number} die - Die notation like "D10" or 10
 * @returns {number} 6, 8, 10, or 12
 */
function parseDie(die) {
  if (typeof die === 'number') return die;
  const match = String(die).toUpperCase().match(/D(\d+)/);
  if (!match) throw new Error(`Invalid die notation: ${die}`);
  const size = Number(match[1]);
  if (![6, 8, 10, 12].includes(size)) throw new Error(`Invalid die size: ${size}`);
  return size;
}

/**
 * Calculates success count from a single die roll
 * @param {number} rollValue - Die result (1-12)
 * @returns {{ successes: number, isSymbol: boolean }}
 */
function calculateSuccesses(rollValue) {
  if (rollValue < 1 || rollValue > 12) {
    throw new Error(`Invalid roll value: ${rollValue}`);
  }
  
  if (rollValue < 6) return { successes: 0, isSymbol: false };
  if (rollValue < 10) return { successes: 1, isSymbol: true };
  return { successes: 2, isSymbol: true }; // 10+ = 2 successes
}

/**
 * Validates ranged attack input
 * @param {RangedAttackInput} input
 * @returns {string[]} Array of validation errors (empty if valid)
 */
function validateRangedAttackInput(input) {
  const errors = [];
  
  if (!input.weaponName) errors.push('Weapon name required');
  if (typeof input.weaponBaseDamage !== 'number' || input.weaponBaseDamage < 0) {
    errors.push('Weapon base damage must be a non-negative number');
  }
  if (typeof input.weaponThreshold !== 'number' || input.weaponThreshold < 1) {
    errors.push('Weapon threshold must be a positive number');
  }
  if (!['short', 'medium', 'long', 'extreme'].includes(input.range)) {
    errors.push('Range must be short/medium/long/extreme');
  }
  
  try {
    parseDie(input.shooterAgilityDie);
  } catch (e) {
    errors.push(`Invalid agility die: ${e.message}`);
  }
  
  try {
    parseDie(input.shooterRangedCombatDie);
  } catch (e) {
    errors.push(`Invalid ranged combat die: ${e.message}`);
  }
  
  if (typeof input.shooterStrengthBonus !== 'number') {
    errors.push('Shooter strength bonus must be a number');
  }
  
  if (typeof input.targetArmorLevel !== 'number' || input.targetArmorLevel < 0 || input.targetArmorLevel > 4) {
    errors.push('Target armor level must be 0-4');
  }
  
  if (!Array.isArray(input.modifierDeltas)) {
    errors.push('Modifier deltas must be an array');
  }
  
  if (typeof input.ammoAvailable !== 'number' || input.ammoAvailable < 0) {
    errors.push('Ammo available must be a non-negative number');
  }
  
  return errors;
}

/**
 * Applies range modifier based on distance
 * @param {string} range - 'short', 'medium', 'long', 'extreme'
 * @returns {number} Modifier value
 */
function getRangeModifier(range) {
  const modifiers = {
    short: 0,
    medium: -1,
    long: -2,
    extreme: -3
  };
  return modifiers[range] || 0;
}

/**
 * Calculates total to-hit modifier
 * @param {RangedAttackInput} input
 * @returns {{ modifier: number, breakdown: Object }}
 */
function calculateToHitModifier(input) {
  const breakdown = {};
  let modifier = 0;
  
  // Range modifier
  const rangeModifier = getRangeModifier(input.range);
  if (rangeModifier !== 0) {
    breakdown.range = rangeModifier;
    modifier += rangeModifier;
  }
  
  // Other modifiers from input array
  if (input.modifierDeltas && input.modifierDeltas.length > 0) {
    const customMods = input.modifierDeltas.reduce((a, b) => a + b, 0);
    if (customMods !== 0) {
      breakdown.custom = customMods;
      modifier += customMods;
    }
  }
  
  return { modifier, breakdown };
}

/**
 * Resolves a single ranged attack
 * @param {RangedAttackInput} input - Attack parameters
 * @param {number} agilityRoll - Result on agility die (1-12)
 * @param {number} rangedCombatRoll - Result on ranged combat die (1-12)
 * @param {number[]} ammoRolls - Results on ammo dice (if magazine weapon)
 * @returns {Object} Complete attack resolution
 */
function resolveRangedAttack(input, agilityRoll, rangedCombatRoll, ammoRolls = []) {
  // Validate input
  const validationErrors = validateRangedAttackInput(input);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid ranged attack input: ${validationErrors.join('; ')}`);
  }
  
  // Validate die rolls
  if (!Number.isInteger(agilityRoll) || agilityRoll < 1 || agilityRoll > 12) {
    throw new Error(`Invalid agility roll: ${agilityRoll}`);
  }
  if (!Number.isInteger(rangedCombatRoll) || rangedCombatRoll < 1 || rangedCombatRoll > 12) {
    throw new Error(`Invalid ranged combat roll: ${rangedCombatRoll}`);
  }
  
  // Validate ammo rolls if present
  if (input.ammoDieType > 0) {
    if (!Array.isArray(ammoRolls) || ammoRolls.length === 0) {
      throw new Error('Ammo rolls required for magazine-fed weapon');
    }
    ammoRolls.forEach((roll, idx) => {
      if (!Number.isInteger(roll) || roll < 1 || roll > 12) {
        throw new Error(`Invalid ammo roll ${idx}: ${roll}`);
      }
    });
    
    // Validate ammo consumption
    const ammoSpent = ammoRolls.filter(r => r === 1 || r === 2 || r === 3).length; // Count symbols
    if (ammoSpent > input.ammoAvailable) {
      throw new Error(`Not enough ammo: need ${ammoSpent}, have ${input.ammoAvailable}`);
    }
  }
  
  // Calculate individual die successes
  const agilityResult = calculateSuccesses(agilityRoll);
  const rcResult = calculateSuccesses(rangedCombatRoll);
  
  // Calculate ammo results and consumption
  let ammoResult = { successes: 0, diceCount: 0, spent: 0, symbols: 0 };
  if (input.ammoDieType > 0 && ammoRolls.length > 0) {
    ammoResult.diceCount = ammoRolls.length;
    const ammoResultsArray = ammoRolls.map(calculateSuccesses);
    ammoResult.successes = ammoResultsArray.reduce((sum, r) => sum + r.successes, 0);
    ammoResult.symbols = ammoResultsArray.filter(r => r.isSymbol).length;
    ammoResult.spent = ammoResult.symbols; // Symbols (©) = ammo spent
  }
  
  // Calculate to-hit modifier
  const { modifier, breakdown } = calculateToHitModifier(input);
  
  // Determine hit/miss - apply modifiers to determine success
  const totalAgilityResult = agilityRoll + modifier;
  const totalRCResult = rangedCombatRoll + modifier;
  
  const isAgilitySuccess = totalAgilityResult >= 6;
  const isRCSuccess = totalRCResult >= 6;
  const isHit = isAgilitySuccess || isRCSuccess;
  
  // Check for weapon jam on die value (symbol = ©)
  // Applies only to magazine-fed weapons
  // Single © on weapon die (roll 6-9) = -1 reliability
  // 2+ © on weapon die (roll 10+) = jam (failure)
  let weaponJam = 0;
  if (input.ammoDieType > 0) {
    // Only magazine-fed weapons can jam
    if (agilityRoll >= 10) {
      weaponJam = 2; // Multiple symbols = jam
    } else if (agilityRoll >= 6 && agilityRoll < 10) {
      weaponJam = 1; // Single symbol = -1 reliability
    }
  }
  
  let damageResult = null;
  let criticalHit = false;
  let hitLocation = null;
  
  if (isHit && weaponJam !== 2) {
    // Roll hit location (1D6)
    // Note: We don't generate this, but document it for GM
    
    // Calculate damage
    const baseDamage = input.weaponBaseDamage;
    const strengthModifier = (input.shooterStrengthBonus === 6) ? 1 :
                            (input.shooterStrengthBonus === 8) ? 1 :
                            (input.shooterStrengthBonus === 10) ? 2 :
                            (input.shooterStrengthBonus === 12) ? 2 : 0;
    
    const totalDamage = baseDamage + strengthModifier - input.targetArmorLevel;
    const finalDamage = Math.max(0, totalDamage); // Damage floor at 0
    
    damageResult = {
      base: baseDamage,
      strengthBonus: strengthModifier,
      armor: input.targetArmorLevel,
      total: finalDamage
    };
    
    // Determine if critical hit
    criticalHit = finalDamage >= input.weaponThreshold;
  }
  
  return {
    weapon: {
      name: input.weaponName,
      baseDamage: input.weaponBaseDamage,
      threshold: input.weaponThreshold
    },
    attack: {
      range: input.range,
      modifierBreakdown: breakdown,
      totalModifier: modifier
    },
    rolls: {
      agility: {
        rolled: agilityRoll,
        successes: agilityResult.successes,
        isSymbol: agilityResult.isSymbol,
        modifiedTotal: totalAgilityResult,
        isSuccess: isAgilitySuccess
      },
      rangedCombat: {
        rolled: rangedCombatRoll,
        successes: rcResult.successes,
        isSymbol: rcResult.isSymbol,
        modifiedTotal: totalRCResult,
        isSuccess: isRCSuccess
      },
      ammo: input.ammoDieType > 0 ? {
        diceCount: ammoResult.diceCount,
        successes: ammoResult.successes,
        spent: ammoResult.spent,
        remaining: input.ammoAvailable - ammoResult.spent
      } : null
    },
    hit: {
      isHit,
      weaponJam,
      hitLocation: isHit && weaponJam !== 2 ? 'GM rolls 1D6 for location' : null
    },
    damage: damageResult,
    critical: criticalHit ? {
      threshold: input.weaponThreshold,
      damageDealt: damageResult.total,
      rollRequired: 'GM rolls critical table'
    } : null,
    summary: {
      outcome: weaponJam === 2 ? 'WEAPON JAM' : (isHit ? 'HIT' : 'MISS'),
      damageIfApplies: isHit && damageResult && weaponJam !== 2 ? damageResult.total : 0,
      isCritical: criticalHit,
      ammoRemaining: input.ammoDieType > 0 ? (input.ammoAvailable - ammoResult.spent) : null
    }
  };
}

/**
 * Resolves a grenade throw (AGI + Mobility)
 * @param {Object} input
 * @param {number} agilityRoll - Result on agility die
 * @param {number} mobilityRoll - Result on mobility die
 * @param {Object} grenade - { name, blastPower, threshold, targetArmorLevel }
 * @returns {Object} Throw resolution
 */
function resolveGrenade(input, agilityRoll, mobilityRoll, grenade) {
  if (!Number.isInteger(agilityRoll) || agilityRoll < 1 || agilityRoll > 12) {
    throw new Error(`Invalid agility roll: ${agilityRoll}`);
  }
  if (!Number.isInteger(mobilityRoll) || mobilityRoll < 1 || mobilityRoll > 12) {
    throw new Error(`Invalid mobility roll: ${mobilityRoll}`);
  }
  
  const agilityResult = calculateSuccesses(agilityRoll);
  const mobilityResult = calculateSuccesses(mobilityRoll);
  
  const isHit = agilityResult.successes > 0 || mobilityResult.successes > 0;
  
  return {
    weapon: {
      name: grenade.name,
      blastPower: grenade.blastPower,
      threshold: grenade.threshold,
      range: 'short (1 hex)'
    },
    rolls: {
      agility: {
        rolled: agilityRoll,
        successes: agilityResult.successes,
        isSymbol: agilityResult.isSymbol,
        isSuccess: agilityResult.successes > 0
      },
      mobility: {
        rolled: mobilityRoll,
        successes: mobilityResult.successes,
        isSymbol: mobilityResult.isSymbol,
        isSuccess: mobilityResult.successes > 0
      }
    },
    hit: {
      isHit,
      location: isHit ? 'Blast in target hex' : 'Deviation roll required'
    },
    blast: {
      power: grenade.blastPower,
      affectedHexes: isHit ? 'Target hex + adjacent' : 'See deviation',
      targetArmorLevel: grenade.targetArmorLevel
    },
    summary: {
      outcome: isHit ? 'HIT' : 'MISS'
    }
  };
}

/**
 * Calculates close combat attack
 * @param {Object} input
 * @param {number} strengthRoll - Result on strength die
 * @param {number} ccRoll - Result on close combat die
 * @param {Object} weapon - { name, baseDamage, threshold }
 * @param {number} targetArmorLevel - Armor reduction
 * @returns {Object} Attack resolution
 */
function resolveCloseCombat(input, strengthRoll, ccRoll, weapon, targetArmorLevel) {
  if (!Number.isInteger(strengthRoll) || strengthRoll < 1 || strengthRoll > 12) {
    throw new Error(`Invalid strength roll: ${strengthRoll}`);
  }
  if (!Number.isInteger(ccRoll) || ccRoll < 1 || ccRoll > 12) {
    throw new Error(`Invalid close combat roll: ${ccRoll}`);
  }
  
  const strengthResult = calculateSuccesses(strengthRoll);
  const ccResult = calculateSuccesses(ccRoll);
  
  const isHit = strengthResult.successes > 0 || ccResult.successes > 0;
  
  let damageResult = null;
  let criticalHit = false;
  
  if (isHit) {
    // Damage: weapon base + STR modifier - Armor
    // STR modifier: D6→1, D8→1, D10→2, D12→2 (not rolled, structural bonus)
    const strBonus = strengthRoll <= 8 ? 1 : 2;
    const totalDamage = weapon.baseDamage + strBonus - targetArmorLevel;
    const finalDamage = Math.max(0, totalDamage);
    
    damageResult = {
      base: weapon.baseDamage,
      strengthBonus: strBonus,
      armor: targetArmorLevel,
      total: finalDamage
    };
    
    criticalHit = finalDamage >= weapon.threshold;
  }
  
  return {
    weapon: {
      name: weapon.name,
      baseDamage: weapon.baseDamage,
      threshold: weapon.threshold
    },
    rolls: {
      strength: {
        rolled: strengthRoll,
        successes: strengthResult.successes,
        isSymbol: strengthResult.isSymbol,
        isSuccess: strengthResult.successes > 0
      },
      closeCombat: {
        rolled: ccRoll,
        successes: ccResult.successes,
        isSymbol: ccResult.isSymbol,
        isSuccess: ccResult.successes > 0
      }
    },
    hit: {
      isHit,
      hitLocation: isHit ? 'GM rolls 1D6 for location' : null
    },
    damage: damageResult,
    critical: criticalHit ? {
      threshold: weapon.threshold,
      damageDealt: damageResult.total,
      rollRequired: 'GM rolls critical table'
    } : null,
    summary: {
      outcome: isHit ? 'HIT' : 'MISS',
      damageIfApplies: isHit && damageResult ? damageResult.total : 0,
      isCritical: criticalHit
    }
  };
}

/**
 * Validates heavy weapon input
 * @param {Object} input
 * @returns {string[]} Array of validation errors (empty if valid)
 */
function validateHeavyWeaponInput(input) {
  const errors = [];
  
  if (!input.weaponName) errors.push('Weapon name required');
  if (typeof input.baseDamage !== 'number' || input.baseDamage < 0) {
    errors.push('Base damage must be a non-negative number');
  }
  if (typeof input.threshold !== 'number' || input.threshold < 1) {
    errors.push('Threshold must be a positive number');
  }
  if (!['grenade-frag', 'grenade-shaped', 'mine-anti-personnel', 'mine-anti-vehicle'].includes(input.weaponType)) {
    errors.push('Weapon type must be grenade-frag, grenade-shaped, mine-anti-personnel, or mine-anti-vehicle');
  }
  
  return errors;
}

/**
 * Resolves heavy weapon attack with blast mechanics
 * Grenades: Agility + Mobility, blast affects primary + adjacent hexes
 * Mines: Direct hit check, larger blast radius
 * 
 * @param {Object} input
 * @param {string} input.weaponName - Grenade or mine name
 * @param {number} input.baseDamage - Base blast damage
 * @param {number} input.threshold - Damage threshold for criticals
 * @param {string} input.weaponType - 'grenade-frag', 'grenade-shaped', 'mine-anti-personnel', 'mine-anti-vehicle'
 * @param {number} input.shooterAgilityDie - D6-D12
 * @param {number} input.shooterMobilityDie - D6-D12
 * @param {number} input.targetArmorLevel - 0-4
 * @param {number} agilityRoll - Roll result 1-12
 * @param {number} mobilityRoll - Roll result 1-12
 * @param {number} scatterRoll - Roll result 1-6 for missed grenades (if needed)
 * @returns {Object} Heavy weapon resolution
 */
function resolveHeavyWeapon(input, agilityRoll, mobilityRoll, scatterRoll = null) {
  const validationErrors = validateHeavyWeaponInput(input);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid heavy weapon input: ${validationErrors.join('; ')}`);
  }
  
  if (!Number.isInteger(agilityRoll) || agilityRoll < 1 || agilityRoll > 12) {
    throw new Error(`Invalid agility roll: ${agilityRoll}`);
  }
  if (!Number.isInteger(mobilityRoll) || mobilityRoll < 1 || mobilityRoll > 12) {
    throw new Error(`Invalid mobility roll: ${mobilityRoll}`);
  }
  
  const agilityResult = calculateSuccesses(agilityRoll);
  const mobilityResult = calculateSuccesses(mobilityRoll);
  
  const isHit = agilityResult.successes > 0 || mobilityResult.successes > 0;
  const isGrenade = input.weaponType.startsWith('grenade-');
  const isMine = input.weaponType.startsWith('mine-');
  const isShaped = input.weaponType === 'grenade-shaped' || input.weaponType === 'mine-anti-vehicle';
  
  // Blast mechanics calculation
  let blastResult = {
    primaryHexDamage: 0,
    adjacentHexDamage: 0,
    affectedHexes: 0,
    damageType: isShaped ? 'shaped-charge' : 'fragments',
    scatterDistance: null,
    scatterDirection: null
  };
  
  if (isHit) {
    // Primary target always takes damage
    const baseDamage = input.baseDamage;
    const armorReduction = isShaped ? input.targetArmorLevel * 2 : input.targetArmorLevel;
    const primaryDamage = Math.max(0, baseDamage - armorReduction);
    
    blastResult.primaryHexDamage = primaryDamage;
    blastResult.affectedHexes = 1;
    
    // Adjacent hexes take reduced damage (grenades only, not mines or shaped charges)
    if (isGrenade && !isShaped) {
      const adjacentDamage = Math.max(0, Math.floor(primaryDamage / 2));
      blastResult.adjacentHexDamage = adjacentDamage;
      blastResult.affectedHexes = 7; // Primary + 6 adjacent hexes
    }
    
    const isCritical = primaryDamage >= input.threshold;
    
    return {
      weapon: {
        name: input.weaponName,
        type: input.weaponType,
        baseDamage: input.baseDamage,
        threshold: input.threshold,
        damageType: isShaped ? 'shaped-charge' : 'fragments'
      },
      rolls: {
        agility: {
          rolled: agilityRoll,
          successes: agilityResult.successes,
          isSymbol: agilityResult.isSymbol,
          isSuccess: agilityResult.successes > 0
        },
        mobility: {
          rolled: mobilityRoll,
          successes: mobilityResult.successes,
          isSymbol: mobilityResult.isSymbol,
          isSuccess: mobilityResult.successes > 0
        }
      },
      hit: {
        isHit: true,
        location: 'Direct hit on target hex'
      },
      blast: blastResult,
      damage: {
        primaryHex: {
          base: input.baseDamage,
          armor: isShaped ? input.targetArmorLevel * 2 : input.targetArmorLevel,
          total: primaryDamage
        },
        adjacentHex: isShaped ? null : {
          base: Math.floor(input.baseDamage / 2),
          armor: input.targetArmorLevel,
          total: blastResult.adjacentHexDamage
        }
      },
      critical: isCritical ? {
        threshold: input.threshold,
        damageDealt: primaryDamage,
        description: 'Detonation critical: maximum effect'
      } : null,
      summary: {
        outcome: 'HIT',
        primaryDamage,
        adjacentDamage: isShaped ? 0 : blastResult.adjacentHexDamage,
        hexesAffected: blastResult.affectedHexes,
        isCritical,
        damageType: isShaped ? 'shaped-charge (armor×2)' : 'fragments'
      }
    };
  } else {
    // Missed - calculate scatter for grenades
    let scatterInfo = null;
    if (isGrenade && scatterRoll !== null) {
      if (!Number.isInteger(scatterRoll) || scatterRoll < 1 || scatterRoll > 6) {
        throw new Error(`Invalid scatter roll: ${scatterRoll}`);
      }
      scatterInfo = {
        roll: scatterRoll,
        direction: ['North', 'Northeast', 'Southeast', 'South', 'Southwest', 'Northwest'][scatterRoll - 1],
        hexesDeviated: Math.floor(Math.random() * 3) + 1 // GM determines actual deviation
      };
    }
    
    return {
      weapon: {
        name: input.weaponName,
        type: input.weaponType,
        baseDamage: input.baseDamage,
        threshold: input.threshold,
        damageType: isShaped ? 'shaped-charge' : 'fragments'
      },
      rolls: {
        agility: {
          rolled: agilityRoll,
          successes: agilityResult.successes,
          isSymbol: agilityResult.isSymbol,
          isSuccess: agilityResult.successes > 0
        },
        mobility: {
          rolled: mobilityRoll,
          successes: mobilityResult.successes,
          isSymbol: mobilityResult.isSymbol,
          isSuccess: mobilityResult.successes > 0
        }
      },
      hit: {
        isHit: false,
        location: isGrenade ? 'Missed - see scatter' : 'Missed trigger or proximity'
      },
      scatter: scatterInfo,
      blast: {
        primaryHexDamage: 0,
        adjacentHexDamage: 0,
        affectedHexes: 0,
        scatterDistance: scatterInfo ? 'GM determines' : null,
        scatterDirection: scatterInfo ? scatterInfo.direction : null
      },
      summary: {
        outcome: 'MISS',
        scatterNeeded: isGrenade,
        description: isGrenade 
          ? 'Grenade missed target - roll scatter to determine impact location' 
          : 'Mine trigger not activated or proximity failure'
      }
    };
  }
}

/**
 * Validates vehicle combat input
 * @param {Object} input
 * @returns {string[]} Array of validation errors (empty if valid)
 */
function validateVehicleCombatInput(input) {
  const errors = [];
  
  if (!input.vehicleName) errors.push('Vehicle name required');
  if (!['standard', 'vulnerable'].includes(input.targetingType)) {
    errors.push('Targeting type must be standard or vulnerable');
  }
  if (typeof input.vehicleStructureValue !== 'number' || input.vehicleStructureValue < 1) {
    errors.push('Vehicle structure value must be a positive number');
  }
  if (typeof input.weaponPenetration !== 'number' || input.weaponPenetration < 0) {
    errors.push('Weapon penetration must be a non-negative number');
  }
  if (typeof input.shooterAgilityDie !== 'number' && typeof input.shooterAgilityDie !== 'string') {
    errors.push('Shooter agility die required');
  }
  if (typeof input.shooterRangedCombatDie !== 'number' && typeof input.shooterRangedCombatDie !== 'string') {
    errors.push('Shooter ranged combat die required');
  }
  
  return errors;
}

/**
 * Resolves vehicle combat attack with armor and damage effects
 * 
 * @param {Object} input
 * @param {string} input.vehicleName - Target vehicle name
 * @param {string} input.targetingType - 'standard' or 'vulnerable' spot
 * @param {number} input.vehicleStructureValue - Vehicle armor rating
 * @param {number} input.weaponPenetration - Weapon armor penetration rating
 * @param {string} input.shooterAgilityDie - D6-D12
 * @param {string} input.shooterRangedCombatDie - D6-D12
 * @param {string} input.range - 'short', 'medium', 'long', 'extreme'
 * @param {number[]} input.modifierDeltas - Array of modifier adjustments
 * @param {number} agilityRoll - Roll result 1-12
 * @param {number} rangedCombatRoll - Roll result 1-12
 * @returns {Object} Vehicle combat resolution
 */
function resolveVehicleCombat(input, agilityRoll, rangedCombatRoll) {
  const validationErrors = validateVehicleCombatInput(input);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid vehicle combat input: ${validationErrors.join('; ')}`);
  }
  
  if (!Number.isInteger(agilityRoll) || agilityRoll < 1 || agilityRoll > 12) {
    throw new Error(`Invalid agility roll: ${agilityRoll}`);
  }
  if (!Number.isInteger(rangedCombatRoll) || rangedCombatRoll < 1 || rangedCombatRoll > 12) {
    throw new Error(`Invalid ranged combat roll: ${rangedCombatRoll}`);
  }
  
  const agilityResult = calculateSuccesses(agilityRoll);
  const rcResult = calculateSuccesses(rangedCombatRoll);
  
  // Calculate to-hit modifier
  const { modifier, breakdown } = calculateToHitModifier({
    range: input.range,
    modifierDeltas: input.modifierDeltas || []
  });
  
  const totalAgilityResult = agilityRoll + modifier;
  const totalRCResult = rangedCombatRoll + modifier;
  
  const isAgilitySuccess = totalAgilityResult >= 6;
  const isRCSuccess = totalRCResult >= 6;
  const isHit = isAgilitySuccess || isRCSuccess;
  
  let damageResult = null;
  let armorPenetration = false;
  let vehicleEffect = null;
  
  if (isHit) {
    // Vehicle armor calculation
    // Vulnerable spots: -1 difficulty, weapon penetration counts double
    const effectivePenetration = input.targetingType === 'vulnerable' 
      ? input.weaponPenetration * 2 
      : input.weaponPenetration;
    
    armorPenetration = effectivePenetration > input.vehicleStructureValue;
    
    // Determine damage effect based on penetration
    if (armorPenetration) {
      const penetrationMargin = effectivePenetration - input.vehicleStructureValue;
      
      if (penetrationMargin >= 3) {
        vehicleEffect = 'destroyed';
      } else if (penetrationMargin >= 1) {
        vehicleEffect = 'immobilized';
      } else {
        vehicleEffect = 'damaged';
      }
    } else {
      vehicleEffect = 'glanced-off';
    }
    
    damageResult = {
      weaponPenetration: input.weaponPenetration,
      vehicleStructure: input.vehicleStructureValue,
      effectivePenetration: effectivePenetration,
      armorPenetrated: armorPenetration,
      penetrationMargin: armorPenetration ? effectivePenetration - input.vehicleStructureValue : 0
    };
  }
  
  return {
    vehicle: {
      name: input.vehicleName,
      structureValue: input.vehicleStructureValue,
      targetingType: input.targetingType
    },
    attack: {
      range: input.range,
      modifierBreakdown: breakdown,
      totalModifier: modifier
    },
    rolls: {
      agility: {
        rolled: agilityRoll,
        successes: agilityResult.successes,
        isSymbol: agilityResult.isSymbol,
        modifiedTotal: totalAgilityResult,
        isSuccess: isAgilitySuccess
      },
      rangedCombat: {
        rolled: rangedCombatRoll,
        successes: rcResult.successes,
        isSymbol: rcResult.isSymbol,
        modifiedTotal: totalRCResult,
        isSuccess: isRCSuccess
      }
    },
    hit: {
      isHit,
      targetType: input.targetingType
    },
    damage: damageResult,
    effect: vehicleEffect ? {
      outcome: vehicleEffect,
      description: vehicleEffect === 'destroyed' 
        ? 'Vehicle is destroyed - non-functional'
        : vehicleEffect === 'immobilized'
        ? 'Vehicle is immobilized - cannot move'
        : vehicleEffect === 'damaged'
        ? 'Vehicle suffers damage - operational but degraded'
        : 'Armor withstands impact - vehicle operational'
    } : null,
    summary: {
      outcome: isHit ? 'HIT' : 'MISS',
      vehicleEffect: vehicleEffect || 'no-effect',
      armorPenetrated: armorPenetration,
      description: isHit 
        ? `Hit on ${input.targetingType} spot - vehicle ${vehicleEffect}`
        : 'Missed vehicle target'
    }
  };
}

module.exports = {
  parseDie,
  calculateSuccesses,
  validateRangedAttackInput,
  getRangeModifier,
  calculateToHitModifier,
  resolveRangedAttack,
  resolveGrenade,
  resolveCloseCombat,
  validateHeavyWeaponInput,
  resolveHeavyWeapon,
  validateVehicleCombatInput,
  resolveVehicleCombat
};
