(() => {
  if (!document.querySelector("#section-add-meal")) return;
  const $ = (s) => document.querySelector(s);
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (text, fn, cls = "ghost-btn") => {
    const b = el("button", text, cls);
    b.type = "button";
    b.onclick = fn;
    return b;
  };
  let owner = null,
    generation = 0,
    setup = null,
    recipes = [],
    menu = null,
    setupStep = 0,
    editingRecipe = null,
    menuAttempt = null,
    setupRevision = 0,
    recipeRevision = 0;
  const guide = el("section", undefined, "panel setup-card app-hidden");
  guide.id = "setup-card";
  guide.innerHTML =
    '<p class="eyebrow">YOUR FIRST REP</p><div class="panel-heading"><div><h2>Make this your routine.</h2><p id="setup-copy"></p></div><button id="start-setup" class="primary-btn" type="button">Start setup</button></div><ol id="setup-milestones" class="setup-milestones"></ol>';
  $("#section-dashboard .hero").after(guide);
  const setupSettings = el("section", undefined, "panel");
  setupSettings.innerHTML =
    '<h2>Your starting point</h2><p class="helper-copy">Revisit your focus, daily targets and food preferences whenever your routine changes.</p><button id="revisit-setup" class="ghost-btn" type="button">Open guided setup</button>';
  $("#section-settings .hero").after(setupSettings);
  const setupDialog = el("dialog", undefined, "upgrade-dialog routine-dialog");
  setupDialog.setAttribute("aria-labelledby", "setup-title");
  setupDialog.innerHTML = `<div class="panel-heading"><div><p id="setup-step-copy" class="eyebrow"></p><h2 id="setup-title">Your routine, your way.</h2></div><button type="button" class="ghost-btn" id="close-setup" aria-label="Close setup">×</button></div>
    <form id="setup-form"><fieldset data-setup-step="0"><label>Your focus<select id="setup-intent"><option value="muscle">Build muscle</option><option value="weight">Manage my weight</option><option value="training">Fuel my training</option><option value="habits">Build consistent habits</option></select></label><p class="helper-copy">Your focus helps describe your routine. Targets below are editable; choosing a focus does not calculate or change them.</p><div class="routine-fields"><label>Daily calories<input id="setup-calories" type="number" min="1" max="10000" step="any" required /></label><label>Protein (g)<input id="setup-protein" type="number" min="0" max="1000" step="any" required /></label><label>Carbs (g)<input id="setup-carbs" type="number" min="0" max="2000" step="any" required /></label><label>Fat (g)<input id="setup-fat" type="number" min="0" max="1000" step="any" required /></label></div><p class="helper-copy">Start from your current targets or edit them. For calculated targets, use Diet Plan. Saving setup applies these targets. Changing targets replaces an active calculated plan.</p></fieldset>
    <fieldset data-setup-step="1"><label>What should we call you?<input id="setup-name" maxlength="60" autocomplete="given-name" /></label><label>Food preference<select id="setup-diet"><option value="no-preference">No preference</option><option value="vegetarian">Vegetarian</option><option value="vegan">Vegan</option><option value="non-vegetarian">Non-vegetarian</option><option value="pescatarian">Pescatarian</option></select></label><label>Favourite cuisines<input id="setup-cuisines" maxlength="200" /></label><label>Allergies or ingredients to avoid<input id="setup-allergies" maxlength="300" placeholder="e.g. peanuts" /></label><div class="routine-fields"><label>Food budget<input id="setup-budget" maxlength="150" placeholder="e.g. ₹200 per meal" /></label><label>Cooking time (minutes)<input id="setup-time" type="number" min="5" max="180" step="1" required /></label></div><p class="helper-copy">Preferences are used by your coach. Always check ingredients when managing allergies.</p></fieldset>
    <fieldset data-setup-step="2"><p id="setup-review" class="helper-copy"></p><div class="setup-finish"><span aria-hidden="true">↗</span><h3>One meal is a strong start.</h3><p>Save your setup, then log a meal using the calculator, a photo estimate or values you already know. Review it before saving.</p></div></fieldset><p id="setup-feedback" class="feedback" role="status"></p><div class="button-row routine-footer"><button id="setup-back" class="ghost-btn" type="button">Back</button><button id="setup-next" class="primary-btn" type="button">Next</button><button id="setup-save" class="primary-btn" type="submit">Save & log a meal</button></div></form>`;
  document.body.append(setupDialog);
  const recipePanel = el("section", undefined, "panel recipe-panel");
  recipePanel.innerHTML =
    '<details><summary class="upgrade-summary">◈ Your recipes & portions</summary><div class="panel-heading"><div><p class="eyebrow">PREP ONCE. FUEL OFTEN.</p><h2>Recipes that fit your routine.</h2><p>Save ingredients and nutrition for a whole recipe, then choose your serving.</p></div><button id="new-recipe" class="primary-btn" type="button">New recipe</button></div><div id="recipe-list" class="recipe-grid"></div><p id="recipe-status" class="feedback" role="status"></p></details>';
  $("#usuals-panel").before(recipePanel);
  const recipeDialog = el("dialog", undefined, "upgrade-dialog routine-dialog");
  recipeDialog.setAttribute("aria-labelledby", "recipe-title");
  recipeDialog.innerHTML = `<div class="panel-heading"><h2 id="recipe-title">New recipe</h2><button id="close-recipe" class="ghost-btn" type="button" aria-label="Close recipe">×</button></div><form id="recipe-form"><div class="routine-fields"><label>Recipe name<input id="recipe-name" maxlength="120" required /></label><label>Makes (servings)<input id="recipe-servings" type="number" min="0.25" max="100" step="0.25" required value="2" /></label></div><h3>Ingredients for the whole recipe</h3><div id="recipe-ingredients"></div><button id="add-recipe-ingredient" class="ghost-btn" type="button">+ Ingredient</button><h3>Nutrition for the whole recipe</h3><p class="helper-copy">Enter the total for all servings, from your labels or an estimate. Nutrition scales with the portion you choose; ingredient names do not calculate it.</p><div class="routine-fields"><label>Calories<input id="recipe-calories" type="number" min="0" max="10000" step="any" required /></label><label>Protein (g)<input id="recipe-protein" type="number" min="0" max="1000" step="any" required /></label><label>Carbs (g)<input id="recipe-carbs" type="number" min="0" max="2000" step="any" required /></label><label>Fat (g)<input id="recipe-fat" type="number" min="0" max="1000" step="any" required /></label></div><label>Preparation notes (optional)<textarea id="recipe-notes" maxlength="2000" rows="3"></textarea></label><p class="helper-copy">Editing a recipe updates future menu and shopping calculations. Already logged meals keep their saved values.</p><p id="recipe-feedback" class="feedback" role="status"></p><button class="primary-btn" type="submit">Save recipe</button></form>`;
  document.body.append(recipeDialog);
  const fitDialogs = () =>
    document.documentElement.style.setProperty(
      "--routine-viewport-height",
      `${window.visualViewport?.height || window.innerHeight}px`,
    );
  window.visualViewport?.addEventListener("resize", fitDialogs);
  window.addEventListener("resize", fitDialogs);
  fitDialogs();
  const menuPanel = el("section", undefined, "panel menu-panel");
  menuPanel.innerHTML = `<p class="eyebrow">PLAN THE FUEL. DO THE WORK.</p><div class="panel-heading"><div><h2>Your weekly menu.</h2><p>Plan portions from saved recipes. Planning never adds a meal to your log.</p></div><button id="open-recipes" class="ghost-btn" type="button">Manage recipes</button></div><div class="week-picker"><button id="menu-prev" class="ghost-btn" type="button" aria-label="Previous week">←</button><label>Week starting<input id="menu-week" type="date" required /></label><button id="menu-next" class="ghost-btn" type="button" aria-label="Next week">→</button></div><form id="menu-form" class="menu-form"><label>Recipe<select id="menu-recipe" required></select></label><label>Day<select id="menu-day" required></select></label><label>Meal<select id="menu-type"><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snack</option><option>Custom</option></select></label><label>Servings<input id="menu-servings" type="number" min="0.25" max="50" step="0.25" required value="1" /></label><button class="primary-btn" type="submit">Add to menu</button></form><p id="menu-status" class="feedback" role="status"></p><div id="menu-days" class="menu-days"></div><div class="shopping-heading"><div><h3>Shopping list</h3><p class="helper-copy">Scaled to planned servings. Matching names combine in the same unit; kg/g and l/ml are converted. Other units stay separate. Recipe edits update this list.</p></div><button id="download-shopping" class="ghost-btn" type="button">Download list</button></div><div id="shopping-list" class="shopping-list"></div><p id="shopping-status" class="feedback" role="status"></p>`;
  $("#section-diet-plan").append(menuPanel);
  $("#section-diet-plan .hero").append(
    button("Plan my week & shopping", () => {
      menuPanel.scrollIntoView({ block: "start", behavior: "auto" });
      $("#menu-week").focus({ preventScroll: true });
    }),
  );
  const monday = (day) => {
    const weekday = new Date(day + "T12:00:00Z").getUTCDay();
    return ProgressMetrics.shift(day, -(weekday === 0 ? 6 : weekday - 1));
  };
  $("#menu-week").value = monday(getTodayDateKey());
  function same(v) {
    return v === generation && owner === state.currentUser?.id;
  }
  function setStep(step) {
    setupStep = step;
    document.querySelectorAll("[data-setup-step]").forEach((f) => {
      const active = Number(f.dataset.setupStep) === step;
      f.hidden = !active;
      f.querySelectorAll("input,select,textarea").forEach(
        (control) => (control.disabled = !active),
      );
    });
    $("#setup-step-copy").textContent =
      `STEP ${step + 1} OF 3 · ${["YOUR FOCUS", "YOUR FOOD", "YOUR FIRST MEAL"][step]}`;
    $("#setup-back").hidden = step === 0;
    $("#setup-next").hidden = step === 2;
    $("#setup-save").hidden = step !== 2;
    if (step === 2)
      $("#setup-review").textContent =
        `Ready to save ${$("#setup-calories").value} kcal, ${$("#setup-protein").value}g protein, ${$("#setup-carbs").value}g carbs and ${$("#setup-fat").value}g fat per day, plus your food preferences.`;
    setupDialog.scrollTop = 0;
    $("#setup-step-copy").setAttribute("tabindex", "-1");
    $("#setup-step-copy").focus({ preventScroll: true });
  }
  function openSetup() {
    $("#coach-widget").classList.contains("app-hidden") ||
      $("#chat-close").click();
    const p = state.profile || {};
    $("#setup-intent").value = setup?.intent || "habits";
    for (const key of Nutrition.keys)
      $("#setup-" + key).value = state.goals[key];
    for (const [key, field] of [
      ["name", "displayName"],
      ["diet", "dietaryPreference"],
      ["cuisines", "cuisines"],
      ["allergies", "allergies"],
      ["budget", "budget"],
      ["time", "cookingMinutes"],
    ])
      $("#setup-" + key).value =
        p[field] ??
        (key === "time" ? 30 : key === "diet" ? "no-preference" : "");
    $("#setup-feedback").textContent = "";
    setStep(0);
    setupDialog.showModal();
  }
  $("#start-setup").onclick = () => {
    if (setup) {
      showSection("add-meal");
      $("#meal-name").focus();
    } else openSetup();
  };
  $("#revisit-setup").onclick = openSetup;
  $("#close-setup").onclick = () => setupDialog.close();
  $("#setup-back").onclick = () => setStep(setupStep - 1);
  $("#setup-next").onclick = () => {
    if ($("#setup-form").reportValidity()) setStep(setupStep + 1);
  };
  $("#setup-form").onsubmit = async (e) => {
    e.preventDefault();
    if (setupStep !== 2) {
      $("#setup-next").click();
      return;
    }
    const v = generation,
      b = $("#setup-save");
    b.disabled = true;
    const goals = Object.fromEntries(
      Nutrition.keys.map((k) => [k, Number($("#setup-" + k).value)]),
    );
    const profile = {
      displayName: $("#setup-name").value,
      dietaryPreference: $("#setup-diet").value,
      cuisines: $("#setup-cuisines").value,
      allergies: $("#setup-allergies").value,
      budget: $("#setup-budget").value,
      cookingMinutes: Number($("#setup-time").value),
    };
    try {
      const saved = await apiRequest("/api/setup", {
        method: "PUT",
        body: { intent: $("#setup-intent").value, goals, profile },
      });
      if (!same(v)) return;
      setupRevision++;
      setup = saved.setup;
      state.profile = saved.profile;
      state.goals = saved.goals;
      state.plan = null;
      hydrateProfile();
      hydrateGoalForm();
      await Promise.all([loadDashboardData(), apiRequest("/api/setup")]);
      if (!same(v)) return;
      setupDialog.close();
      render();
      showSection("add-meal");
      $("#meal-name").focus();
      showToast("Setup saved. Your first meal is the next rep.");
    } catch (error) {
      if (same(v)) $("#setup-feedback").textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  function drawGuide() {
    const logged = state.history.some((d) => d.mealCount > 0);
    guide.classList.toggle("app-hidden", Boolean(setup && logged));
    $("#setup-copy").textContent = setup
      ? "Targets and preferences saved. Log a meal to complete your start."
      : "Three small steps: choose targets, save preferences and log a meal. Keep your current values or adjust them.";
    $("#start-setup").textContent = setup ? "Log a meal" : "Start setup";
    $("#setup-milestones").replaceChildren(
      ...[
        ["Targets", Boolean(setup)],
        ["Preferences", Boolean(setup)],
        ["First meal", logged],
      ].map(([label, done]) =>
        el("li", `${done ? "✓" : "○"} ${label}`, done ? "complete" : ""),
      ),
    );
  }
  function ingredientRow(item = { food: "", quantity: 1, unit: "g" }) {
    const row = el("div", undefined, "recipe-ingredient-row");
    row.innerHTML =
      '<label>Ingredient<input class="ingredient-food" maxlength="160" required placeholder="e.g. oats" /></label><label>Quantity<input class="ingredient-quantity" type="number" min="0.001" max="100000" step="any" required /></label><label>Unit<select class="ingredient-unit"><option>g</option><option>kg</option><option>ml</option><option>l</option><option>piece</option><option>tsp</option><option>tbsp</option><option>cup</option></select></label>';
    row.querySelector(".ingredient-food").value = item.food;
    row.querySelector(".ingredient-quantity").value = item.quantity;
    row.querySelector(".ingredient-unit").value = item.unit;
    row.append(button("Remove", () => row.remove(), "text-btn"));
    $("#recipe-ingredients").append(row);
  }
  function openRecipe(recipe = null) {
    editingRecipe = recipe?.id || null;
    $("#recipe-form").reset();
    $("#recipe-title").textContent = recipe ? "Edit recipe" : "New recipe";
    for (const key of [
      "name",
      "servings",
      "calories",
      "protein",
      "carbs",
      "fat",
      "notes",
    ])
      if (recipe) $("#recipe-" + key).value = recipe[key];
    $("#recipe-feedback").textContent = "";
    $("#recipe-ingredients").replaceChildren();
    (recipe?.ingredients || [{}]).forEach((i) =>
      ingredientRow(i.food ? i : undefined),
    );
    recipeDialog.showModal();
    $("#recipe-name").focus();
  }
  $("#new-recipe").onclick = () => openRecipe();
  $("#close-recipe").onclick = () => recipeDialog.close();
  $("#add-recipe-ingredient").onclick = () => {
    if ($("#recipe-ingredients").children.length >= 30) {
      $("#recipe-feedback").textContent = "30 ingredients maximum.";
      return;
    }
    ingredientRow();
    $("#recipe-ingredients").lastElementChild.querySelector("input").focus();
  };
  $("#recipe-form").onsubmit = async (e) => {
    e.preventDefault();
    const v = generation,
      b = e.currentTarget.querySelector('[type="submit"]');
    b.disabled = true;
    const body = {
      name: $("#recipe-name").value,
      servings: Number($("#recipe-servings").value),
      notes: $("#recipe-notes").value,
      ...Object.fromEntries(
        Nutrition.keys.map((k) => [k, Number($("#recipe-" + k).value)]),
      ),
      ingredients: [...$("#recipe-ingredients").children].map((r) => ({
        food: r.querySelector(".ingredient-food").value,
        quantity: Number(r.querySelector(".ingredient-quantity").value),
        unit: r.querySelector(".ingredient-unit").value,
      })),
    };
    try {
      await apiRequest(
        editingRecipe ? "/api/recipes/" + editingRecipe : "/api/recipes",
        { method: editingRecipe ? "PUT" : "POST", body },
      );
      if (!same(v)) return;
      await refreshRecipes();
      if (!same(v)) return;
      recipeDialog.close();
      $("#recipe-status").textContent =
        "Recipe saved. Choose a portion to review it in the meal editor.";
    } catch (error) {
      if (same(v)) $("#recipe-feedback").textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  async function useRecipe(recipe, servings, type) {
    const factor = servings / recipe.servings;
    if (!Number.isFinite(servings) || servings < 0.25 || servings > 50)
      throw new Error("Choose 0.25–50 servings.");
    const draft = {
      name: recipe.name,
      type,
      description:
        `${servings} servings of ${recipe.name}. ${recipe.ingredients.map((i) => `${+(i.quantity * factor).toFixed(3)} ${i.unit} ${i.food}`).join(", ")}${recipe.notes ? "\n" + recipe.notes : ""}`.slice(
          0,
          2000,
        ),
      ...Object.fromEntries(
        Nutrition.keys.map((k) => [k, +(recipe[k] * factor).toFixed(2)]),
      ),
      ingredients: [],
      source: "saved-meal",
    };
    await loadMealEditor(draft, false);
    analysisFeedback.textContent =
      "Recipe portion loaded. Check the nutrition, then tap Save meal. Planning or reviewing does not log it automatically.";
  }
  function drawRecipes() {
    const list = $("#recipe-list");
    list.replaceChildren();
    if (!recipes.length)
      list.append(
        el(
          "p",
          "No recipes yet. Add one with ingredients, serving yield and nutrition for the whole recipe.",
          "helper-copy",
        ),
      );
    recipes.forEach((r) => {
      const card = el("article", undefined, "recipe-card");
      card.append(
        el("h3", r.name),
        el(
          "p",
          `${formatNumber(r.calories / r.servings)} kcal · ${formatNumber(r.protein / r.servings)}g protein per serving`,
          "helper-copy",
        ),
      );
      const label = el("label", "Servings to use"),
        input = el("input");
      input.type = "number";
      input.min = "0.25";
      input.max = "50";
      input.step = "0.25";
      input.value = "1";
      label.append(input);
      card.append(label);
      const actions = el("div", undefined, "button-row");
      actions.append(
        button(
          "Use in meal editor",
          async () => {
            try {
              await useRecipe(r, Number(input.value), getSmartMealType());
            } catch (e) {
              $("#recipe-status").textContent = e.message;
            }
          },
          "primary-btn",
        ),
        button("Edit", () => openRecipe(r)),
        button(
          "Delete",
          async () => {
            const v = generation;
            try {
              await apiRequest("/api/recipes/" + r.id, { method: "DELETE" });
              if (same(v)) await refreshRecipes();
            } catch (e) {
              if (same(v)) $("#recipe-status").textContent = e.message;
            }
          },
          "text-btn",
        ),
      );
      card.append(actions);
      list.append(card);
    });
    const selected = $("#menu-recipe").value;
    $("#menu-recipe").replaceChildren(
      ...recipes.map((r) => {
        const option = el("option", r.name);
        option.value = r.id;
        return option;
      }),
    );
    if (recipes.some((r) => r.id === selected))
      $("#menu-recipe").value = selected;
    $('#menu-form [type="submit"]').disabled = !recipes.length || !menu;
  }
  async function refreshRecipes() {
    const revision = ++recipeRevision,
      v = generation,
      result = await apiRequest("/api/recipes");
    if (!same(v) || revision !== recipeRevision) return;
    recipes = result.recipes;
    drawRecipes();
    await loadMenu();
  }
  let menuVersion = 0;
  async function loadMenu() {
    const v = generation,
      version = ++menuVersion,
      week = $("#menu-week").value;
    if (!week) return;
    $("#menu-status").textContent = "Loading menu…";
    menu = null;
    $('#menu-form [type="submit"]').disabled = true;
    $("#download-shopping").disabled = true;
    $("#shopping-list").replaceChildren();
    $("#menu-days").replaceChildren();
    try {
      const saved = await apiRequest(
        "/api/menu?week=" + encodeURIComponent(week),
      );
      if (!same(v) || version !== menuVersion) return;
      menu = saved;
      recipes = saved.recipes;
      drawRecipes();
      drawMenu();
      $("#menu-status").textContent = recipes.length
        ? ""
        : "Create a recipe in Add Meal to start your weekly menu.";
    } catch (error) {
      if (same(v) && version === menuVersion)
        $("#menu-status").textContent =
          "Menu needs a connection. " + error.message;
    }
  }
  function drawMenu() {
    if (!menu) return;
    $("#menu-day").replaceChildren();
    $("#menu-days").replaceChildren();
    for (let i = 0; i < 7; i++) {
      const date = ProgressMetrics.shift(menu.week, i),
        title = new Date(date + "T12:00:00").toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      const option = el("option", title);
      option.value = date;
      $("#menu-day").append(option);
      const card = el("article", undefined, "menu-day");
      card.append(el("h3", title));
      const entries = menu.entries.filter((e) => e.date === date);
      if (!entries.length) card.append(el("p", "Open day", "helper-copy"));
      entries.forEach((entry) => {
        const recipe = recipes.find((r) => r.id === entry.recipeId);
        if (!recipe) return;
        const row = el("div", undefined, "menu-entry");
        row.append(
          el("strong", recipe.name),
          el(
            "p",
            `${entry.type} · ${entry.servings} serving${entry.servings === 1 ? "" : "s"}`,
            "helper-copy",
          ),
        );
        const actions = el("div", undefined, "button-row");
        actions.append(
          button("Review for today", async () => {
            try {
              await useRecipe(recipe, entry.servings, entry.type);
            } catch (e) {
              $("#menu-status").textContent = e.message;
            }
          }),
          button(
            "Remove",
            async () => {
              const v = generation;
              try {
                await apiRequest("/api/menu/" + entry.id, { method: "DELETE" });
                if (same(v)) await loadMenu();
              } catch (e) {
                if (same(v)) $("#menu-status").textContent = e.message;
              }
            },
            "text-btn",
          ),
        );
        row.append(actions);
        card.append(row);
      });
      $("#menu-days").append(card);
    }
    drawShopping();
  }
  function drawShopping() {
    $("#shopping-list").replaceChildren();
    $("#shopping-status").textContent = "";
    if (!menu?.items.length)
      $("#shopping-list").append(
        el(
          "p",
          "Add recipes to the menu to build your shopping list.",
          "helper-copy",
        ),
      );
    menu?.items.forEach((item) => {
      const label = el("label", undefined, "shopping-item"),
        checkbox = el("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.checked;
      label.append(
        checkbox,
        el(
          "span",
          `${item.food} · ${formatNumber(item.quantity)} ${item.unit}`,
        ),
      );
      checkbox.onchange = async () => {
        const v = generation,
          version = menuVersion,
          old = menu;
        $("#shopping-list")
          .querySelectorAll("input")
          .forEach((i) => (i.disabled = true));
        const checked = old.items
          .filter((i) => (i.id === item.id ? checkbox.checked : i.checked))
          .map((i) => i.id);
        try {
          const saved = await apiRequest("/api/shopping", {
            method: "PATCH",
            body: { week: old.week, fingerprint: old.fingerprint, checked },
          });
          if (!same(v) || version !== menuVersion) return;
          menu = saved;
          drawShopping();
          $("#shopping-status").textContent = "Shopping checks saved.";
        } catch (e) {
          if (same(v) && version === menuVersion) {
            drawShopping();
            $("#shopping-status").textContent =
              e.message + " Refresh the week to reload.";
          }
        }
      };
      $("#shopping-list").append(label);
    });
    $("#download-shopping").disabled = !menu?.items.length;
  }
  $("#menu-week").onchange = () => {
    menuAttempt = null;
    loadMenu();
  };
  for (const [id, offset] of [
    ["#menu-prev", -7],
    ["#menu-next", 7],
  ])
    $(id).onclick = () => {
      if (!$("#menu-week").value) return;
      $("#menu-week").value = ProgressMetrics.shift(
        $("#menu-week").value,
        offset,
      );
      menuAttempt = null;
      loadMenu();
    };
  $("#open-recipes").onclick = () => {
    showSection("add-meal");
    recipePanel.querySelector("details").open = true;
    recipePanel.scrollIntoView({ block: "start", behavior: "auto" });
    $("#new-recipe").focus({ preventScroll: true });
  };
  $("#menu-form").onsubmit = async (e) => {
    e.preventDefault();
    const v = generation,
      b = e.currentTarget.querySelector('[type="submit"]');
    b.disabled = true;
    const body = {
        recipeId: $("#menu-recipe").value,
        date: $("#menu-day").value,
        type: $("#menu-type").value,
        servings: Number($("#menu-servings").value),
      },
      signature = JSON.stringify(body);
    if (menuAttempt?.signature !== signature)
      menuAttempt = { signature, requestId: crypto.randomUUID() };
    try {
      await apiRequest("/api/menu", {
        method: "POST",
        body: { ...body, requestId: menuAttempt.requestId },
      });
      if (!same(v)) return;
      menuAttempt = null;
      await loadMenu();
      if (same(v))
        $("#menu-status").textContent =
          "Planned. Your meal log has not changed.";
    } catch (e) {
      if (same(v)) $("#menu-status").textContent = e.message;
    } finally {
      b.disabled = !recipes.length || !menu;
    }
  };
  $("#download-shopping").onclick = () => {
    if (!menu) return;
    const text =
      `NutriLog shopping list\n${menu.week} to ${menu.end}\n\n` +
      menu.items
        .map(
          (i) =>
            `${i.checked ? "[x]" : "[ ]"} ${i.food}: ${i.quantity} ${i.unit}`,
        )
        .join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" })),
      a = el("a");
    a.href = url;
    a.download = `nutrilog-shopping-${menu.week}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.querySelectorAll("[data-progress-range]").forEach(
    (b) =>
      (b.onclick = () => {
        state.progressRange = Number(b.dataset.progressRange);
        renderNutritionWeek();
        renderProgress();
      }),
  );
  window.resetRoutines = () => {
    generation++;
    owner = null;
    setup = null;
    recipes = [];
    menu = null;
    menuAttempt = null;
    menuVersion++;
    if (setupDialog.open) setupDialog.close();
    if (recipeDialog.open) recipeDialog.close();
    $("#recipe-list").replaceChildren();
    $("#menu-days").replaceChildren();
    $("#shopping-list").replaceChildren();
    $("#menu-recipe").replaceChildren();
    $("#menu-day").replaceChildren();
    $("#recipe-form").reset();
    $("#setup-form").reset();
    guide.classList.add("app-hidden");
  };
  window.renderRoutines = () => {
    if (!state.currentUser) {
      if (owner) window.resetRoutines();
      return;
    }
    if (owner !== state.currentUser.id) {
      window.resetRoutines();
      owner = state.currentUser.id;
      const v = generation,
        initialSetupRevision = setupRevision,
        initialRecipeRevision = recipeRevision;
      Promise.all([apiRequest("/api/setup"), apiRequest("/api/recipes")])
        .then(([s, r]) => {
          if (!same(v)) return;
          if (initialSetupRevision === setupRevision) setup = s.setup;
          if (initialRecipeRevision === recipeRevision) recipes = r.recipes;
          drawGuide();
          drawRecipes();
          loadMenu();
        })
        .catch((e) => {
          if (same(v)) {
            $("#recipe-status").textContent =
              "Recipes need a connection. " + e.message;
          }
        });
    }
    drawGuide();
  };
  window.addEventListener("online", () => {
    if (owner)
      refreshRecipes().catch(
        (e) => ($("#recipe-status").textContent = e.message),
      );
  });
})();
