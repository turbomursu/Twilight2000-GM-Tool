const assert = require("node:assert/strict");
const test = require("node:test");
const { describeWeatherEffects, resolveWeatherRoll } = require("../weather-rules.js");

test("Fair and cloudy weather provide the cited darkness visibility", () => {
  assert.match(describeWeatherEffects("Fair"), /100 m.*150 m with a full moon/);
  assert.match(describeWeatherEffects("Cloudy"), /50 m/);
});

test("Rain and snow derive the cited visibility, attack, marching, driving, and duration effects", () => {
  const effects = describeWeatherEffects("Rain/Snow");
  assert.match(effects, /200 m in daylight or 50 m in darkness/);
  assert.match(effects, /Ranged attacks: -1/);
  assert.match(effects, /Stamina check/);
  assert.match(effects, /Driving rolls: -2/);
  assert.match(effects, /After one shift, return to Cloudy/);
});

test("GM-defined weather does not receive guessed rules effects", () => {
  assert.match(describeWeatherEffects("Dense smoke"), /No automatic Fourth Edition effect/);
});

test("weather d6 result maps 1 to worsens and 6 to improves; 2-5 hold", () => {
  assert.deepEqual(resolveWeatherRoll("Cloudy", 6), {
    roll: 6, previousWeather: "Cloudy", weather: "Fair", direction: "improves", changed: true
  });
  assert.deepEqual(resolveWeatherRoll("Cloudy", 4), {
    roll: 4, previousWeather: "Cloudy", weather: "Cloudy", direction: "holds", changed: false
  });
  assert.deepEqual(resolveWeatherRoll("Cloudy", 1, "worsens"), {
    roll: 1, previousWeather: "Cloudy", weather: "Rain/Snow", direction: "worsens", changed: true
  });
  assert.equal(resolveWeatherRoll("Fair", 6).weather, "Fair");
  assert.equal(resolveWeatherRoll("Rain/Snow", 1).weather, "Rain/Snow");
  assert.throws(() => resolveWeatherRoll("Dense smoke", 1), /verified weather condition/);
  assert.throws(() => resolveWeatherRoll("Fair", 7), /d6 result/);
  assert.throws(() => resolveWeatherRoll("Fair", 2, "worsens"), /does not match/);
});
