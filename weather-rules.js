(function initializeWeatherRules(global) {
  const effects = Object.freeze({
    Fair: "Darkness visibility is 100 m, or 150 m with a full moon.",
    Cloudy: "Darkness visibility is 50 m.",
    "Rain/Snow": "Visibility is about 200 m in daylight or 50 m in darkness. Ranged attacks: -1. Marching requires a Stamina check. Driving rolls: -2. After one shift, return to Cloudy for at least one shift."
  });

  function describeWeatherEffects(condition) {
    return effects[condition] || "No automatic Fourth Edition effect is mapped to this GM-defined condition.";
  }

  const api = Object.freeze({ describeWeatherEffects });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.FieldbookWeatherRules = api;
})(globalThis);
