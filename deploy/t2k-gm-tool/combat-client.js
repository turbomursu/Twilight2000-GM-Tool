/**
 * Combat Interface Client
 * 
 * Handles GM combat form interactions and API communication.
 * Supports ranged, close combat, grenades, heavy weapons, and vehicle combat.
 */

class CombatClient {
  constructor(campaignId) {
    this.campaignId = campaignId;
    this.lastResult = null;
    this.combatLog = [];
  }

  /**
   * Resolve a ranged attack
   */
  async resolveRangedAttack(input) {
    const payload = {
      weaponName: input.weaponName,
      weaponBaseDamage: parseInt(input.weaponBaseDamage),
      weaponThreshold: parseInt(input.weaponThreshold),
      range: input.range,
      agilityRoll: parseInt(input.agilityRoll),
      rangedCombatRoll: parseInt(input.rangedCombatRoll),
      shooterAgilityDie: input.shooterAgilityDie || "D10",
      shooterRangedCombatDie: input.shooterRangedCombatDie || "D8",
      shooterStrengthBonus: parseInt(input.shooterStrengthBonus) || 10,
      targetArmorLevel: parseInt(input.targetArmorLevel) || 0,
      modifierDeltas: input.modifierDeltas || [],
      ammoDieType: parseInt(input.ammoDieType) || 0,
      ammoAvailable: parseInt(input.ammoAvailable) || 0
    };

    if (payload.ammoDieType > 0 && input.ammoRolls) {
      payload.ammoRolls = input.ammoRolls.split(',').map(r => parseInt(r.trim()));
    }

    return this._post('/api/campaigns/' + this.campaignId + '/combat/ranged-attack', payload);
  }

  /**
   * Resolve a close combat attack
   */
  async resolveCloseCombat(input) {
    const payload = {
      weaponName: input.weaponName,
      weaponBaseDamage: parseInt(input.weaponBaseDamage),
      weaponThreshold: parseInt(input.weaponThreshold),
      strengthRoll: parseInt(input.strengthRoll),
      closeCombatRoll: parseInt(input.closeCombatRoll),
      targetArmorLevel: parseInt(input.targetArmorLevel) || 0
    };

    return this._post('/api/campaigns/' + this.campaignId + '/combat/close-combat', payload);
  }

  /**
   * Resolve a grenade throw
   */
  async resolveGrenade(input) {
    const payload = {
      grenadeName: input.grenadeName,
      blastPower: parseInt(input.blastPower),
      threshold: parseInt(input.threshold) || 2,
      agilityRoll: parseInt(input.agilityRoll),
      mobilityRoll: parseInt(input.mobilityRoll),
      targetArmorLevel: parseInt(input.targetArmorLevel) || 0
    };

    return this._post('/api/campaigns/' + this.campaignId + '/combat/grenade', payload);
  }

  /**
   * Resolve a heavy weapon attack
   */
  async resolveHeavyWeapon(input) {
    const payload = {
      weaponName: input.weaponName,
      baseDamage: parseInt(input.baseDamage),
      threshold: parseInt(input.threshold),
      weaponType: input.weaponType,
      shooterAgilityDie: input.shooterAgilityDie || "D10",
      shooterMobilityDie: input.shooterMobilityDie || "D8",
      agilityRoll: parseInt(input.agilityRoll),
      mobilityRoll: parseInt(input.mobilityRoll),
      targetArmorLevel: parseInt(input.targetArmorLevel) || 0,
      scatterRoll: input.scatterRoll ? parseInt(input.scatterRoll) : null
    };

    return this._post('/api/campaigns/' + this.campaignId + '/combat/heavy-weapon', payload);
  }

  /**
   * Resolve a vehicle combat attack
   */
  async resolveVehicleCombat(input) {
    const payload = {
      vehicleName: input.vehicleName,
      targetingType: input.targetingType,
      vehicleStructureValue: parseInt(input.vehicleStructureValue),
      weaponPenetration: parseInt(input.weaponPenetration),
      shooterAgilityDie: input.shooterAgilityDie || "D10",
      shooterRangedCombatDie: input.shooterRangedCombatDie || "D8",
      range: input.range || "medium",
      agilityRoll: parseInt(input.agilityRoll),
      rangedCombatRoll: parseInt(input.rangedCombatRoll),
      modifierDeltas: input.modifierDeltas || []
    };

    return this._post('/api/campaigns/' + this.campaignId + '/combat/vehicle-combat', payload);
  }

  /**
   * POST helper
   */
  async _post(url, payload) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Combat resolution failed');
      }

      this.lastResult = await response.json();
      this.combatLog.push({
        timestamp: new Date().toISOString(),
        result: this.lastResult
      });

      return this.lastResult;
    } catch (error) {
      console.error('Combat API error:', error);
      throw error;
    }
  }

  /**
   * Format result for display
   */
  formatResult() {
    if (!this.lastResult) return '';

    const result = this.lastResult;
    let html = '<div class="combat-result">';
    html += '<h3>' + (result.summary?.outcome || result.hit?.isHit ? 'HIT' : 'MISS') + '</h3>';

    if (result.weapon) {
      html += '<p><strong>Weapon:</strong> ' + result.weapon.name + '</p>';
    }

    if (result.hit) {
      html += '<p><strong>Hit:</strong> ' + (result.hit.isHit ? 'YES' : 'NO') + '</p>';
    }

    if (result.damage) {
      html += '<p><strong>Damage:</strong> ' + result.damage.total + '</p>';
    }

    if (result.critical) {
      html += '<p><strong>CRITICAL HIT</strong></p>';
    }

    if (result.blast) {
      html += '<p><strong>Primary Hex Damage:</strong> ' + result.blast.primaryHexDamage + '</p>';
      if (result.blast.adjacentHexDamage > 0) {
        html += '<p><strong>Adjacent Hex Damage:</strong> ' + result.blast.adjacentHexDamage + '</p>';
      }
    }

    if (result.effect) {
      html += '<p><strong>Vehicle Effect:</strong> ' + result.effect.outcome + '</p>';
    }

    if (result.summary?.description) {
      html += '<p>' + result.summary.description + '</p>';
    }

    html += '</div>';
    return html;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CombatClient;
}
