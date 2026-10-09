(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ProgressMetrics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const shift = (day, offset) =>
    new Date(Date.parse(day + "T12:00:00Z") + offset * 86400000)
      .toISOString()
      .slice(0, 10);
  function period(history, today, length, offset = 0) {
    const end = shift(today, -offset),
      start = shift(end, -(length - 1));
    const days = Array.from({ length }, (_, i) => {
      const key = shift(start, i),
        entry = history.find((h) => h.date === key);
      return { key, history: entry, logged: Boolean(entry?.mealCount) };
    });
    const logged = days.filter((d) => d.logged);
    const averages = Object.fromEntries(
      ["calories", "protein", "carbs", "fat"].map((k) => [
        k,
        logged.length
          ? logged.reduce((s, d) => s + d.history.totals[k], 0) / logged.length
          : null,
      ]),
    );
    return { start, end, days, loggedDays: logged.length, averages };
  }
  function compare(history, today, length) {
    const current = period(history, today, length),
      previous = period(history, today, length, length);
    const delta = Object.fromEntries(
      ["calories", "protein"].map((k) => [
        k,
        current.averages[k] === null || previous.averages[k] === null
          ? null
          : current.averages[k] - previous.averages[k],
      ]),
    );
    return { current, previous, delta };
  }
  return { shift, period, compare };
});
