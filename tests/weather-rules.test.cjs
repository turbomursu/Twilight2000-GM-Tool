const assert = require("node:assert/strict");
const test = require("node:test");
const { describeWeatherEffects } = require("../weather-rules.js");

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
