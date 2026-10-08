/**
 * planner.js — Smart Diet Planner
 * BMR/TDEE calculations via Mifflin-St Jeor formula.
 * Macro targets for cutting, bulking, and maintenance.
 * Pure calculations shared by server and browser. Plans are saved per account in the database.
 */
(function () {
  "use strict";


  const ACTIVITY = {
    sedentary:         { label: "Sedentary (desk job, no exercise)",      mul: 1.2   },
    lightly_active:    { label: "Lightly active (1–3 days / week)",        mul: 1.375 },
    moderately_active: { label: "Moderately active (3–5 days / week)",     mul: 1.55  },
    very_active:       { label: "Very active (6–7 days / week)",           mul: 1.725 },
    extra_active:      { label: "Extra active (physical job + training)",   mul: 1.9   },
  };

  // ── BMR (Mifflin-St Jeor) ──────────────────────────────────────────────────
  function calcBMR(weight, heightCm, age, gender) {
    const base = 10 * weight + 6.25 * heightCm - 5 * age;
    return gender === "female" ? base - 161 : base + 5;
  }

  // ── TDEE ───────────────────────────────────────────────────────────────────
  function calcTDEE(bmr, activityLevel) {
    const mul = ACTIVITY[activityLevel]?.mul ?? 1.55;
    return bmr * mul;
  }

  // ── Full Plan ──────────────────────────────────────────────────────────────
  function calcPlan(inputs) {
    const {
      currentWeight, targetWeight, gender, age, heightCm,
      goal, activityLevel, durationWeeks,
    } = inputs;

    const bmr  = Math.round(calcBMR(currentWeight, heightCm, age, gender));
    const tdee = Math.round(calcTDEE(bmr, activityLevel));

    // Calorie adjustment
    const DEFICITS = { cutting: -400, bulking: 350, maintenance: 0 };
    const adjustment    = DEFICITS[goal] ?? 0;
    const targetCalories = Math.max(1000, Math.round(tdee + adjustment));

    // Expected weekly weight change (7700 kcal ≈ 1 kg)
    const weeklyChange = +((adjustment * 7) / 7700).toFixed(2);

    // Protein target
    const proteinPerKg = goal === "cutting" ? 2.2 : goal === "bulking" ? 1.8 : 1.6;
    const targetProtein = Math.round(currentWeight * proteinPerKg);

    // Fat target (25 % of calories)
    const targetFat = Math.round((targetCalories * 0.25) / 9);

    // Carbs from remaining calories
    const carbCals  = Math.max(0, targetCalories - targetProtein * 4 - targetFat * 9);
    const targetCarbs = Math.round(carbCals / 4);

    // ── Validation ────────────────────────────────────────────────────────
    let warning = null;
    let isRealistic = true;

    if (goal === "cutting") {
      if (targetCalories < 1200) {
        warning = "Target calories are below 1 200 kcal. Increase the duration or choose a less aggressive deficit.";
        isRealistic = false;
      } else if (Math.abs(weeklyChange) > 1.0) {
        warning = "Expected loss exceeds 1 kg/week — this is aggressive. A longer timeframe is healthier.";
        isRealistic = false;
      }
    } else if (goal === "bulking" && weeklyChange > 0.5) {
      warning = "Expected gain exceeds 0.5 kg/week — you may accumulate excess fat. Consider a smaller surplus.";
      isRealistic = false;
    }

    const weightDiff    = Math.abs(targetWeight - currentWeight);
    const ratePerWeek   = Math.abs(weeklyChange) || 0.001;
    const expectedWeeks = Math.ceil(weightDiff / ratePerWeek);

    if (durationWeeks > 0 && goal !== "maintenance" && expectedWeeks > durationWeeks * 1.5) {
      warning = `At this rate, reaching ${targetWeight} kg takes ~${expectedWeeks} weeks — you set ${durationWeeks}.`;
      isRealistic = false;
    }

    return {
      bmr,
      tdee,
      targetCalories,
      targetProtein,
      targetCarbs,
      targetFat,
      weeklyChange,
      expectedWeeks: goal === "maintenance" ? 0 : expectedWeeks,
      isRealistic,
      warning,
      adjustment,
    };
  }

  function isActive(plan) {
    if (!plan) return false;
    if (!plan.endDate) return true;
    const today = new Date().toISOString().slice(0, 10);
    return today <= plan.endDate;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  const api = { calcPlan, isActive, ACTIVITY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.Planner = api;
})();
