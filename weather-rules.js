(function initializeWeatherRules(global) {
  const effects = Object.freeze({
    Fair: "Darkness visibility is 100 m, or 150 m with a full moon.",
    Cloudy: "Darkness visibility is 50 m.",
    "Rain/Snow": "Visibility is about 200 m in daylight or 50 m in darkness. Ranged attacks: -1. Marching requires a Stamina check. Driving rolls: -2. After one shift, return to Cloudy for at least one shift."
  });

  function describeWeatherEffects(condition) {
    return effects[condition] || "No automatic Fourth Edition effect is mapped to this GM-defined condition.";
  }

  function weatherOutcomeForRoll(roll) {
    if (!Number.isSafeInteger(roll) || roll < 1 || roll > 6) throw new Error("Weather roll must be a d6 result from 1 to 6.");
    return roll === 1 ? "worsens" : roll === 6 ? "improves" : "holds";
  }

  function resolveWeatherRoll(condition, roll, outcome) {
    const progression = ["Fair", "Cloudy", "Rain/Snow"];
    const currentIndex = progression.indexOf(condition);
    if (currentIndex < 0) throw new Error("Weather rolls require a verified weather condition.");
    const expected = weatherOutcomeForRoll(roll);
    if (outcome !== undefined && outcome !== expected) throw new Error("Weather outcome does not match the d6 result: 1 worsens, 6 improves.");
    outcome = expected;
    const direction = outcome;
    const nextIndex = Math.max(0, Math.min(progression.length - 1, currentIndex + (outcome === "improves" ? -1 : outcome === "worsens" ? 1 : 0)));
    return { roll, previousWeather: condition, weather: progression[nextIndex], direction, changed: nextIndex !== currentIndex };
  }

  const api = Object.freeze({ describeWeatherEffects, resolveWeatherRoll, weatherOutcomeForRoll });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.FieldbookWeatherRules = api;
})(globalThis);
