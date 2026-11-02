/**
 * Combat Result Logging Module
 * 
 * Records combat results in campaign audit log and operational history.
 * Tracks attacker, target, weapon, rolls, damage, and outcomes.
 */

const { randomUUID } = require("node:crypto");

/**
 * Creates a combat log entry for ranged attacks
 * @param {Object} options
 * @param {DatabaseSync} options.database
 * @param {string} options.campaignId
 * @param {string} options.characterId - Attacker character ID
 * @param {string} options.characterLabel - Attacker name for audit
 * @param {string} options.accountId - Acting GM account ID
 * @param {Object} options.attackResult - Result from resolveRangedAttack()
 * @param {string} options.targetLabel - Target description
 * @param {Object} options.campaignState - Current campaign state (date, time, etc)
 * @returns {string} Log entry ID
 */
function logRangedAttack(options) {
  const {
    database,
    campaignId,
    characterId,
    characterLabel,
    accountId,
    attackResult,
    targetLabel,
    campaignState
  } = options;
  
  const entryId = randomUUID();
  const timestamp = new Date().toISOString();
  
  // Create audit log entry
  const auditData = {
    actor_account_id: accountId,
    actor_label: characterLabel,
    action: "combat.ranged-attack",
    target_type: "combat_log_entry",
    target_id: entryId,
    target_label: `${characterLabel} → ${targetLabel}`,
    character_id: characterId,
    campaign_revision_before: campaignState?.revision || 0,
    campaign_revision_after: campaignState?.revision || 0,
    game_date: campaignState?.gameDate || null,
    game_time: campaignState?.gameTime || null
  };
  
  // Store full combat result in combat log
  const combatEntry = {
    id: entryId,
    campaign_id: campaignId,
    combat_type: 'ranged-attack',
    attacker_character_id: characterId,
    attacker_label: characterLabel,
    target_label: targetLabel,
    weapon_name: attackResult.weapon.name,
    weapon_base_damage: attackResult.weapon.baseDamage,
    range: attackResult.attack.range,
    rolls_json: JSON.stringify(attackResult.rolls),
    to_hit_modifier: attackResult.attack.totalModifier,
    is_hit: attackResult.hit.isHit,
    damage_total: attackResult.damage?.total || 0,
    is_critical: attackResult.critical ? true : false,
    weapon_jam: attackResult.hit.weaponJam || 0,
    ammo_spent: attackResult.rolls.ammo?.spent || 0,
    ammo_remaining: attackResult.rolls.ammo?.remaining || null,
    outcome_json: JSON.stringify({
      outcome: attackResult.summary.outcome,
      damageIfApplies: attackResult.summary.damageIfApplies,
      isCritical: attackResult.summary.isCritical,
      ammoRemaining: attackResult.summary.ammoRemaining
    }),
    created_at: timestamp,
    game_date: campaignState?.gameDate || null,
    game_time: campaignState?.gameTime || null
  };
  
  try {
    // Record in combat log table (create if needed)
    database.exec(`
      CREATE TABLE IF NOT EXISTS combat_log (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        combat_type TEXT NOT NULL,
        attacker_character_id TEXT,
        attacker_label TEXT NOT NULL,
        target_label TEXT NOT NULL,
        weapon_name TEXT NOT NULL,
        weapon_base_damage INTEGER,
        range TEXT,
        rolls_json TEXT,
        to_hit_modifier INTEGER,
        is_hit INTEGER,
        damage_total INTEGER,
        is_critical INTEGER,
        weapon_jam INTEGER,
        ammo_spent INTEGER,
        ammo_remaining INTEGER,
        outcome_json TEXT,
        created_at TEXT NOT NULL,
        game_date TEXT,
        game_time TEXT,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
      )
    `);
    
    const stmt = database.prepare(`
      INSERT INTO combat_log (
        id, campaign_id, combat_type, attacker_character_id, attacker_label,
        target_label, weapon_name, weapon_base_damage, range, rolls_json,
        to_hit_modifier, is_hit, damage_total, is_critical, weapon_jam,
        ammo_spent, ammo_remaining, outcome_json, created_at, game_date, game_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      combatEntry.id,
      combatEntry.campaign_id,
      combatEntry.combat_type,
      combatEntry.attacker_character_id,
      combatEntry.attacker_label,
      combatEntry.target_label,
      combatEntry.weapon_name,
      combatEntry.weapon_base_damage,
      combatEntry.range,
      combatEntry.rolls_json,
      combatEntry.to_hit_modifier,
      combatEntry.is_hit ? 1 : 0,
      combatEntry.damage_total,
      combatEntry.is_critical ? 1 : 0,
      combatEntry.weapon_jam,
      combatEntry.ammo_spent,
      combatEntry.ammo_remaining,
      combatEntry.outcome_json,
      combatEntry.created_at,
      combatEntry.game_date,
      combatEntry.game_time
    );
    
    return entryId;
  } catch (error) {
    console.error('Failed to log ranged attack:', error);
    throw error;
  }
}

/**
 * Creates a combat log entry for heavy weapon attacks
 * @param {Object} options
 * @param {DatabaseSync} options.database
 * @param {string} options.campaignId
 * @param {string} options.characterId - Attacker character ID
 * @param {string} options.characterLabel - Attacker name
 * @param {string} options.accountId - Acting GM account ID
 * @param {Object} options.attackResult - Result from resolveHeavyWeapon()
 * @param {string} options.targetLabel - Target description
 * @param {Object} options.campaignState - Current campaign state
 * @returns {string} Log entry ID
 */
function logHeavyWeapon(options) {
  const {
    database,
    campaignId,
    characterId,
    characterLabel,
    accountId,
    attackResult,
    targetLabel,
    campaignState
  } = options;
  
  const entryId = randomUUID();
  const timestamp = new Date().toISOString();
  
  const combatEntry = {
    id: entryId,
    campaign_id: campaignId,
    combat_type: `heavy-weapon-${attackResult.weapon.type}`,
    attacker_character_id: characterId,
    attacker_label: characterLabel,
    target_label: targetLabel,
    weapon_name: attackResult.weapon.name,
    weapon_base_damage: attackResult.weapon.baseDamage,
    range: 'short',
    rolls_json: JSON.stringify(attackResult.rolls),
    to_hit_modifier: 0,
    is_hit: attackResult.hit.isHit,
    damage_total: attackResult.damage?.primaryHex?.total || 0,
    is_critical: attackResult.critical ? true : false,
    blast_power: attackResult.blast.primaryHexDamage,
    blast_affected_hexes: attackResult.blast.affectedHexes,
    damage_type: attackResult.weapon.damageType,
    outcome_json: JSON.stringify({
      outcome: attackResult.summary.outcome,
      primaryDamage: attackResult.summary.primaryDamage,
      adjacentDamage: attackResult.summary.adjacentDamage,
      hexesAffected: attackResult.summary.hexesAffected,
      damageType: attackResult.summary.damageType
    }),
    created_at: timestamp,
    game_date: campaignState?.gameDate || null,
    game_time: campaignState?.gameTime || null
  };
  
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS combat_log (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        combat_type TEXT NOT NULL,
        attacker_character_id TEXT,
        attacker_label TEXT NOT NULL,
        target_label TEXT NOT NULL,
        weapon_name TEXT NOT NULL,
        weapon_base_damage INTEGER,
        range TEXT,
        rolls_json TEXT,
        to_hit_modifier INTEGER,
        is_hit INTEGER,
        damage_total INTEGER,
        is_critical INTEGER,
        blast_power INTEGER,
        blast_affected_hexes INTEGER,
        damage_type TEXT,
        outcome_json TEXT,
        created_at TEXT NOT NULL,
        game_date TEXT,
        game_time TEXT,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
      )
    `);
    
    const stmt = database.prepare(`
      INSERT INTO combat_log (
        id, campaign_id, combat_type, attacker_character_id, attacker_label,
        target_label, weapon_name, weapon_base_damage, range, rolls_json,
        to_hit_modifier, is_hit, damage_total, is_critical, blast_power,
        blast_affected_hexes, damage_type, outcome_json, created_at, game_date, game_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      combatEntry.id,
      combatEntry.campaign_id,
      combatEntry.combat_type,
      combatEntry.attacker_character_id,
      combatEntry.attacker_label,
      combatEntry.target_label,
      combatEntry.weapon_name,
      combatEntry.weapon_base_damage,
      combatEntry.range,
      combatEntry.rolls_json,
      combatEntry.to_hit_modifier,
      combatEntry.is_hit ? 1 : 0,
      combatEntry.damage_total,
      combatEntry.is_critical ? 1 : 0,
      combatEntry.blast_power,
      combatEntry.blast_affected_hexes,
      combatEntry.damage_type,
      combatEntry.outcome_json,
      combatEntry.created_at,
      combatEntry.game_date,
      combatEntry.game_time
    );
    
    return entryId;
  } catch (error) {
    console.error('Failed to log heavy weapon attack:', error);
    throw error;
  }
}

/**
 * Creates a combat log entry for vehicle combat
 * @param {Object} options
 * @param {DatabaseSync} options.database
 * @param {string} options.campaignId
 * @param {string} options.characterId - Attacker character ID
 * @param {string} options.characterLabel - Attacker name
 * @param {string} options.accountId - Acting GM account ID
 * @param {Object} options.attackResult - Result from resolveVehicleCombat()
 * @param {string} options.targetLabel - Target vehicle
 * @param {Object} options.campaignState - Current campaign state
 * @returns {string} Log entry ID
 */
function logVehicleCombat(options) {
  const {
    database,
    campaignId,
    characterId,
    characterLabel,
    accountId,
    attackResult,
    targetLabel,
    campaignState
  } = options;
  
  const entryId = randomUUID();
  const timestamp = new Date().toISOString();
  
  const combatEntry = {
    id: entryId,
    campaign_id: campaignId,
    combat_type: 'vehicle-combat',
    attacker_character_id: characterId,
    attacker_label: characterLabel,
    target_label: targetLabel,
    vehicle_name: attackResult.vehicle.name,
    vehicle_structure: attackResult.vehicle.structureValue,
    weapon_penetration: attackResult.damage?.weaponPenetration || 0,
    range: attackResult.attack.range,
    rolls_json: JSON.stringify(attackResult.rolls),
    to_hit_modifier: attackResult.attack.totalModifier,
    is_hit: attackResult.hit.isHit,
    armor_penetrated: attackResult.damage?.armorPenetrated ? 1 : 0,
    penetration_margin: attackResult.damage?.penetrationMargin || 0,
    vehicle_effect: attackResult.effect?.outcome || 'no-effect',
    outcome_json: JSON.stringify({
      outcome: attackResult.summary.outcome,
      vehicleEffect: attackResult.summary.vehicleEffect,
      armorPenetrated: attackResult.summary.armorPenetrated,
      description: attackResult.summary.description
    }),
    created_at: timestamp,
    game_date: campaignState?.gameDate || null,
    game_time: campaignState?.gameTime || null
  };
  
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS combat_log (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        combat_type TEXT NOT NULL,
        attacker_character_id TEXT,
        attacker_label TEXT NOT NULL,
        target_label TEXT NOT NULL,
        vehicle_name TEXT,
        vehicle_structure INTEGER,
        weapon_penetration INTEGER,
        range TEXT,
        rolls_json TEXT,
        to_hit_modifier INTEGER,
        is_hit INTEGER,
        armor_penetrated INTEGER,
        penetration_margin INTEGER,
        vehicle_effect TEXT,
        outcome_json TEXT,
        created_at TEXT NOT NULL,
        game_date TEXT,
        game_time TEXT,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
      )
    `);
    
    const stmt = database.prepare(`
      INSERT INTO combat_log (
        id, campaign_id, combat_type, attacker_character_id, attacker_label,
        target_label, vehicle_name, vehicle_structure, weapon_penetration, range,
        rolls_json, to_hit_modifier, is_hit, armor_penetrated, penetration_margin,
        vehicle_effect, outcome_json, created_at, game_date, game_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      combatEntry.id,
      combatEntry.campaign_id,
      combatEntry.combat_type,
      combatEntry.attacker_character_id,
      combatEntry.attacker_label,
      combatEntry.target_label,
      combatEntry.vehicle_name,
      combatEntry.vehicle_structure,
      combatEntry.weapon_penetration,
      combatEntry.range,
      combatEntry.rolls_json,
      combatEntry.to_hit_modifier,
      combatEntry.is_hit ? 1 : 0,
      combatEntry.armor_penetrated,
      combatEntry.penetration_margin,
      combatEntry.vehicle_effect,
      combatEntry.outcome_json,
      combatEntry.created_at,
      combatEntry.game_date,
      combatEntry.game_time
    );
    
    return entryId;
  } catch (error) {
    console.error('Failed to log vehicle combat:', error);
    throw error;
  }
}

/**
 * Retrieves combat log entries for a campaign
 * @param {DatabaseSync} database
 * @param {string} campaignId
 * @param {Object} options
 * @param {string} options.combatType - Filter by type ('ranged-attack', 'heavy-weapon-*', 'vehicle-combat')
 * @param {string} options.characterId - Filter by attacker character
 * @param {number} options.limit - Maximum entries to return (default 100)
 * @param {number} options.offset - Pagination offset (default 0)
 * @returns {Array} Combat log entries
 */
function getCombatLog(database, campaignId, options = {}) {
  const { combatType, characterId, limit = 100, offset = 0 } = options;
  
  let query = 'SELECT * FROM combat_log WHERE campaign_id = ?';
  const params = [campaignId];
  
  if (combatType) {
    if (combatType === 'heavy-weapon') {
      query += ' AND combat_type LIKE ?';
      params.push('heavy-weapon-%');
    } else {
      query += ' AND combat_type = ?';
      params.push(combatType);
    }
  }
  
  if (characterId) {
    query += ' AND attacker_character_id = ?';
    params.push(characterId);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  try {
    const stmt = database.prepare(query);
    const rows = stmt.all(...params);
    
    return rows.map(row => ({
      id: row.id,
      campaignId: row.campaign_id,
      combatType: row.combat_type,
      attacker: row.attacker_label,
      target: row.target_label,
      weapon: row.weapon_name,
      baseDamage: row.weapon_base_damage,
      range: row.range,
      isHit: row.is_hit === 1,
      damageTotal: row.damage_total,
      isCritical: row.is_critical === 1,
      outcome: JSON.parse(row.outcome_json || '{}'),
      rolls: JSON.parse(row.rolls_json || '{}'),
      createdAt: row.created_at,
      gameDate: row.game_date,
      gameTime: row.game_time
    }));
  } catch (error) {
    console.error('Failed to retrieve combat log:', error);
    return [];
  }
}

module.exports = {
  logRangedAttack,
  logHeavyWeapon,
  logVehicleCombat,
  getCombatLog
};
