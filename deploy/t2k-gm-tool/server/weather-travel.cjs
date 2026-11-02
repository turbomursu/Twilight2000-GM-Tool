/**
 * Weather & Travel System
 * 
 * Implements T2K 4E Strategic Play rules for weather, travel, and supply management.
 * Verified against: gmpack/ocr/1262543-T2kRefereeAidStrategicPlayPrintable.ocr.md
 * 
 * Key mechanics:
 * - Weather conditions (Fair, Cloudy, Rain/Snow) with visibility and attack modifiers
 * - Travel distances (march vs drive) affected by terrain
 * - Fuel and supply consumption tracking
 * - Visibility modifiers for darkness and weather
 * - Terrain modifiers for tasks
 */

// Weather progression: Fair -> Cloudy -> Rain/Snow -> Cloudy -> Fair
const WEATHER_STEPS = ['Fair', 'Cloudy', 'Rain/Snow'];

/**
 * Calculate next weather based on die roll result
 * 
 * Cycle: Fair -> Cloudy -> Rain/Snow -> Cloudy (auto) -> Fair
 * 
 * Single symbol (1): weather worsens one step
 *   Fair -> Cloudy, Cloudy -> Rain/Snow, Rain/Snow -> Cloudy
 * 
 * Double symbols (2): weather improves one step
 *   Rain/Snow -> Fair, Cloudy -> Fair, Fair stays Fair
 * 
 * @param {string} currentWeather - Current weather condition (Fair, Cloudy, Rain/Snow)
 * @param {number} dieResult - Number of symbols on die (1 or 2)
 * @returns {string} New weather condition
 */
function calculateWeatherStep(currentWeather, dieResult) {
  if (dieResult === 0) {
    // No symbols: no change
    return currentWeather;
  }
  
  if (dieResult === 1) {
    // Single symbol: worsen one step
    switch (currentWeather) {
      case 'Fair': return 'Cloudy';
      case 'Cloudy': return 'Rain/Snow';
      case 'Rain/Snow': return 'Cloudy'; // Rain reverts to Cloudy after 1 shift
      default: return currentWeather;
    }
  }
  
  if (dieResult === 2) {
    // Double symbols: improve
    switch (currentWeather) {
      case 'Rain/Snow': return 'Fair'; // Jump to Fair
      case 'Cloudy': return 'Fair';
      case 'Fair': return 'Fair'; // Already best, stay Fair
      default: return currentWeather;
    }
  }
  
  return currentWeather;
}

/**
 * Get all effects for a weather condition
 * 
 * Visibility distances:
 * - Fair: 200m daylight, 100m darkness, 150m darkness with full moon
 * - Cloudy: 50m darkness (same in all conditions effectively)
 * - Rain/Snow: 200m daylight, 50m darkness
 * 
 * Attack modifier:
 * - Fair/Cloudy: 0
 * - Rain/Snow: -1
 * 
 * March modifier (Stamina check):
 * - Fair/Cloudy: 0
 * - Rain/Snow: -1 (requires Stamina check to continue)
 * 
 * Drive modifier:
 * - Fair/Cloudy: 0
 * - Rain/Snow: -2
 * 
 * Duration:
 * - Rain/Snow: 1 shift only, then auto-reverts to Cloudy
 * 
 * @param {string} weather - Weather condition
 * @returns {Object} Weather effects
 */
function getWeatherEffects(weather) {
  const effects = {
    'Fair': {
      visibilityDaylight: 200,
      visibilityDarkness: 100,
      visibilityDarknessMoon: 150,
      attackModifier: 0,
      marchModifier: 0,
      driveModifier: 0,
      duration: Infinity,
      description: 'Clear skies, good visibility',
    },
    'Cloudy': {
      visibilityDaylight: 200,
      visibilityDarkness: 50,
      visibilityDarknessMoon: 50, // Moon doesn't help in clouds
      attackModifier: 0,
      marchModifier: 0,
      driveModifier: 0,
      duration: Infinity,
      description: 'Overcast, reduced night visibility',
    },
    'Rain/Snow': {
      visibilityDaylight: 200,
      visibilityDarkness: 50,
      visibilityDarknessMoon: 50, // Moon doesn't help in rain
      attackModifier: -1,
      marchModifier: -1, // Requires Stamina check
      driveModifier: -2,
      duration: 1,
      description: 'Heavy rain or snow, limited visibility',
      marchRequiresStaminaCheck: true,
    },
  };
  
  return effects[weather] || effects['Fair'];
}

/**
 * Get visibility distance for current conditions
 * 
 * @param {string} weather - Weather condition
 * @param {string} lightLevel - 'daylight' or 'darkness'
 * @param {boolean} fullMoon - Whether full moon is visible
 * @returns {number} Visibility in meters
 */
function getVisibilityModifier(weather, lightLevel, fullMoon = false) {
  const effects = getWeatherEffects(weather);
  
  if (lightLevel === 'daylight') {
    return effects.visibilityDaylight;
  }
  
  if (lightLevel === 'darkness' && fullMoon) {
    return effects.visibilityDarknessMoon || effects.visibilityDarkness;
  }
  
  return effects.visibilityDarkness;
}

/**
 * Calculate distance traveled based on movement type and terrain
 * 
 * Marching (on foot):
 * - Road/Open: 2 hexes per shift
 * - All other terrain: 1 hex per shift
 * 
 * Driving (vehicle):
 * - Base: 5 hexes per shift
 * - Road: x1 (5 hexes/shift) = 50km/shift
 * - Open: x1 (5 hexes/shift)
 * - Woods: x0.5 (2-3 hexes/shift)
 * - Hills: x0.75 (3-4 hexes/shift)
 * - Mountains: x0.25 (1 hex/shift)
 * 
 * @param {string} movement - 'march' or 'drive'
 * @param {string} terrain - Terrain type (road, open, woods, hills, mountains, lake, swamp, ruins)
 * @param {number} shifts - Number of shifts traveled
 * @returns {number} Distance in hexes (10km per hex)
 */
function calculateTravelDistance(movement, terrain, shifts) {
  if (movement === 'march') {
    const hexesPerShift = (terrain === 'road' || terrain === 'open') ? 2 : 1;
    return hexesPerShift * shifts;
  }
  
  if (movement === 'drive') {
    const baseHexesPerShift = 5;
    const terrainFactors = {
      'road': 1,
      'open': 1,
      'woods': 0.5,
      'hills': 0.75,
      'mountains': 0.25,
      'lake': 1, // Requires boat/amphibious
      'swamp': 0.5,
      'ruins': 0.5,
    };
    
    const factor = terrainFactors[terrain] || 1;
    const hexesPerShift = Math.floor(baseHexesPerShift * factor);
    return hexesPerShift * shifts;
  }
  
  return 0;
}

/**
 * Calculate fuel consumption for distance traveled
 * 
 * Standard consumption: 1 liter per hex (10km)
 * Alcohol fuel: Double consumption
 * 
 * @param {string} fuelType - 'gasoline', 'diesel', or 'alcohol'
 * @param {number} hexesTraveled - Distance in hexes
 * @returns {number} Fuel consumed in liters
 */
function calculateFuelConsumption(fuelType, hexesTraveled) {
  const baseConsumption = hexesTraveled; // 1 liter per hex
  
  if (fuelType === 'alcohol') {
    return baseConsumption * 2; // Double for alcohol fuel
  }
  
  return baseConsumption; // gasoline, diesel, same rate
}

/**
 * Calculate rations needed for party
 * 
 * @param {string} type - 'food' or 'water'
 * @param {number} personCount - Number of people
 * @param {number} days - Number of days
 * @returns {number} Rations needed
 */
function calculateRationsNeeded(type, personCount, days) {
  // 1 ration per person per day for both food and water
  return personCount * days;
}

/**
 * Get terrain modifier for task rolls
 * 
 * Table from Strategic Play:
 * TERRAIN | FORAGING | HUNTING | SCROUNGING | DRIVING
 * Road       0         0          1            3
 * Open       0         0          1            2
 * Woods     -1        +1          0            0
 * Hills     +1        -1          0            0
 * Mountains -2         0         -2           -2
 * Swamp     -1         0          0            0
 * Ruins      0         0         +2           -2
 * 
 * @param {string} terrain - Terrain type
 * @param {string} task - Task type (foraging, hunting, scrounging, driving)
 * @returns {number} Modifier to roll
 */
function getTerrainModifier(terrain, task) {
  const modifiers = {
    'road': { foraging: 0, hunting: 0, scrounging: 1, driving: 3 },
    'open': { foraging: 0, hunting: 0, scrounging: 1, driving: 2 },
    'woods': { foraging: -1, hunting: 1, scrounging: 0, driving: 0 },
    'hills': { foraging: 1, hunting: -1, scrounging: 0, driving: 0 },
    'mountains': { foraging: -2, hunting: 0, scrounging: -2, driving: -2 },
    'lake': { foraging: 0, hunting: 0, scrounging: 0, driving: 0 },
    'swamp': { foraging: -1, hunting: 0, scrounging: 0, driving: 0 },
    'ruins': { foraging: 0, hunting: 0, scrounging: 2, driving: -2 },
  };
  
  return modifiers[terrain]?.[task] ?? 0;
}

/**
 * Determine encounter distance into shift
 * 
 * Encounters typically occur about halfway through the shift,
 * but can be rolled as 1d6 hexes into travel.
 * 
 * @param {number} hexesTraveledPerShift - Total hex distance per shift
 * @param {number} shiftsCount - Number of shifts traveled
 * @returns {number} Distance in hexes where encounter occurs
 */
function determineEncounterDistance(hexesTraveledPerShift, shiftsCount) {
  // For now, return about halfway through; later can add die roll
  return Math.floor((hexesTraveledPerShift * shiftsCount) / 2);
}

/**
 * Determine if character becomes afflicted with a condition
 * 
 * @param {string} condition - 'starving', 'dehydrated', 'sleep_deprived', 'hypothermic'
 * @param {Object} state - Character state with food/water/sleep tracking
 * @returns {boolean} Whether character now has the condition
 */
function checkAffliction(condition, state) {
  switch (condition) {
    case 'starving':
      return state.foodRationsRemaining < 1;
    case 'dehydrated':
      return state.waterRationsRemaining < 1;
    case 'sleep_deprived':
      return state.shiftsSleptToday < 1;
    case 'hypothermic':
      // Requires Stamina roll in cold; GM adjudicated
      return false; // Needs explicit Stamina roll result
    default:
      return false;
  }
}

/**
 * Apply per-day effects of an affliction
 * 
 * @param {string} condition - Condition name
 * @returns {Object} Daily effects: {damagePoints, stressPoints, canHealDamage, canHealStress}
 */
function getAfflictionEffects(condition) {
  const effects = {
    'starving': {
      damagePerDay: 0,
      damagePerWeek: 1,
      stressPerDay: 0,
      canHealDamage: false,
      canHealStress: true,
      dies: 'after another week without food',
    },
    'dehydrated': {
      damagePerDay: 1,
      damagePerWeek: 0,
      stressPerDay: 0,
      canHealDamage: false,
      canHealStress: true,
      dies: 'after another day without water',
    },
    'sleep_deprived': {
      damagePerDay: 0,
      damagePerWeek: 0,
      stressPerDay: 1,
      canHealDamage: true,
      canHealStress: false,
      collapsesAfter: 'incapacitation by stress, must sleep 1 shift',
    },
    'hypothermic': {
      damagePerDay: 0,
      damagePerWeek: 0,
      stressPerDay: 0,
      canHealDamage: false,
      canHealStress: false,
      requiresStaminaRoll: true,
    },
  };
  
  return effects[condition] || {};
}

module.exports = {
  calculateWeatherStep,
  getWeatherEffects,
  getVisibilityModifier,
  calculateTravelDistance,
  calculateFuelConsumption,
  calculateRationsNeeded,
  getTerrainModifier,
  determineEncounterDistance,
  checkAffliction,
  getAfflictionEffects,
  WEATHER_STEPS,
};
