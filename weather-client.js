/**
 * Weather & Travel Client
 * 
 * Frontend form handler for weather and travel calculations.
 */

let campaignId = null;

// Initialize by extracting campaign ID from URL
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  campaignId = params.get('campaign');
  
  if (!campaignId) {
    showError('Missing campaign ID in URL');
  }
});

/**
 * Display error message
 */
function showError(message) {
  const resultDiv = document.getElementById('weatherResult') || document.getElementById('distanceResult');
  if (resultDiv) {
    resultDiv.innerHTML = `<div class="result error">${message}</div>`;
  }
}

/**
 * Roll for weather change
 */
async function rollWeather() {
  if (!campaignId) {
    showError('Campaign not loaded');
    return;
  }

  const currentWeather = document.getElementById('weatherCurrent').value;
  const dieResult = parseInt(document.getElementById('weatherDie').value);

  try {
    const response = await fetch(`/api/campaigns/${campaignId}/weather/roll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentWeather, dieResult }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();

    if (!data.success) throw new Error(data.error || 'Failed to roll weather');

    const resultDiv = document.getElementById('weatherResult');
    resultDiv.innerHTML = `
      <div class="result">
        <strong>${data.previousWeather} → ${data.newWeather}</strong><br>
        <em>${data.description}</em><br><br>
        <strong>Visibility:</strong> Day: ${data.effects.visibilityDaylight}m, 
        Dark: ${data.effects.visibilityDarkness}m, Moon: ${data.effects.visibilityDarknessMoon}m<br>
        <strong>Modifiers:</strong> Attack: ${data.effects.attackModifier > 0 ? '+' : ''}${data.effects.attackModifier}, 
        March: ${data.effects.marchModifier > 0 ? '+' : ''}${data.effects.marchModifier}, 
        Drive: ${data.effects.driveModifier > 0 ? '+' : ''}${data.effects.driveModifier}<br>
        <strong>Duration:</strong> ${data.effects.duration === Infinity ? 'Until next roll' : data.effects.duration + ' shift(s)'}
      </div>
    `;
  } catch (err) {
    document.getElementById('weatherResult').innerHTML = 
      `<div class="result error">Error: ${err.message}</div>`;
  }
}

/**
 * Calculate travel distance
 */
async function calculateDistance() {
  if (!campaignId) {
    showError('Campaign not loaded');
    return;
  }

  const movement = document.getElementById('movementType').value;
  const terrain = document.getElementById('terrain').value;
  const shifts = parseInt(document.getElementById('shiftsCount').value);

  try {
    const response = await fetch(`/api/campaigns/${campaignId}/travel/distance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movement, terrain, shifts }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();

    if (!data.success) throw new Error(data.error || 'Failed to calculate distance');

    const resultDiv = document.getElementById('distanceResult');
    resultDiv.innerHTML = `
      <div class="result">
        <strong>${data.movement.charAt(0).toUpperCase() + data.movement.slice(1)} - ${data.terrain}</strong><br>
        <strong>${data.shiftsCount} shift(s):</strong> ${data.hexesTraveled} hexes (${data.kilometersTraveled}km)
      </div>
    `;
  } catch (err) {
    document.getElementById('distanceResult').innerHTML = 
      `<div class="result error">Error: ${err.message}</div>`;
  }
}

/**
 * Calculate fuel consumption
 */
async function calculateFuel() {
  if (!campaignId) {
    showError('Campaign not loaded');
    return;
  }

  const fuelType = document.getElementById('fuelType').value;
  const hexesTraveled = parseInt(document.getElementById('hexesTraveled').value);

  try {
    const response = await fetch(`/api/campaigns/${campaignId}/travel/fuel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fuelType, hexesTraveled }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();

    if (!data.success) throw new Error(data.error || 'Failed to calculate fuel');

    const resultDiv = document.getElementById('fuelResult');
    resultDiv.innerHTML = `
      <div class="result">
        <strong>${data.fuelType}:</strong> ${data.hexesTraveled} hexes = 
        <span class="status-ok">${data.literConsumed} liters</span>
      </div>
    `;
  } catch (err) {
    document.getElementById('fuelResult').innerHTML = 
      `<div class="result error">Error: ${err.message}</div>`;
  }
}

/**
 * Calculate rations needed
 */
async function calculateRations() {
  if (!campaignId) {
    showError('Campaign not loaded');
    return;
  }

  const type = document.getElementById('rationType').value;
  const personCount = parseInt(document.getElementById('personCount').value);
  const days = parseInt(document.getElementById('daysCount').value);

  try {
    const response = await fetch(`/api/campaigns/${campaignId}/travel/rations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, personCount, days }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();

    if (!data.success) throw new Error(data.error || 'Failed to calculate rations');

    const resultDiv = document.getElementById('rationResult');
    resultDiv.innerHTML = `
      <div class="result">
        <strong>${data.type}:</strong> ${data.personCount} people × ${data.days} days = 
        <span class="status-ok">${data.rationCount} rations</span>
      </div>
    `;
  } catch (err) {
    document.getElementById('rationResult').innerHTML = 
      `<div class="result error">Error: ${err.message}</div>`;
  }
}

/**
 * Get terrain modifier
 */
async function getTerrainMod() {
  if (!campaignId) {
    showError('Campaign not loaded');
    return;
  }

  const terrain = document.getElementById('modTerrain').value;
  const task = document.getElementById('modTask').value;

  try {
    const response = await fetch(`/api/campaigns/${campaignId}/travel/terrain-modifier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terrain, task }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();

    if (!data.success) throw new Error(data.error || 'Failed to get modifier');

    const resultDiv = document.getElementById('modResult');
    const statusClass = data.modifier > 0 ? 'status-ok' : (data.modifier < 0 ? 'status-warning' : '');
    resultDiv.innerHTML = `
      <div class="result">
        <strong>${data.terrain} / ${data.task}:</strong> 
        <span class="${statusClass}">${data.modifier > 0 ? '+' : ''}${data.modifier}</span>
      </div>
    `;
  } catch (err) {
    document.getElementById('modResult').innerHTML = 
      `<div class="result error">Error: ${err.message}</div>`;
  }
}

/**
 * Get encounter distance in shift
 */
async function getEncounterDist() {
  if (!campaignId) {
    showError('Campaign not loaded');
    return;
  }

  const hexesTraveledPerShift = parseInt(document.getElementById('hexPerShift').value);
  const shiftsCount = parseInt(document.getElementById('shiftsEncounter').value);

  try {
    const response = await fetch(`/api/campaigns/${campaignId}/travel/encounter-distance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hexesTraveledPerShift, shiftsCount }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();

    if (!data.success) throw new Error(data.error || 'Failed to calculate distance');

    const resultDiv = document.getElementById('encounterResult');
    resultDiv.innerHTML = `
      <div class="result">
        <strong>Encounter at:</strong> ${data.encounterHexDistance} hexes 
        (${data.shiftsCount * data.hexesTraveledPerShift} total hexes)
      </div>
    `;
  } catch (err) {
    document.getElementById('encounterResult').innerHTML = 
      `<div class="result error">Error: ${err.message}</div>`;
  }
}
