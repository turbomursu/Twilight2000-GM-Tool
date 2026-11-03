/**
 * Weather & Travel API Routes
 * 
 * HTTP endpoints for weather management, travel planning, and supply tracking.
 * All endpoints require GM authentication and valid campaign ID.
 */

const weatherTravel = require('./weather-travel.cjs');

/**
 * POST /api/campaigns/:campaignId/weather/roll
 * 
 * Roll for weather change
 * 
 * Request body:
 * {
 *   currentWeather: string ('Fair', 'Cloudy', 'Rain/Snow'),
 *   dieResult: number (1 or 2, number of symbols)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   previousWeather: string,
 *   newWeather: string,
 *   effects: object (visibility, modifiers, etc),
 *   description: string
 * }
 */
function handleWeatherRoll(req, res, campaign) {
  try {
    const { currentWeather, dieResult } = req.body;
    
    if (!currentWeather || typeof dieResult !== 'number') {
      return res.status(400).json({ error: 'Missing or invalid currentWeather, dieResult' });
    }
    
    if (![0, 1, 2].includes(dieResult)) {
      return res.status(400).json({ error: 'dieResult must be 0, 1, or 2' });
    }
    
    const newWeather = weatherTravel.calculateWeatherStep(currentWeather, dieResult);
    const effects = weatherTravel.getWeatherEffects(newWeather);
    
    res.json({
      success: true,
      previousWeather: currentWeather,
      newWeather: newWeather,
      effects: {
        visibilityDaylight: effects.visibilityDaylight,
        visibilityDarkness: effects.visibilityDarkness,
        visibilityDarknessMoon: effects.visibilityDarknessMoon,
        attackModifier: effects.attackModifier,
        marchModifier: effects.marchModifier,
        driveModifier: effects.driveModifier,
        duration: effects.duration,
      },
      description: effects.description,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/campaigns/:campaignId/travel/distance
 * 
 * Calculate travel distance
 * 
 * Request body:
 * {
 *   movement: string ('march' or 'drive'),
 *   terrain: string,
 *   shifts: number
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   hexesTraveled: number,
 *   kilometersTraveled: number (hexes * 10),
 *   terrain: string,
 *   movement: string
 * }
 */
function handleTravelDistance(req, res, campaign) {
  try {
    const { movement, terrain, shifts } = req.body;
    
    if (!movement || !terrain || typeof shifts !== 'number' || shifts < 1) {
      return res.status(400).json({ error: 'Missing or invalid movement, terrain, shifts' });
    }
    
    if (!['march', 'drive'].includes(movement)) {
      return res.status(400).json({ error: 'movement must be "march" or "drive"' });
    }
    
    const hexes = weatherTravel.calculateTravelDistance(movement, terrain, shifts);
    const kilometers = hexes * 10;
    
    res.json({
      success: true,
      hexesTraveled: hexes,
      kilometersTraveled: kilometers,
      terrain: terrain,
      movement: movement,
      shiftsCount: shifts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/campaigns/:campaignId/travel/fuel
 * 
 * Calculate fuel consumption
 * 
 * Request body:
 * {
 *   fuelType: string ('gasoline', 'diesel', 'alcohol'),
 *   hexesTraveled: number
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   fuelType: string,
 *   hexesTraveled: number,
 *   literConsumed: number
 * }
 */
function handleFuelCalculation(req, res, campaign) {
  try {
    const { fuelType, hexesTraveled } = req.body;
    
    if (!fuelType || typeof hexesTraveled !== 'number' || hexesTraveled < 0) {
      return res.status(400).json({ error: 'Missing or invalid fuelType, hexesTraveled' });
    }
    
    const consumption = weatherTravel.calculateFuelConsumption(fuelType, hexesTraveled);
    
    res.json({
      success: true,
      fuelType: fuelType,
      hexesTraveled: hexesTraveled,
      literConsumed: consumption,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/campaigns/:campaignId/travel/rations
 * 
 * Calculate rations needed
 * 
 * Request body:
 * {
 *   type: string ('food' or 'water'),
 *   personCount: number,
 *   days: number
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   type: string,
 *   personCount: number,
 *   days: number,
 *   rationCount: number
 * }
 */
function handleRationsCalculation(req, res, campaign) {
  try {
    const { type, personCount, days } = req.body;
    
    if (!type || typeof personCount !== 'number' || typeof days !== 'number' || personCount < 1 || days < 1) {
      return res.status(400).json({ error: 'Missing or invalid type, personCount, days' });
    }
    
    if (!['food', 'water'].includes(type)) {
      return res.status(400).json({ error: 'type must be "food" or "water"' });
    }
    
    const rations = weatherTravel.calculateRationsNeeded(type, personCount, days);
    
    res.json({
      success: true,
      type: type,
      personCount: personCount,
      days: days,
      rationCount: rations,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/campaigns/:campaignId/travel/terrain-modifier
 * 
 * Get terrain modifier for task
 * 
 * Request body:
 * {
 *   terrain: string,
 *   task: string ('foraging', 'hunting', 'scrounging', 'driving')
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   terrain: string,
 *   task: string,
 *   modifier: number
 * }
 */
function handleTerrainModifier(req, res, campaign) {
  try {
    const { terrain, task } = req.body;
    
    if (!terrain || !task) {
      return res.status(400).json({ error: 'Missing or invalid terrain, task' });
    }
    
    const modifier = weatherTravel.getTerrainModifier(terrain, task);
    
    res.json({
      success: true,
      terrain: terrain,
      task: task,
      modifier: modifier,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/campaigns/:campaignId/travel/encounter-distance
 * 
 * Determine where encounter occurs during shift
 * 
 * Request body:
 * {
 *   hexesTraveledPerShift: number,
 *   shiftsCount: number
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   hexesTraveledPerShift: number,
 *   shiftsCount: number,
 *   encounterHexDistance: number
 * }
 */
function handleEncounterDistance(req, res, campaign) {
  try {
    const { hexesTraveledPerShift, shiftsCount } = req.body;
    
    if (typeof hexesTraveledPerShift !== 'number' || typeof shiftsCount !== 'number' || 
        hexesTraveledPerShift < 1 || shiftsCount < 1) {
      return res.status(400).json({ error: 'Missing or invalid hexesTraveledPerShift, shiftsCount' });
    }
    
    const distance = weatherTravel.determineEncounterDistance(hexesTraveledPerShift, shiftsCount);
    
    res.json({
      success: true,
      hexesTraveledPerShift: hexesTraveledPerShift,
      shiftsCount: shiftsCount,
      encounterHexDistance: distance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  handleWeatherRoll,
  handleTravelDistance,
  handleFuelCalculation,
  handleRationsCalculation,
  handleTerrainModifier,
  handleEncounterDistance,
};
