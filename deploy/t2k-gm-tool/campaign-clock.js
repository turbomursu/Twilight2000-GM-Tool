(function (root, factory) {
  const clock = factory();
  if (typeof module === "object" && module.exports) module.exports = clock;
  else root.FieldbookClock = clock;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function validTime(value) { return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
  function advanceSixHours(clock) {
    const time = clock.gameTime ?? "00:00";
    if (!validTime(time) || typeof clock.gameDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(clock.gameDate)
      || !Number.isSafeInteger(clock.dayNumber) || clock.dayNumber < 0) throw new Error("Invalid campaign clock.");
    const start = new Date(`${clock.gameDate}T${time}:00Z`);
    if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== clock.gameDate) throw new Error("Invalid campaign date.");
    const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
    const gameDate = end.toISOString().slice(0, 10);
    const dayNumber = clock.dayNumber + (gameDate === clock.gameDate ? 0 : 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate) || !Number.isSafeInteger(dayNumber)) throw new Error("Campaign clock exceeds storage bounds.");
    return { gameDate, gameTime: end.toISOString().slice(11, 16), dayNumber };
  }
  function middayForAdvance(clock) {
    const next = advanceSixHours(clock);
    return next.gameDate === clock.gameDate && (clock.gameTime ?? "00:00") < "12:00" && next.gameTime >= "12:00" ? next.gameDate : null;
  }
  return { validTime, advanceSixHours, middayForAdvance };
});