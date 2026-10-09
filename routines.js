const crypto = require("node:crypto");
const {
  InputError,
  sanitizeNutrition,
  sanitizeProfile,
} = require("./features");
const TYPES = ["Breakfast", "Lunch", "Dinner", "Snack", "Custom"];
const UNITS = ["g", "kg", "ml", "l", "piece", "tsp", "tbsp", "cup"];
const INTENTS = ["muscle", "weight", "training", "habits"];
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function amount(v, min, max, label) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new InputError(`Enter a valid ${label} (${min}–${max}).`);
  return v;
}
function dateKey(v) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw new InputError("Choose a valid date.");
  return v;
}
function shiftDate(day, offset) {
  return new Date(Date.parse(dateKey(day)) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
}
function validateRecipe(body) {
  if (
    !text(body.name, 120) ||
    !Array.isArray(body.ingredients) ||
    !body.ingredients.length ||
    body.ingredients.length > 30
  )
    throw new InputError("Name the recipe and add 1–30 ingredients.");
  return {
    name: text(body.name, 120),
    notes: text(body.notes, 2000),
    servings: amount(body.servings, 0.25, 100, "recipe yield"),
    ...sanitizeNutrition(body),
    ingredients: body.ingredients.map((i) => {
      if (!i || !text(i.food, 160) || !UNITS.includes(i.unit))
        throw new InputError(
          "Each ingredient needs a name and a supported unit.",
        );
      return {
        food: text(i.food, 160),
        quantity: amount(i.quantity, 0.001, 100000, "ingredient quantity"),
        unit: i.unit,
      };
    }),
  };
}
function recipeDraft(recipe, servings, type = "Custom") {
  amount(servings, 0.25, 50, "portion");
  const factor = servings / recipe.servings;
  return {
    name: recipe.name,
    type,
    description:
      `${servings} serving${servings === 1 ? "" : "s"} of ${recipe.name}.\n${recipe.ingredients.map((i) => `${+(i.quantity * factor).toFixed(3)} ${i.unit} ${i.food}`).join(", ")}${recipe.notes ? "\n" + recipe.notes : ""}`.slice(
        0,
        2000,
      ),
    ...Object.fromEntries(
      ["calories", "protein", "carbs", "fat"].map((k) => [
        k,
        +(recipe[k] * factor).toFixed(2),
      ]),
    ),
    ingredients: [],
    source: "saved-meal",
  };
}
function shoppingList(data, userId, week) {
  const end = shiftDate(week, 6),
    ingredients = new Map();
  const entries = data.menuEntries
    .filter((e) => e.userId === userId && e.date >= week && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const recipes = data.recipes.filter((r) => r.userId === userId);
  for (const entry of entries) {
    const recipe = recipes.find((r) => r.id === entry.recipeId);
    if (!recipe) continue;
    for (const item of recipe.ingredients) {
      const unit =
        item.unit === "kg" ? "g" : item.unit === "l" ? "ml" : item.unit;
      const quantity =
        ((item.quantity * entry.servings) / recipe.servings) *
        (["kg", "l"].includes(item.unit) ? 1000 : 1);
      const name = item.food.normalize("NFKC").trim().replace(/\s+/g, " ");
      const key = JSON.stringify([name.toLowerCase(), unit]);
      const existing = ingredients.get(key) || {
        food: name,
        quantity: 0,
        unit,
      };
      existing.quantity += quantity;
      ingredients.set(key, existing);
    }
  }
  const items = [...ingredients.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, i]) => {
      const quantity = +i.quantity.toFixed(3);
      // A quantity change invalidates a checkmark from an older shopping list.
      return {
        ...i,
        quantity,
        id: crypto
          .createHash("sha256")
          .update(key + ":" + quantity)
          .digest("hex")
          .slice(0, 24),
      };
    });
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(items))
    .digest("hex");
  const checked = data.shoppingByUser[userId]?.[week]?.checked || [];
  return {
    week,
    end,
    entries,
    recipes,
    fingerprint,
    items: items.map((i) => ({ ...i, checked: checked.includes(i.id) })),
  };
}
async function handleRoutines(req, res, url, h) {
  const route = url.pathname,
    method = req.method;
  if (
    !["/api/setup", "/api/recipes", "/api/menu", "/api/shopping"].includes(
      route,
    ) &&
    !/^\/api\/(recipes|menu)\/[^/]+$/.test(route)
  )
    return false;
  const session = h.requireSession(req, res);
  if (!session) return true;
  const data = h.readData(),
    id = session.user.id,
    today = h.getUserTodayDateKey(session.account);
  const body = ["GET", "HEAD"].includes(method)
    ? {}
    : await h.readJsonBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new InputError("Send a JSON object.");
  if (route === "/api/setup" && method === "GET") {
    h.sendJson(res, 200, { setup: data.setupByUser[id] || null });
    return true;
  }
  if (route === "/api/setup" && method === "PUT") {
    if (!INTENTS.includes(body.intent))
      throw new InputError("Choose your focus.");
    if (
      !body.profile ||
      typeof body.profile !== "object" ||
      Array.isArray(body.profile)
    )
      throw new InputError("Include your food preferences.");
    const profile = sanitizeProfile(body.profile),
      goals = sanitizeNutrition(body.goals || {});
    if (!goals.calories)
      throw new InputError("Enter a calorie target greater than zero.");
    const targetsChanged = Object.entries(goals).some(
      ([key, value]) => value !== data.goalsByUser[id]?.[key],
    );
    data.profilesByUser[id] = profile;
    data.goalsByUser[id] = goals;
    if (targetsChanged) delete data.plansByUser[id];
    data.setupByUser[id] = {
      intent: body.intent,
      savedAt: new Date().toISOString(),
    };
    h.syncTodayGoalSnapshot(data, id, today);
    h.writeData(data);
    h.sendJson(res, 200, { setup: data.setupByUser[id], profile, goals });
    return true;
  }
  if (route === "/api/recipes" && method === "GET") {
    h.sendJson(res, 200, {
      recipes: data.recipes.filter((r) => r.userId === id),
    });
    return true;
  }
  if (route === "/api/recipes" && method === "POST") {
    if (data.recipes.filter((r) => r.userId === id).length >= 100)
      throw new InputError("You can save up to 100 recipes.");
    const recipe = {
      ...validateRecipe(body),
      id: crypto.randomUUID(),
      userId: id,
      updatedAt: new Date().toISOString(),
    };
    data.recipes.unshift(recipe);
    h.writeData(data);
    h.sendJson(res, 201, { recipe });
    return true;
  }
  if (route.startsWith("/api/recipes/")) {
    const recipe = data.recipes.find(
      (r) => r.id === route.split("/").pop() && r.userId === id,
    );
    if (!recipe) throw new InputError("Recipe not found.", 404);
    if (method === "PUT") {
      Object.assign(recipe, validateRecipe(body), {
        updatedAt: new Date().toISOString(),
      });
      h.writeData(data);
      h.sendJson(res, 200, { recipe });
      return true;
    }
    if (method === "DELETE") {
      if (
        data.menuEntries.some(
          (e) => e.userId === id && e.recipeId === recipe.id,
        )
      )
        throw new InputError(
          "Remove this recipe from your menu before deleting it.",
          409,
        );
      data.recipes = data.recipes.filter((r) => r !== recipe);
      h.writeData(data);
      h.sendJson(res, 200, { ok: true });
      return true;
    }
  }
  if (route === "/api/menu" && method === "POST") {
    const date = dateKey(body.date),
      recipe = data.recipes.find(
        (r) => r.id === body.recipeId && r.userId === id,
      );
    if (!recipe) throw new InputError("Choose one of your saved recipes.", 404);
    if (date < shiftDate(today, -365) || date > shiftDate(today, 365))
      throw new InputError("Choose a menu date within one year of today.");
    if (!TYPES.includes(body.type)) throw new InputError("Choose a meal type.");
    const servings = amount(body.servings, 0.25, 50, "planned servings");
    if (
      typeof body.requestId !== "string" ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(body.requestId)
    )
      throw new InputError("A valid request ID is required.");
    const prior = data.menuEntries.find(
      (e) => e.userId === id && e.requestId === body.requestId,
    );
    if (prior) {
      if (
        prior.recipeId !== recipe.id ||
        prior.date !== date ||
        prior.type !== body.type ||
        prior.servings !== servings
      )
        throw new InputError("That request ID was already used.", 409);
      h.sendJson(res, 200, { entry: prior });
      return true;
    }
    if (data.menuEntries.filter((e) => e.userId === id).length >= 500)
      throw new InputError(
        "Remove old menu entries before adding more (500 maximum).",
      );
    const entry = {
      id: crypto.randomUUID(),
      userId: id,
      recipeId: recipe.id,
      date,
      type: body.type,
      servings,
      requestId: body.requestId,
    };
    data.menuEntries.push(entry);
    h.writeData(data);
    h.sendJson(res, 201, { entry });
    return true;
  }
  if (route.startsWith("/api/menu/") && method === "DELETE") {
    const entry = data.menuEntries.find(
      (e) => e.userId === id && e.id === route.split("/").pop(),
    );
    if (!entry) throw new InputError("Menu entry not found.", 404);
    data.menuEntries = data.menuEntries.filter((e) => e !== entry);
    h.writeData(data);
    h.sendJson(res, 200, { ok: true });
    return true;
  }
  if (route === "/api/shopping" || route === "/api/menu") {
    const week = dateKey(
      method === "GET" ? url.searchParams.get("week") || today : body.week,
    );
    const list = shoppingList(data, id, week);
    if (method === "GET") {
      h.sendJson(res, 200, list);
      return true;
    }
    if (route === "/api/shopping" && method === "PATCH") {
      if (body.fingerprint !== list.fingerprint)
        throw new InputError(
          "Your menu changed. Refresh the shopping list before checking items.",
          409,
        );
      if (
        !Array.isArray(body.checked) ||
        body.checked.length > list.items.length ||
        body.checked.some((v) => !list.items.some((i) => i.id === v))
      )
        throw new InputError("Choose items from this shopping list.");
      data.shoppingByUser[id] ||= {};
      const weeks = data.shoppingByUser[id];
      weeks[week] = {
        checked: [...new Set(body.checked)],
        updatedAt: new Date().toISOString(),
      };
      const keys = Object.keys(weeks).sort();
      while (keys.length > 60) delete weeks[keys.shift()];
      h.writeData(data);
      h.sendJson(res, 200, shoppingList(data, id, week));
      return true;
    }
  }
  h.sendJson(res, 405, { error: "Method not allowed." });
  return true;
}
module.exports = {
  handleRoutines,
  validateRecipe,
  recipeDraft,
  shoppingList,
  shiftDate,
};
