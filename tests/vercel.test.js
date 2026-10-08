const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("Vercel adapter handles nested API paths, parsed bodies and date queries", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "diet-adapter-test-"));
  process.env.DATA_DIR = temp;
  process.env.DATABASE_URL = "";
  process.env.POSTGRES_URL = "";
  process.env.VERCEL = "";
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const handler = require("../api/index");
  async function invoke(route, body, token, query = "") {
    const request = {
      method: body === undefined ? "GET" : "POST",
      url: `/api/index?__route=${route}${query}`,
      query: { __route: route }, body,
      headers: { host: "example.vercel.app", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    };
    const response = {
      status: undefined, data: undefined,
      writeHead(status) { this.status = status; },
      setHeader() {},
      end(value) { this.data = JSON.parse(value); },
    };
    await handler(request, response);
    return response;
  }
  assert.equal((await invoke("healthz")).status, 200);
  const account = { email: "adapter@example.test", password: "test-password", timeZone: "UTC" };
  assert.equal((await invoke("auth/signup", account)).status, 201);
  const login = await invoke("auth/login", account);
  assert.equal(login.status, 200);
  const token = login.data.token;
  assert.equal((await invoke("auth/session", undefined, token)).status, 200);
  const date = new Date().toISOString().slice(0, 10);
  assert.equal((await invoke("meals", {
    date, name: "Sample meal", calories: 300, protein: 20, carbs: 30, fat: 8,
  }, token)).status, 201);
  const today = await invoke("meals", undefined, token, `&date=${date}`);
  assert.equal(today.data.meals.length, 1);
  const previous = await invoke("meals", undefined, token, "&date=2000-01-01");
  assert.equal(previous.data.meals.length, 0);
});
