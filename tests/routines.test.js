const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const {
  validateRecipe,
  recipeDraft,
  shoppingList,
  shiftDate,
} = require("../routines");
const Progress = require("../progress");
const { validateSnapshot, restoreDrill } = require("../scripts/backup");
const nutrition = { calories: 600, protein: 30, carbs: 70, fat: 20 };
const recipeBody = {
  name: "Oats bowl",
  servings: 2,
  ...nutrition,
  notes: "Mix together.",
  ingredients: [
    { food: "Oats", quantity: 0.2, unit: "kg" },
    { food: "Milk", quantity: 500, unit: "ml" },
  ],
};
test("recipes scale portions; shopping combines convertible units and invalidates changed quantity checks", () => {
  const a = { ...validateRecipe(recipeBody), id: "a", userId: "mine" },
    b = {
      ...a,
      id: "b",
      ingredients: [
        { food: "  oats  ", quantity: 50, unit: "g" },
        { food: "Milk", quantity: 1, unit: "cup" },
      ],
    };
  assert.equal(recipeDraft(a, 1).calories, 300);
  const data = {
    recipes: [a, b, { ...a, userId: "other", id: "secret" }],
    menuEntries: [
      {
        id: "1",
        userId: "mine",
        recipeId: "a",
        date: "2026-10-09",
        servings: 1,
      },
      {
        id: "2",
        userId: "mine",
        recipeId: "b",
        date: "2026-10-09",
        servings: 2,
      },
      {
        id: "3",
        userId: "other",
        recipeId: "secret",
        date: "2026-10-09",
        servings: 10,
      },
    ],
    shoppingByUser: {},
  };
  const first = shoppingList(data, "mine", "2026-10-05");
  assert.equal(first.items.find((i) => i.unit === "g").quantity, 150);
  assert.equal(first.items.find((i) => i.unit === "ml").quantity, 250);
  assert.equal(first.items.find((i) => i.unit === "cup").quantity, 1);
  data.shoppingByUser.mine = {
    "2026-10-05": { checked: first.items.map((i) => i.id) },
  };
  assert.ok(
    shoppingList(data, "mine", "2026-10-05").items.every((i) => i.checked),
  );
  data.menuEntries[0].servings = 2;
  const changed = shoppingList(data, "mine", "2026-10-05");
  assert.notEqual(changed.fingerprint, first.fingerprint);
  assert.equal(changed.items.find((i) => i.unit === "g").checked, false);
  assert.equal(changed.items.find((i) => i.unit === "cup").checked, true);
  for (const body of [
    { ...recipeBody, servings: 0 },
    { ...recipeBody, ingredients: [] },
    { ...recipeBody, ingredients: [{ food: "Oats", quantity: -1, unit: "g" }] },
    {
      ...recipeBody,
      ingredients: [{ food: "Oats", quantity: 1, unit: "unknown" }],
    },
  ])
    assert.throws(() => validateRecipe(body));
});
test("7/30 day comparisons use logged days, separate adjacent periods and cross calendar boundaries", () => {
  const history = [
    { date: "2026-03-01", mealCount: 1, totals: nutrition },
    { date: "2026-02-28", mealCount: 0, totals: nutrition },
    {
      date: "2026-02-23",
      mealCount: 1,
      totals: { ...nutrition, calories: 400 },
    },
    {
      date: "2026-02-22",
      mealCount: 1,
      totals: { ...nutrition, calories: 200 },
    },
  ];
  const { current, previous, delta } = Progress.compare(
    history,
    "2026-03-01",
    7,
  );
  assert.equal(current.start, "2026-02-23");
  assert.equal(current.loggedDays, 2);
  assert.equal(current.averages.calories, 500);
  assert.equal(previous.loggedDays, 1);
  assert.equal(delta.calories, 300);
  assert.equal(
    Progress.compare([], "2026-01-01", 30).current.start,
    "2025-12-03",
  );
  assert.equal(Progress.compare([], "2026-01-01", 30).delta.calories, null);
});
test("restore drill accepts only authentic structured snapshots", () => {
  assert.throws(() =>
    validateSnapshot({
      version: 1,
      state: { users: [], meals: [] },
      usage: [],
    }),
  );
  assert.throws(() =>
    validateSnapshot({
      version: 1,
      createdAt: new Date().toISOString(),
      state: { users: [], meals: [] },
      usage: [{ user_id: "a", window_start: "bad", request_count: 1 }],
    }),
  );
});
for (const databaseUrl of [
  "",
  ...(process.env.TEST_ROUTINE_DATABASE_URL
    ? [process.env.TEST_ROUTINE_DATABASE_URL]
    : []),
])
  test(`routine API (${databaseUrl ? "PostgreSQL" : "local"}): setup, recipes, planned servings, shopping and account isolation`, async (t) => {
    const root = path.resolve(__dirname, ".."),
      temp = fs.mkdtempSync(path.join(os.tmpdir(), "nutrilog-routine-"));
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1");
    await once(socket, "listening");
    const port = socket.address().port;
    await new Promise((r) => socket.close(r));
    const server = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        DATA_DIR: temp,
        DATABASE_URL: databaseUrl,
        POSTGRES_URL: "",
        VERCEL: databaseUrl ? "1" : "",
        ADMIN_EMAIL: "none@example.test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(async () => {
      if (server.exitCode === null) {
        server.kill();
        await once(server, "exit");
      }
      fs.rmSync(temp, { recursive: true, force: true });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Startup timeout")),
        5000,
      );
      server.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    const base = `http://127.0.0.1:${port}`;
    async function req(route, method = "GET", body, token, status = 200) {
      const r = await fetch(base + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json();
      assert.equal(
        r.status,
        status,
        `${method} ${route}: ${JSON.stringify(data)}`,
      );
      return data;
    }
    const suffix = crypto.randomUUID(),
      password = "test-password",
      email = `routine-${suffix}@example.test`;
    for (const e of [email, `other-${suffix}@example.test`])
      await req(
        "/api/auth/signup",
        "POST",
        { email: e, password, timeZone: "UTC" },
        undefined,
        201,
      );
    const token = (await req("/api/auth/login", "POST", { email, password }))
        .token,
      other = (
        await req("/api/auth/login", "POST", {
          email: `other-${suffix}@example.test`,
          password,
        })
      ).token;
    await req("/api/recipes", "GET", undefined, undefined, 401);
    assert.equal(
      (await req("/api/setup", "GET", undefined, token)).setup,
      null,
    );
    const profile = {
      displayName: "Lifter",
      dietaryPreference: "vegetarian",
      cuisines: "Indian",
      allergies: "peanuts",
      budget: "₹200",
      cookingMinutes: 20,
    };
    await req(
      "/api/setup",
      "PUT",
      { intent: "training", profile, goals: { ...nutrition, calories: 0 } },
      token,
      400,
    );
    assert.equal(
      (await req("/api/profile", "GET", undefined, token)).profile.displayName,
      "",
    );
    await req(
      "/api/setup",
      "PUT",
      { intent: "training", profile, goals: nutrition },
      token,
    );
    assert.deepEqual(
      (await req("/api/goals", "GET", undefined, token)).goals,
      nutrition,
    );
    assert.equal(
      (await req("/api/setup", "GET", undefined, other)).setup,
      null,
    );
    const recipe = (await req("/api/recipes", "POST", recipeBody, token, 201))
      .recipe;
    assert.equal(
      (await req("/api/recipes", "GET", undefined, other)).recipes.length,
      0,
    );
    await req("/api/recipes/" + recipe.id, "PUT", recipeBody, other, 404);
    await req("/api/recipes/" + recipe.id, "DELETE", undefined, other, 404);
    const today = new Date().toISOString().slice(0, 10),
      entry = {
        recipeId: recipe.id,
        date: today,
        type: "Breakfast",
        servings: 1,
        requestId: crypto.randomUUID(),
      };
    await req("/api/menu", "POST", entry, other, 404);
    await req(
      "/api/menu",
      "POST",
      { ...entry, date: "2026-02-30" },
      token,
      400,
    );
    await req("/api/menu", "POST", { ...entry, servings: 0 }, token, 400);
    const saved = (await req("/api/menu", "POST", entry, token, 201)).entry;
    assert.equal(
      (await req("/api/menu", "POST", entry, token)).entry.id,
      saved.id,
    );
    await req("/api/menu", "POST", { ...entry, servings: 2 }, token, 409);
    assert.equal(
      (await req("/api/meals", "GET", undefined, token)).meals.length,
      0,
      "Planning does not log meals",
    );
    const list = await req(
      "/api/shopping?week=" + today,
      "GET",
      undefined,
      token,
    );
    assert.equal(list.items.find((i) => i.unit === "g").quantity, 100);
    await req(
      "/api/shopping",
      "PATCH",
      {
        week: today,
        fingerprint: list.fingerprint,
        checked: [list.items[0].id],
      },
      token,
    );
    assert.equal(
      (await req("/api/shopping?week=" + today, "GET", undefined, token))
        .items[0].checked,
      true,
    );
    assert.equal(
      (await req("/api/shopping?week=" + today, "GET", undefined, other)).items
        .length,
      0,
    );
    await req("/api/recipes/" + recipe.id, "DELETE", undefined, token, 409);
    await req(
      "/api/recipes/" + recipe.id,
      "PUT",
      {
        ...recipeBody,
        ingredients: [{ food: "Oats", quantity: 0.4, unit: "kg" }],
      },
      token,
    );
    await req(
      "/api/shopping",
      "PATCH",
      { week: today, fingerprint: list.fingerprint, checked: [] },
      token,
      409,
    );
    const changed = await req(
      "/api/shopping?week=" + today,
      "GET",
      undefined,
      token,
    );
    assert.equal(changed.items[0].quantity, 200);
    assert.equal(changed.items[0].checked, false);
    const exported = await req("/api/account/export", "GET", undefined, token);
    assert.equal(exported.recipes.length, 1);
    assert.equal(exported.menu.length, 1);
    assert.equal(exported.setup.intent, "training");
    await req("/api/menu/" + saved.id, "DELETE", undefined, other, 404);
    await req(
      "/api/account",
      "DELETE",
      { currentPassword: password, confirmEmail: email },
      token,
    );
    if (!databaseUrl) {
      const state = JSON.parse(
        fs.readFileSync(path.join(temp, "app-data.json")),
      );
      assert.equal(state.recipes.length, 0);
      assert.equal(state.menuEntries.length, 0);
      assert.equal(Object.keys(state.shoppingByUser).length, 0);
      assert.equal(Object.keys(state.setupByUser).length, 0);
    }
    if (databaseUrl) {
      const { Client } = require("pg"),
        c = new Client({ connectionString: databaseUrl });
      await c.connect();
      try {
        await restoreDrill(c, {
          version: 1,
          createdAt: new Date().toISOString(),
          state: { users: [], meals: [], sentinel: "restore only" },
          usage: [
            {
              user_id: "fixture",
              window_start: new Date().toISOString(),
              request_count: 2,
            },
          ],
        });
        const rows = await c.query(
          "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'nl_restore_%'",
        );
        assert.equal(rows.rowCount, 0);
      } finally {
        await c.end();
      }
    }
  });
