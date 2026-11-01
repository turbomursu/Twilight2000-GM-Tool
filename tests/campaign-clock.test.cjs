const assert = require("node:assert/strict");
const test = require("node:test");
const { advanceSixHours, middayForAdvance } = require("../campaign-clock.js");
const { openRuntimeDatabase, advanceRuntimeTime, rollRuntimeWeather, getRuntimeDashboard, updateRuntimeDashboard, exportRuntimeSave, restoreRuntimeSave } = require("../server/runtime-store.cjs");
const { seedSampleRuntime } = require("../server/sample-data.cjs");
const { listAuditEvents } = require("../server/audit.cjs");

test("six-hour clock steps cross midnight/month/year without deriving rules effects", () => {
  assert.equal(middayForAdvance({ gameDate: "2000-05-11", gameTime: "06:00", dayNumber: 1 }), "2000-05-11");
  assert.equal(middayForAdvance({ gameDate: "2000-05-11", gameTime: "09:30", dayNumber: 1 }), "2000-05-11");
  assert.equal(middayForAdvance({ gameDate: "2000-05-11", gameTime: "12:00", dayNumber: 1 }), null);
  let clock = { gameDate: "2000-12-31", gameTime: "00:00", dayNumber: 14 };
  for (const time of ["06:00", "12:00", "18:00"]) {
    clock = advanceSixHours(clock); assert.equal(clock.gameTime, time); assert.equal(clock.dayNumber, 14);
  }
  assert.deepEqual(advanceSixHours(clock), { gameDate: "2001-01-01", gameTime: "00:00", dayNumber: 15 });
  assert.deepEqual(advanceSixHours({ gameDate: "2000-02-28", gameTime: "21:45", dayNumber: 1 }), { gameDate: "2000-02-29", gameTime: "03:45", dayNumber: 2 });
  assert.throws(() => advanceSixHours({ gameDate: "2000-02-30", gameTime: "00:00", dayNumber: 1 }), /Invalid/);
});

test("midday consumes one ration-day once per date and recovery preserves the daily schedule", () => {
  const database = openRuntimeDatabase();
  try {
    const timestamp = new Date().toISOString();
    database.prepare(`INSERT INTO accounts (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
      VALUES ('midday-gm', 'midday-gm', 'test-only', 0, ?, ?, 'gm')`).run(timestamp, timestamp);
    const { campaignId } = seedSampleRuntime(database, "midday-gm");
    const initial = getRuntimeDashboard(database, "midday-gm", campaignId);
    const advance = () => advanceRuntimeTime(database, "midday-gm", campaignId, { expectedRevision: getRuntimeDashboard(database, "midday-gm", campaignId).campaign.revision });
    const morning = advance(); assert.equal(morning.dashboard.rationsDays, initial.dashboard.rationsDays);
    database.exec("CREATE TRIGGER fail_midday_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'midday audit failure'); END;");
    assert.throws(() => advance(), /midday audit failure/);
    assert.deepEqual(getRuntimeDashboard(database, "midday-gm", campaignId), morning);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM daily_supply_usage").get().count, 0);
    database.exec("DROP TRIGGER fail_midday_audit");
    const noon = advance(); assert.equal(noon.dashboard.gameTime, "12:00"); assert.equal(noon.dashboard.rationsDays, initial.dashboard.rationsDays - 1);
    const backup = exportRuntimeSave(database, "midday-gm", campaignId);
    assert.equal(advance().dashboard.rationsDays, noon.dashboard.rationsDays);
    const midnight = advance(); assert.equal(midnight.dashboard.gameTime, "00:00"); assert.equal(midnight.dashboard.dayNumber, initial.dashboard.dayNumber + 1);
    restoreRuntimeSave(database, "midday-gm", campaignId, backup, { expectedRevision: midnight.campaign.revision, confirmReplace: true, confirmOlderBackup: true });
    assert.equal(getRuntimeDashboard(database, "midday-gm", campaignId).dashboard.gameTime, "12:00");
    updateRuntimeDashboard(database, "midday-gm", campaignId, { expectedRevision: getRuntimeDashboard(database, "midday-gm", campaignId).campaign.revision, dashboard: { gameTime: "06:00" } });
    assert.equal(advance().dashboard.rationsDays, noon.dashboard.rationsDays);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM daily_supply_usage WHERE campaign_id = ?").get(campaignId).count, 1);
    updateRuntimeDashboard(database, "midday-gm", campaignId, { expectedRevision: getRuntimeDashboard(database, "midday-gm", campaignId).campaign.revision, dashboard: { gameDate: "2000-05-12", gameTime: "06:00", rationsDays: 0 } });
    const empty = advance(); assert.equal(empty.dashboard.rationsDays, 0);
    assert.equal(database.prepare("SELECT ration_days_used FROM daily_supply_usage WHERE campaign_id = ? AND game_date = '2000-05-12'").get(campaignId).ration_days_used, 0);
    assert.equal(empty.dashboard.fuelUnits, initial.dashboard.fuelUnits);
  } finally { database.close(); }
});

test("GM time advances are atomic, revision-checked, and do not consume supplies before midday", () => {
  const database = openRuntimeDatabase();
  try {
    const timestamp = new Date().toISOString();
    database.prepare(`INSERT INTO accounts (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
      VALUES ('clock-gm', 'clock-gm', 'test-only', 0, ?, ?, 'gm')`).run(timestamp, timestamp);
    const { campaignId } = seedSampleRuntime(database, "clock-gm");
    const initial = getRuntimeDashboard(database, "clock-gm", campaignId);
    const next = advanceRuntimeTime(database, "clock-gm", campaignId, { expectedRevision: initial.campaign.revision });
    assert.equal(next.dashboard.gameTime, "06:00"); assert.equal(next.dashboard.dayNumber, initial.dashboard.dayNumber);
    for (const field of ["rationsDays", "fuelUnits", "distanceKm"]) assert.equal(next.dashboard[field], initial.dashboard[field]);
    assert.equal(next.journal.length, initial.journal.length + 1);
    assert.throws(() => advanceRuntimeTime(database, "clock-gm", campaignId, { expectedRevision: initial.campaign.revision }), /revision changed/);
    assert.throws(() => advanceRuntimeTime(database, "other-gm", campaignId, { expectedRevision: next.campaign.revision }), /not found/);
    database.exec("CREATE TRIGGER fail_clock_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'clock audit failure'); END;");
    assert.throws(() => advanceRuntimeTime(database, "clock-gm", campaignId, { expectedRevision: next.campaign.revision }), /clock audit failure/);
    assert.deepEqual(getRuntimeDashboard(database, "clock-gm", campaignId), next);
  } finally { database.close(); }
});

test("weather rolls are once per shift and Rain/Snow returns to Cloudy for one recoverable shift", () => {
  const database = openRuntimeDatabase();
  try {
    const timestamp = new Date().toISOString();
    database.prepare(`INSERT INTO accounts (id, login_identifier, password_hash, disabled, created_at, updated_at, global_role)
      VALUES ('weather-gm', 'weather-gm', 'test-only', 0, ?, ?, 'gm')`).run(timestamp, timestamp);
    const { campaignId } = seedSampleRuntime(database, "weather-gm");
    let runtime = getRuntimeDashboard(database, "weather-gm", campaignId);
    updateRuntimeDashboard(database, "weather-gm", campaignId, {
      expectedRevision: runtime.campaign.revision, dashboard: { weather: "Cloudy" }
    });
    runtime = getRuntimeDashboard(database, "weather-gm", campaignId);
    const rolled = rollRuntimeWeather(database, "weather-gm", campaignId,
      { expectedRevision: runtime.campaign.revision, roll: 6, outcome: "worsens" });
    assert.equal(rolled.roll.weather, "Rain/Snow");
    assert.equal(rolled.runtime.dashboard.weatherLastRollShift, "2000-05-11T00:00");
    assert.match(rolled.runtime.journal[0].body, /D6 result 6.*Cloudy to Rain\/Snow/);
    assert.ok(listAuditEvents(database, "weather-gm", campaignId).events.some((event) => event.action === "weather.roll"));
    assert.throws(() => rollRuntimeWeather(database, "weather-gm", campaignId,
      { expectedRevision: rolled.runtime.campaign.revision, roll: 1, outcome: "improves" }), /already been rolled/);

    const rainyShiftEnded = advanceRuntimeTime(database, "weather-gm", campaignId,
      { expectedRevision: rolled.runtime.campaign.revision });
    assert.equal(rainyShiftEnded.dashboard.weather, "Cloudy");
    assert.equal(rainyShiftEnded.dashboard.weatherCloudyShiftsRemaining, 1);
    assert.match(rainyShiftEnded.journal[0].body, /returned to Cloudy for at least one full shift/);
    assert.ok(listAuditEvents(database, "weather-gm", campaignId).events.some((event) => event.action === "weather.duration"));
    assert.throws(() => rollRuntimeWeather(database, "weather-gm", campaignId,
      { expectedRevision: rainyShiftEnded.campaign.revision, roll: 6, outcome: "worsens" }), /remain Cloudy/);

    const backup = exportRuntimeSave(database, "weather-gm", campaignId);
    assert.equal(backup.data.dashboardState.weather_cloudy_shifts_remaining, 1);
    const cloudyShiftEnded = advanceRuntimeTime(database, "weather-gm", campaignId,
      { expectedRevision: rainyShiftEnded.campaign.revision });
    assert.equal(cloudyShiftEnded.dashboard.weatherCloudyShiftsRemaining, 0);
    restoreRuntimeSave(database, "weather-gm", campaignId, backup, {
      expectedRevision: cloudyShiftEnded.campaign.revision, confirmReplace: true, confirmOlderBackup: true
    });
    runtime = getRuntimeDashboard(database, "weather-gm", campaignId);
    assert.equal(runtime.dashboard.weatherCloudyShiftsRemaining, 1);
    const nextShift = advanceRuntimeTime(database, "weather-gm", campaignId, { expectedRevision: runtime.campaign.revision });
    const resumedRoll = rollRuntimeWeather(database, "weather-gm", campaignId,
      { expectedRevision: nextShift.campaign.revision, roll: 1, outcome: "improves" });
    assert.equal(resumedRoll.roll.weather, "Fair");
  } finally { database.close(); }
});