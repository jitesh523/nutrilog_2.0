const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const { webcrypto } = require("node:crypto");
const source = fs.readFileSync(require.resolve("../offline.js"), "utf8");
function client(database, token, network) {
  const dom = new JSDOM('<section id="offline-status"></section>', {
      url: "http://localhost/dashboard",
      runScripts: "outside-only",
    }),
    w = dom.window;
  let online = true;
  Object.defineProperty(w.navigator, "onLine", { get: () => online });
  w.indexedDB = database;
  w.TextEncoder = TextEncoder;
  Object.defineProperty(w.crypto, "subtle", { value: webcrypto.subtle });
  w.getSessionToken = () => token;
  w.networkApiRequest = network;
  w.loadDashboardData = async () => {};
  w.render = () => {};
  w.state = { currentUser: { id: token } };
  w.fetch = async () => new Response("{}");
  w.eval(source);
  return {
    w,
    api: (path, options = {}) => w.OfflineMeals.request(path, options, network),
    offline() {
      online = false;
    },
    online() {
      online = true;
    },
    setToken(value) {
      token = value;
      w.state.currentUser = { id: value };
    },
  };
}
test("offline queue survives reload, isolates accounts, syncs exact dates and handles lost responses", async (t) => {
  const database = new IDBFactory(),
    saved = new Map();
  let loseResponse = false;
  const network = async (path, options) => {
    if (path === "/api/auth/session") return { user: { id: active } };
    if (path === "/api/meals" && options.method === "POST") {
      saved.set(options.body.requestId, options.body);
      if (loseResponse) {
        loseResponse = false;
        throw new TypeError("Network interrupted after commit");
      }
      return { meal: options.body };
    }
    if (path === "/api/meals") return { meals: [] };
    if (path === "/api/goals") return { goals: { calories: 2200 } };
    throw new Error("Unexpected route " + path);
  };
  let active = "a";
  const a = client(database, "a", network);
  t.after(() => a.w.close());
  await a.api("/api/auth/session");
  await a.api("/api/meals");
  a.offline();
  const body = {
    requestId: "old-meal-request-id",
    name: "Dal",
    date: "2026-10-08",
    calories: 350,
    protein: 20,
    carbs: 40,
    fat: 12,
  };
  const results = await Promise.all([
    a.api("/api/meals", { method: "POST", body }),
    a.api("/api/meals", { method: "POST", body: { ...body, name: "Rice" } }),
  ]);
  assert.ok(results.every((r) => r.queued));
  assert.notEqual(
    results[0].meal.requestId,
    body.requestId,
    "Reusing a meal must not reuse its old write ID",
  );
  assert.notEqual(results[0].meal.requestId, results[1].meal.requestId);
  assert.equal(saved.size, 0);
  const reload = client(database, "a", network);
  t.after(() => reload.w.close());
  reload.offline();
  assert.equal((await reload.api("/api/auth/session")).user.id, "a");
  await reload.w.OfflineMeals.draw();
  assert.match(reload.w.document.body.textContent, /2 meals saved/);
  active = "b";
  reload.online();
  reload.setToken("b");
  await reload.api("/api/auth/session");
  await reload.w.OfflineMeals.sync();
  assert.equal(saved.size, 0, "Account B must not upload A’s meals");
  active = "a";
  reload.setToken("a");
  await reload.api("/api/auth/session");
  await reload.w.OfflineMeals.sync();
  assert.equal(saved.size, 2);
  assert.ok([...saved.values()].every((m) => m.date === "2026-10-08"));
  await reload.w.OfflineMeals.draw();
  assert.doesNotMatch(reload.w.document.body.textContent, /waiting to sync/);
  loseResponse = true;
  const result = await reload.api("/api/meals", {
    method: "POST",
    body: { ...body, name: "Sambar" },
  });
  assert.equal(result.queued, true);
  assert.equal(saved.size, 3);
  await reload.w.OfflineMeals.sync();
  assert.equal(saved.size, 3, "Lost-response retry uses the same request ID");
  await reload.w.OfflineMeals.forget();
  reload.offline();
  await assert.rejects(reload.api("/api/auth/session"), /not been saved/);
});

test("late responses cannot cross account cache boundaries", async (t) => {
  const database = new IDBFactory();
  let resolveOld;
  const c = client(database, "a", async (path) =>
    path === "/api/auth/session"
      ? { user: { id: "a" } }
      : new Promise((resolve) => {
          resolveOld = resolve;
        }),
  );
  t.after(() => c.w.close());
  await c.api("/api/auth/session");
  const pending = c.api("/api/meals");
  while (!resolveOld) await new Promise((r) => setImmediate(r));
  c.setToken("b");
  const newNetwork = async () => ({ user: { id: "b" } });
  await c.w.OfflineMeals.request("/api/auth/session", {}, newNetwork);
  resolveOld({ meals: [{ name: "Private A meal" }] });
  await assert.rejects(pending, /account changed/);
  c.offline();
  await assert.rejects(c.api("/api/meals"), /not been saved/);
  assert.equal((await c.api("/api/auth/session")).user.id, "b");
});
