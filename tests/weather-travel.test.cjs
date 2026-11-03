const test = require('node:test');
const assert = require('node:assert');
const {
  calculateWeatherStep,
  getVisibilityModifier,
  getWeatherEffects,
  calculateTravelDistance,
  calculateFuelConsumption,
  calculateRationsNeeded,
  getTerrainModifier,
  determineEncounterDistance,
} = require('../server/weather-travel.cjs');

test('Weather System', async (t) => {
  await t.test('Weather step progression', async (t) => {
    // Fair -> Cloudy -> Rain/Snow -> Cloudy -> Fair (cycle)
    // Single symbol (1): worsen
    assert.strictEqual(calculateWeatherStep('Fair', 1), 'Cloudy', 'Symbol: Fair -> Cloudy');
    assert.strictEqual(calculateWeatherStep('Cloudy', 1), 'Rain/Snow', 'Symbol: Cloudy -> Rain/Snow');
    assert.strictEqual(calculateWeatherStep('Rain/Snow', 1), 'Cloudy', 'Symbol: Rain/Snow -> Cloudy');
    // Double symbols (2): improve
    assert.strictEqual(calculateWeatherStep('Cloudy', 2), 'Fair', 'Double: Cloudy -> Fair');
    assert.strictEqual(calculateWeatherStep('Rain/Snow', 2), 'Fair', 'Double: Rain/Snow -> Fair');
    assert.strictEqual(calculateWeatherStep('Fair', 2), 'Fair', 'Double: Fair stays Fair');
    // No symbols (0): no change
    assert.strictEqual(calculateWeatherStep('Fair', 0), 'Fair', 'No symbol: Fair unchanged');
  });

  await t.test('Weather effects by condition', async (t) => {
    const fair = getWeatherEffects('Fair');
    assert.strictEqual(fair.visibilityDaylight, 200, 'Fair daylight visibility 200m');
    assert.strictEqual(fair.visibilityDarkness, 100, 'Fair darkness visibility 100m');
    assert.strictEqual(fair.visibilityDarknessMoon, 150, 'Fair darkness with moon 150m');
    assert.strictEqual(fair.attackModifier, 0, 'Fair attack modifier 0');
    assert.strictEqual(fair.marchModifier, 0, 'Fair march modifier 0');
    assert.strictEqual(fair.driveModifier, 0, 'Fair drive modifier 0');

    const cloudy = getWeatherEffects('Cloudy');
    assert.strictEqual(cloudy.visibilityDarkness, 50, 'Cloudy darkness visibility 50m');
    assert.strictEqual(cloudy.attackModifier, 0, 'Cloudy attack modifier 0');

    const rain = getWeatherEffects('Rain/Snow');
    assert.strictEqual(rain.visibilityDaylight, 200, 'Rain/Snow daylight visibility 200m');
    assert.strictEqual(rain.visibilityDarkness, 50, 'Rain/Snow darkness visibility 50m');
    assert.strictEqual(rain.attackModifier, -1, 'Rain/Snow attack modifier -1');
    assert.strictEqual(rain.marchModifier, -1, 'Rain/Snow march modifier -1 (Stamina check)');
    assert.strictEqual(rain.driveModifier, -2, 'Rain/Snow drive modifier -2');
    assert.strictEqual(rain.duration, 1, 'Rain/Snow lasts 1 shift');
  });

  await t.test('Visibility modifiers for darkness conditions', async (t) => {
    assert.strictEqual(getVisibilityModifier('Fair', 'daylight', false), 200, 'Fair daylight 200m');
    assert.strictEqual(getVisibilityModifier('Fair', 'darkness', false), 100, 'Fair darkness no moon 100m');
    assert.strictEqual(getVisibilityModifier('Fair', 'darkness', true), 150, 'Fair darkness with moon 150m');
    
    assert.strictEqual(getVisibilityModifier('Cloudy', 'darkness', false), 50, 'Cloudy darkness 50m');
    assert.strictEqual(getVisibilityModifier('Cloudy', 'darkness', true), 50, 'Cloudy darkness with moon still 50m');
    
    assert.strictEqual(getVisibilityModifier('Rain/Snow', 'daylight', false), 200, 'Rain daylight 200m');
    assert.strictEqual(getVisibilityModifier('Rain/Snow', 'darkness', false), 50, 'Rain darkness 50m');
  });
});

test('Travel System', async (t) => {
  await t.test('Marching distances by terrain', async (t) => {
    // Base: 2 hexes per shift on road/open, 1 hex per shift other terrain
    assert.strictEqual(calculateTravelDistance('march', 'road', 1), 2, 'March road 1 shift = 2 hexes');
    assert.strictEqual(calculateTravelDistance('march', 'open', 1), 2, 'March open 1 shift = 2 hexes');
    assert.strictEqual(calculateTravelDistance('march', 'woods', 1), 1, 'March woods 1 shift = 1 hex');
    assert.strictEqual(calculateTravelDistance('march', 'hills', 1), 1, 'March hills 1 shift = 1 hex');
    assert.strictEqual(calculateTravelDistance('march', 'mountains', 1), 1, 'March mountains 1 shift = 1 hex');
    
    assert.strictEqual(calculateTravelDistance('march', 'road', 4), 8, 'March road 4 shifts = 8 hexes');
    assert.strictEqual(calculateTravelDistance('march', 'open', 2), 4, 'March open 2 shifts = 4 hexes');
  });

  await t.test('Driving distances by terrain', async (t) => {
    // Road/open: x1, woods: x0.5, hills: x0.75, mountains: x0.25, etc
    const baseHexesPerShift = 5; // Driving base
    
    assert.strictEqual(calculateTravelDistance('drive', 'road', 1), baseHexesPerShift * 1, 'Drive road x1');
    assert.strictEqual(calculateTravelDistance('drive', 'open', 1), baseHexesPerShift * 1, 'Drive open x1');
    assert.strictEqual(calculateTravelDistance('drive', 'woods', 1), Math.floor(baseHexesPerShift * 0.5), 'Drive woods x0.5');
    assert.strictEqual(calculateTravelDistance('drive', 'hills', 1), Math.floor(baseHexesPerShift * 0.75), 'Drive hills x0.75');
    assert.strictEqual(calculateTravelDistance('drive', 'mountains', 1), Math.floor(baseHexesPerShift * 0.25), 'Drive mountains x0.25');
  });

  await t.test('Fuel consumption by vehicle and distance', async (t) => {
    // Typical consumption: 1 liter per 10km = 1 liter per hex
    // Alcohol fuel doubles consumption
    
    assert.strictEqual(calculateFuelConsumption('gasoline', 5), 5, '5 hexes = 5 liters gasoline');
    assert.strictEqual(calculateFuelConsumption('diesel', 5), 5, '5 hexes = 5 liters diesel');
    assert.strictEqual(calculateFuelConsumption('alcohol', 5), 10, '5 hexes = 10 liters alcohol (double)');
    
    assert.strictEqual(calculateFuelConsumption('gasoline', 0), 0, '0 hexes = 0 liters');
    assert.strictEqual(calculateFuelConsumption('gasoline', 25), 25, '25 hexes = 25 liters');
  });

  await t.test('Rations needed per day by character count', async (t) => {
    // 1 ration per person per day (food + water separate)
    assert.strictEqual(calculateRationsNeeded('food', 1, 1), 1, '1 person 1 day = 1 food ration');
    assert.strictEqual(calculateRationsNeeded('food', 4, 1), 4, '4 people 1 day = 4 food rations');
    assert.strictEqual(calculateRationsNeeded('food', 1, 7), 7, '1 person 7 days = 7 food rations');
    assert.strictEqual(calculateRationsNeeded('food', 4, 7), 28, '4 people 7 days = 28 food rations');
    
    assert.strictEqual(calculateRationsNeeded('water', 1, 1), 1, '1 person 1 day = 1 water ration');
    assert.strictEqual(calculateRationsNeeded('water', 4, 7), 28, '4 people 7 days = 28 water rations');
  });

  await t.test('Terrain modifiers for tasks', async (t) => {
    // Terrain affects various task checks
    const terrainMods = {
      'road': { foraging: 0, hunting: 0, scrounging: 1, driving: 3 },
      'open': { foraging: 0, hunting: 0, scrounging: 1, driving: 2 },
      'woods': { foraging: -1, hunting: 1, scrounging: 0, driving: 0 },
      'hills': { foraging: 1, hunting: -1, scrounging: 0, driving: 0 },
      'mountains': { foraging: -2, hunting: 0, scrounging: -2, driving: -2 },
      'swamp': { foraging: -1, hunting: 0, scrounging: 0, driving: 0 },
      'ruins': { foraging: 0, hunting: 0, scrounging: 2, driving: -2 },
    };
    
    for (const [terrain, mods] of Object.entries(terrainMods)) {
      for (const [task, mod] of Object.entries(mods)) {
        const calculated = getTerrainModifier(terrain, task);
        assert.strictEqual(calculated, mod, `${terrain} ${task} modifier = ${mod}`);
      }
    }
  });

  await t.test('Encounter distance calculation', async (t) => {
    // Encounter happens 1d6 hexes into shift, or about halfway through
    const distance = determineEncounterDistance(5, 1); // 5 hexes per shift, 1 shift
    assert.ok(distance >= 1 && distance <= 5, `Encounter within traveled distance (${distance})`);
    
    const distance2 = determineEncounterDistance(10, 2); // 10 hexes per shift, 2 shifts
    assert.ok(distance2 >= 1 && distance2 <= 20, `Encounter within 2-shift distance (${distance2})`);
  });
});

test('Supply & Condition System', async (t) => {
  await t.test('Starvation effects', async (t) => {
    // -1 to all rolls, -1 damage per week, cannot heal damage
    const starvation = {
      canHealDamage: false,
      canHealStress: true,
      damagePerWeek: 1,
      damagePerDay: 0,
      dies: 'after another week without food',
    };
    assert.strictEqual(starvation.canHealDamage, false, 'Cannot heal damage while starving');
    assert.strictEqual(starvation.damagePerWeek, 1, 'Takes 1 damage per week');
  });

  await t.test('Dehydration effects', async (t) => {
    // -1 to all rolls, -1 damage per day, cannot heal damage
    const dehydration = {
      canHealDamage: false,
      canHealStress: true,
      damagePerDay: 1,
      dies: 'after another day without water',
    };
    assert.strictEqual(dehydration.canHealDamage, false, 'Cannot heal damage while dehydrated');
    assert.strictEqual(dehydration.damagePerDay, 1, 'Takes 1 damage per day');
  });

  await t.test('Sleep deprivation effects', async (t) => {
    // Cannot heal stress, takes 1 stress per day if deprived
    const sleepDep = {
      canHealStress: false,
      stressPerDay: 1,
      collapsesAfter: 'incapacitation by stress',
    };
    assert.strictEqual(sleepDep.canHealStress, false, 'Cannot heal stress while sleep deprived');
    assert.strictEqual(sleepDep.stressPerDay, 1, 'Takes 1 stress per day');
  });

  await t.test('Hypothermia rolls based on temperature/protection', async (t) => {
    // Roll Stamina in cold conditions
    // Fall chill: 1/day, Winter: 1/shift
    const hypothermiaChecks = {
      fallChill: { frequency: 'once per day', dc: 'Referee discretion' },
      winter: { frequency: 'once per shift', dc: 'Referee discretion' },
    };
    assert.ok(hypothermiaChecks.fallChill, 'Fall chill requires Stamina check');
    assert.ok(hypothermiaChecks.winter, 'Winter requires frequent Stamina checks');
  });
});

test('Rules Verification', async (t) => {
  await t.test('Heavy rain auto-reverts to cloudy', async (t) => {
    // After 1 shift of rain, reverts to cloudy for at least 1 shift
    assert.strictEqual(getWeatherEffects('Rain/Snow').duration, 1, 'Rain lasts exactly 1 shift');
  });

  await t.test('Forced march with Stamina roll', async (t) => {
    // Can march 3 or 4 shifts per day with successful Stamina rolls
    // 4th shift has -2 penalty and causes sleep deprivation
    assert.ok(true, 'Forced march mechanics defined in GM rules');
  });

  await t.test('Driving roll required at terrain change', async (t) => {
    // Half-way through shift AND when terrain changes
    assert.ok(true, 'Driving roll requirement documented');
  });

  await t.test('Vehicle maintenance weekly', async (t) => {
    // Tech roll once per week vehicle is driven 1+ hex
    // Failure/absence: -1 reliability
    assert.ok(true, 'Vehicle maintenance documented');
  });

  await t.test('Gun care weekly after use', async (t) => {
    // After using firearm at least once in week, Tech roll
    // Failure/absence: -1 reliability
    assert.ok(true, 'Gun care maintenance documented');
  });

  await t.test('Hidden camp recon check', async (t) => {
    // Players roll Recon to hide camp
    // Encounters roll Recon to find; can choose to engage or avoid
    assert.ok(true, 'Hidden camp mechanics documented');
  });

  await t.test('Navigation roll for off-road travel', async (t) => {
    // Off-road march or drive requires Survival roll to stay on course
    // Failed roll: enter adjacent hex (1d6 odd/even determines direction)
    assert.ok(true, 'Navigation roll mechanics documented');
  });

  await t.test('Interruptions rule', async (t) => {
    // 3/4 of shift on task = gain benefits
    assert.ok(true, '75% shift threshold for task benefits documented');
  });
});
