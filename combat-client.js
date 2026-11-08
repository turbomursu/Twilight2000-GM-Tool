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
   * Name suggestions only, from the runtime's existing NPC equipment catalog.
   * Strip loadout quantities, not weapon names. No stats or rules are inferred.
   */
  static knownWeaponNames(archetypes) {
    const names = new Set();
    for (const archetype of archetypes) {
      for (const item of archetype.equipment || []) {
        if (item.category !== 'weapon' || typeof item.name !== 'string') continue;
        for (const alternative of item.name.split(/\s+or\s+/i)) {
          const name = alternative.replace(/\s+with\s+.*$/i, '').trim();
          if (name) names.add(name);
        }
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  async loadKnownWeaponNames() {
    try {
      const response = await fetch('/api/campaigns/' + encodeURIComponent(this.campaignId) + '/npc-archetypes');
      if (!response.ok) throw new Error('Catalog request failed.');
      const data = await response.json();
      if (!Array.isArray(data.archetypes)) throw new Error('Invalid catalog.');
      return CombatClient.knownWeaponNames(data.archetypes);
    } catch {
      throw new Error('Known weapon names unavailable; use Other/custom.');
    }
  }

  async loadCampaignWeapons() {
    try {
      const response = await fetch('/api/campaigns/' + encodeURIComponent(this.campaignId) + '/combat-weapons');
      if (!response.ok) throw new Error('Campaign weapon request failed.');
      const data = await response.json();
      if (!Array.isArray(data.weapons)) throw new Error('Invalid campaign weapon catalog.');
      return data.weapons;
    } catch {
      throw new Error('Saved campaign weapons unavailable; use the other catalog options.');
    }
  }

  /**
   * Keep the existing resolver input as a hidden value; each selector owns its
   * own state. Custom text is editable/required only when explicitly selected.
   */
  static createWeaponSelector(input, doc = document, onSavedWeaponSelected = () => {}) {
    const select = doc.createElement('select');
    select.id = input.id + 'Select';
    select.required = true;
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose weapon…';
    const other = doc.createElement('option');
    other.value = '__custom__';
    other.textContent = 'Other/custom';
    select.append(placeholder, other);
    const customLabel = doc.createElement('label');
    const custom = doc.createElement('input');
    custom.id = input.id + 'Custom';
    custom.type = 'text';
    custom.placeholder = 'GM-defined weapon name';
    customLabel.htmlFor = custom.id;
    customLabel.textContent = 'Custom weapon name';
    const knownNameKeys = new Set();
    const savedByName = new Map();
    function sync() {
      const isCustom = select.value === other.value;
      customLabel.hidden = custom.hidden = !isCustom;
      custom.disabled = !isCustom;
      custom.required = isCustom;
      const nameKey = custom.value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
      custom.setCustomValidity(isCustom
        ? !nameKey ? 'Enter a custom weapon name.'
          : knownNameKeys.has(nameKey) ? 'This weapon is already in the catalog; select it from the list.'
            : ''
        : '');
      input.value = isCustom ? custom.value.trim() : select.value;
      if (!isCustom && savedByName.has(select.value.normalize('NFKC').toLocaleLowerCase('en-US'))) {
        onSavedWeaponSelected(savedByName.get(select.value.normalize('NFKC').toLocaleLowerCase('en-US')));
      }
    }
    select.addEventListener('change', sync);
    custom.addEventListener('input', sync);
    input.type = 'hidden';
    input.value = '';
    input.before(select, customLabel, custom);
    sync();
    return {
      populate(names, campaignWeapons = [], kind = null) {
        for (const name of names) {
          knownNameKeys.add(name.normalize('NFKC').toLocaleLowerCase('en-US'));
          const option = doc.createElement('option');
          option.value = option.textContent = name;
          select.insertBefore(option, other);
        }
        for (const weapon of campaignWeapons.filter(item => item.kind === kind)) {
          const nameKey = weapon.name.normalize('NFKC').toLocaleLowerCase('en-US');
          if (knownNameKeys.has(nameKey)) continue;
          knownNameKeys.add(nameKey);
          savedByName.set(nameKey, weapon);
          const option = doc.createElement('option');
          option.value = option.textContent = weapon.name;
          select.insertBefore(option, other);
        }
        sync();
      },
      shouldSaveCustom() {
        return select.value === other.value;
      }
    };
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
      ammoAvailable: parseInt(input.ammoAvailable) || 0,
      saveCustomWeapon: input.saveCustomWeapon === true
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
      ccRoll: parseInt(input.closeCombatRoll),
      targetArmorLevel: parseInt(input.targetArmorLevel) || 0,
      saveCustomWeapon: input.saveCustomWeapon === true
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
      targetArmorLevel: parseInt(input.targetArmorLevel) || 0,
      saveCustomWeapon: input.saveCustomWeapon === true
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
      scatterRoll: input.scatterRoll ? parseInt(input.scatterRoll) : null,
      saveCustomWeapon: input.saveCustomWeapon === true
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
