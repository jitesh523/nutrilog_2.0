/* Shared presentation rules. Missing logs never mean zero food intake. */
(function (root) {
  const keys = ["calories", "protein", "carbs", "fat"];
  function dayStatus(totals, goals, mealCount, isToday) {
    if (!mealCount) return { label: "Not logged", tone: "neutral", copy: "Log a meal when you're ready. Unlogged food isn't included in these totals." };
    if (totals.calories > goals.calories * 1.1) return { label: "Above calorie target", tone: "neutral", copy: "Your logged calories are above your target. This is information, not a failed day." };
    if (isToday) return { label: "Day in progress", tone: "neutral", copy: "These totals update as you log. There's no need to meet every target at every meal." };
    return { label: "Logged", tone: "neutral", copy: "Saved nutrition from your logged meals. A log may not include everything you ate." };
  }
  function scaleMeal(meal, multiplier) {
    const scaled = { ...meal };
    keys.forEach((key) => { scaled[key] = Math.round(Number(meal[key] || 0) * multiplier * 10) / 10; });
    scaled.ingredients = (meal.ingredients || []).map((item) => {
      const next = { ...item };
      [...keys, "grams", "displayAmount"].forEach((key) => {
        if (Number.isFinite(item[key])) next[key] = Math.round(item[key] * multiplier * 10) / 10;
      });
      return next;
    });
    return scaled;
  }
  function portionDetails(description) {
    let factor = 1;
    const text = String(description || '').replace(/\n?Portion: (\d+(?:\.\d+)?) × the described meal\./g, (_, amount) => {
      factor *= Number(amount); return '';
    }).trim();
    return { text, factor };
  }
  function describePortion(description, multiplier) {
    const details = portionDetails(description);
    const factor = Math.round(details.factor * multiplier * 10000) / 10000;
    return details.text + (factor === 1 ? '' : `\nPortion: ${factor} × the described meal.`);
  }
  const api = { keys, dayStatus, scaleMeal, portionDetails, describePortion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Nutrition = api;
})(typeof window !== "undefined" ? window : globalThis);
