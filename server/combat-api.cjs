/**
 * Combat API Endpoints
 * 
 * POST /api/campaigns/:id/combat/ranged-attack - Resolve ranged attack
 * POST /api/campaigns/:id/combat/close-combat - Resolve close combat attack
 * POST /api/campaigns/:id/combat/grenade - Resolve grenade throw
 * POST /api/campaigns/:id/combat/heavy-weapon - Resolve heavy weapon attack
 * POST /api/campaigns/:id/combat/vehicle-combat - Resolve vehicle combat attack
 */

const { resolveRangedAttack, resolveGrenade, resolveCloseCombat, resolveHeavyWeapon, resolveVehicleCombat } = require("./combat.cjs");
const { logRangedAttack, logHeavyWeapon, logVehicleCombat } = require("./combat-log.cjs");

/**
 * Creates combat endpoint handler
 * @param {Object} options
 * @param {DatabaseSync} options.database
 * @returns {Function} Request handler
 */
function createCombatHandler({ database }) {
  return async (request, response, campaignId, combatType) => {
    if (request.method !== "POST") {
      response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Method not allowed." }));
      return;
    }
    
    if (combatType === "ranged-attack") {
      return handleRangedAttack(request, response, campaignId, database);
    }
    
    if (combatType === "close-combat") {
      return handleCloseCombat(request, response, campaignId, database);
    }
    
    if (combatType === "grenade") {
      return handleGrenade(request, response, campaignId, database);
    }
    
    if (combatType === "heavy-weapon") {
      return handleHeavyWeapon(request, response, campaignId, database);
    }
    
    if (combatType === "vehicle-combat") {
      return handleVehicleCombat(request, response, campaignId, database);
    }
    
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Not found." }));
  };
}

/**
 * Handle ranged attack resolution
 */
async function handleRangedAttack(request, response, campaignId, database) {
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1024 * 50) { // 50KB limit
        response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Payload too large." }));
        return;
      }
    }
    
    const input = JSON.parse(body);
    
    // Validate required fields
    if (!input.weaponName || typeof input.weaponBaseDamage !== 'number' || 
        typeof input.weaponThreshold !== 'number' || !input.range) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Missing or invalid weapon data." }));
      return;
    }
    
    // Validate dice rolls
    if (!Number.isInteger(input.agilityRoll) || input.agilityRoll < 1 || input.agilityRoll > 12 ||
        !Number.isInteger(input.rangedCombatRoll) || input.rangedCombatRoll < 1 || input.rangedCombatRoll > 12) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid dice rolls. Must be integers 1-12." }));
      return;
    }
    
    // Resolve attack
    const result = resolveRangedAttack(
      {
        weaponName: input.weaponName,
        weaponBaseDamage: input.weaponBaseDamage,
        weaponThreshold: input.weaponThreshold,
        range: input.range,
        shooterAgilityDie: input.shooterAgilityDie || 'D8',
        shooterRangedCombatDie: input.shooterRangedCombatDie || 'D8',
        shooterStrengthBonus: input.shooterStrengthBonus || 10,
        targetArmorLevel: input.targetArmorLevel || 0,
        modifierDeltas: input.modifiers || [],
        ammoDieType: input.ammoDieType || 0,
        ammoAvailable: input.ammoAvailable || 0
      },
      input.agilityRoll,
      input.rangedCombatRoll,
      input.ammoRolls || []
    );
    
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(result));
    
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Handle close combat resolution
 */
async function handleCloseCombat(request, response, campaignId, database) {
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1024 * 50) {
        response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Payload too large." }));
        return;
      }
    }
    
    const input = JSON.parse(body);
    
    // Validate required fields
    if (!input.weaponName || typeof input.weaponBaseDamage !== 'number' || 
        typeof input.weaponThreshold !== 'number' ||
        !Number.isInteger(input.strengthRoll) || input.strengthRoll < 1 || input.strengthRoll > 12 ||
        !Number.isInteger(input.ccRoll) || input.ccRoll < 1 || input.ccRoll > 12) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Missing or invalid combat data." }));
      return;
    }
    
    const result = resolveCloseCombat(
      { attackerName: input.attackerName },
      input.strengthRoll,
      input.ccRoll,
      {
        name: input.weaponName,
        baseDamage: input.weaponBaseDamage,
        threshold: input.weaponThreshold
      },
      input.targetArmorLevel || 0
    );
    
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(result));
    
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Handle grenade throw resolution
 */
async function handleGrenade(request, response, campaignId, database) {
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1024 * 50) {
        response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Payload too large." }));
        return;
      }
    }
    
    const input = JSON.parse(body);
    
    // Validate required fields
    if (!input.grenadeName || !input.blastPower ||
        !Number.isInteger(input.agilityRoll) || input.agilityRoll < 1 || input.agilityRoll > 12 ||
        !Number.isInteger(input.mobilityRoll) || input.mobilityRoll < 1 || input.mobilityRoll > 12) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Missing or invalid grenade data." }));
      return;
    }
    
    const result = resolveGrenade(
      { throwerName: input.throwerName },
      input.agilityRoll,
      input.mobilityRoll,
      {
        name: input.grenadeName,
        blastPower: input.blastPower,
        threshold: input.threshold || 2,
        targetArmorLevel: input.targetArmorLevel || 0
      }
    );
    
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(result));
    
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Handle heavy weapon resolution (grenades, mines)
 */
async function handleHeavyWeapon(request, response, campaignId, database) {
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1024 * 50) {
        response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Payload too large." }));
        return;
      }
    }
    
    const input = JSON.parse(body);
    
    if (!input.weaponName || typeof input.baseDamage !== 'number' || 
        typeof input.threshold !== 'number' || !input.weaponType) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Missing or invalid weapon data." }));
      return;
    }
    
    if (!Number.isInteger(input.agilityRoll) || input.agilityRoll < 1 || input.agilityRoll > 12 ||
        !Number.isInteger(input.mobilityRoll) || input.mobilityRoll < 1 || input.mobilityRoll > 12) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid dice rolls. Must be integers 1-12." }));
      return;
    }
    
    const result = resolveHeavyWeapon(
      {
        weaponName: input.weaponName,
        baseDamage: input.baseDamage,
        threshold: input.threshold,
        weaponType: input.weaponType,
        shooterAgilityDie: input.shooterAgilityDie || "D10",
        shooterMobilityDie: input.shooterMobilityDie || "D8",
        targetArmorLevel: input.targetArmorLevel || 0
      },
      input.agilityRoll,
      input.mobilityRoll,
      input.scatterRoll || null
    );
    
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(result));
    
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Handle vehicle combat resolution
 */
async function handleVehicleCombat(request, response, campaignId, database) {
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1024 * 50) {
        response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Payload too large." }));
        return;
      }
    }
    
    const input = JSON.parse(body);
    
    if (!input.vehicleName || typeof input.vehicleStructureValue !== 'number' || 
        typeof input.weaponPenetration !== 'number' || !input.targetingType) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Missing or invalid vehicle data." }));
      return;
    }
    
    if (!Number.isInteger(input.agilityRoll) || input.agilityRoll < 1 || input.agilityRoll > 12 ||
        !Number.isInteger(input.rangedCombatRoll) || input.rangedCombatRoll < 1 || input.rangedCombatRoll > 12) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid dice rolls. Must be integers 1-12." }));
      return;
    }
    
    const result = resolveVehicleCombat(
      {
        vehicleName: input.vehicleName,
        targetingType: input.targetingType,
        vehicleStructureValue: input.vehicleStructureValue,
        weaponPenetration: input.weaponPenetration,
        shooterAgilityDie: input.shooterAgilityDie || "D10",
        shooterRangedCombatDie: input.shooterRangedCombatDie || "D8",
        range: input.range || "medium",
        modifierDeltas: input.modifierDeltas || []
      },
      input.agilityRoll,
      input.rangedCombatRoll
    );
    
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(result));
    
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

module.exports = {
  createCombatHandler
};
