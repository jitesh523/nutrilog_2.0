const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { buildAdviceContext, getAdvice, estimateMeal } = require("../ai");

const nutrition = { calories: 400, protein: 25, carbs: 45, fat: 12 };
const goals = { calories: 2200, protein: 150, carbs: 220, fat: 70 };
const goodAdvice = { summary: "A balanced start.", suggestions: ["Add a protein source."], nextMeal: "Dal and rice." };
const reply = (value) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));

test("context excludes other users, other dates and account secrets", () => {
  const data = { users: [{ email: "private@example.test", passwordHash: "secret" }], sessions: [{ token: "secret-token" }], meals: [
    { userId: "a", date: "2026-10-08", name: "Dal", ...nutrition },
    { userId: "b", date: "2026-10-08", name: "Other user's meal", ...nutrition },
    { userId: "a", date: "2026-10-07", name: "Yesterday", ...nutrition },
  ] };
  const context = buildAdviceContext(data, "a", "2026-10-08", goals, []);
  assert.equal(context.meals.length, 1);
  assert.equal(context.meals[0].name, "Dal");
  assert.deepEqual(context.totals, nutrition);
  assert.doesNotMatch(JSON.stringify(context), /secret|private|Other user|Yesterday|userId/);
});

test("completion keeps authentication server-side and requests JSON", async () => {
  const result = await getAdvice({ goals }, "Vegetarian ideas?", {
    apiKey: "test-secret",
    fetchImpl: async (url, request) => {
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      assert.equal(request.headers.Authorization, "Bearer test-secret");
      const body = JSON.parse(request.body);
      assert.equal(body.response_format.type, "json_object");
      assert.equal(JSON.parse(body.messages[1].content).question, "Vegetarian ideas?");
      assert.ok(request.signal);
      return reply(goodAdvice);
    },
  });
  assert.deepEqual(result, goodAdvice);
  assert.doesNotMatch(JSON.stringify(result), /test-secret/);
});

test("food estimate sums item macros rather than trusting AI totals", async () => {
  const result = await estimateMeal("2 idlis", { apiKey: "test", fetchImpl: async () => reply({
    items: [{ food: "Idli", grams: 80, ...nutrition }, { food: "Sambar", grams: 100, ...nutrition }],
    totals: { calories: 1 }, notes: "Assuming standard portions.",
  }) });
  assert.equal(result.totals.calories, 800);
  assert.equal(result.totals.protein, 50);
  assert.equal(result.items[0].displayUnit, "g");
});

test("invalid, negative and missing nutrition values are rejected", async () => {
  for (const value of [-1, "100", null, undefined]) {
    await assert.rejects(estimateMeal("Idli", { apiKey: "test", fetchImpl: async () => reply({
      items: [{ food: "Idli", grams: 80, ...nutrition, calories: value }],
    }) }), { statusCode: 502 });
  }
});

test("provider failures are safe, actionable and never echo provider errors", async () => {
  for (const [providerStatus, expectedStatus] of [[401, 503], [403, 503], [404, 503], [429, 429], [500, 502]]) {
    await assert.rejects(getAdvice({}, "", {
      apiKey: "test", fetchImpl: async () => new Response("SECRET PROVIDER DETAILS", { status: providerStatus }),
    }), (error) => error.statusCode === expectedStatus && !error.message.includes("SECRET"));
  }
  await assert.rejects(getAdvice({}, "", { apiKey: "" }), { statusCode: 503 });
  await assert.rejects(getAdvice({}, "", {
    apiKey: "test", fetchImpl: async () => { throw new DOMException("timeout", "TimeoutError"); },
  }), { statusCode: 504 });
});

test("malformed or incomplete AI responses are rejected", async () => {
  for (const response of [() => new Response("{}"), () => reply({ summary: "Missing suggestions" }),
    () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }))]) {
    await assert.rejects(getAdvice({}, "", { apiKey: "test", fetchImpl: async () => response() }), { statusCode: 502 });
  }
});

for (const databaseUrl of ["", ...(process.env.TEST_API_DATABASE_URL ? [process.env.TEST_API_DATABASE_URL] : [])]) {
test(`HTTP integration (${databaseUrl ? "PostgreSQL" : "local"}): authentication, isolation, file protection and usage limits`, async (t) => {
  const root = path.resolve(__dirname, "..");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "diet-ai-test-"));
  const stub = path.join(temp, "provider.cjs");
  fs.writeFileSync(stub, `global.fetch = async (url, request) => {
    const context = JSON.parse(JSON.parse(request.body).messages[1].content);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      summary: JSON.stringify(context), suggestions: ['Try dal.'], nextMeal: ''
    }) } }] }));
  };`);
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["--require", stub, "server.js"], {
    cwd: root, env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: path.join(temp, "data"), GROQ_API_KEY: "fake-test-key",
      DATABASE_URL: databaseUrl, POSTGRES_URL: "", VERCEL: databaseUrl ? "1" : "", ADMIN_EMAIL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    fs.rmSync(temp, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Test server did not start")), 5000);
    child.once("exit", () => { clearTimeout(timer); reject(new Error("Test server exited")); });
    child.stdout.on("data", () => { clearTimeout(timer); resolve(); });
  });
  const base = `http://127.0.0.1:${port}`;
  async function request(route, body, token, method = "POST") {
    return fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  }
  assert.equal((await request("/api/ai/advice", {})).status, 401);
  for (const file of ["/.env", "/.env.example", "/server.js", "/ai.js", "/data/app-data.json", "/.git/config", "/package.json"]) {
    assert.equal((await fetch(base + file)).status, 404, file);
  }
  for (const file of ["/", "/dashboard", "/styles.css", "/app.js", "/ai-client.js"]) {
    assert.equal((await fetch(base + file)).status, 200, file);
  }
  async function account(email) {
    assert.equal((await request("/api/auth/signup", { email, password: "test-password", timeZone: "Asia/Kolkata" })).status, 201);
    return (await (await request("/api/auth/login", { email, password: "test-password" })).json()).token;
  }
  const tokenA = await account("a@example.test");
  const tokenB = await account("b@example.test");
  if (databaseUrl) {
    const session = await fetch(base + "/api/auth/session", { headers: { Authorization: `Bearer ${tokenA}` } });
    assert.equal((await session.json()).user.isAdmin, false);
  }
  assert.equal((await fetch(base + "/api/ai/advice", {
    method: "POST", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: "{invalid",
  })).status, 400);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  await request("/api/meals", { date, name: "Private meal B", ...nutrition }, tokenB);
  await request("/api/meals", { date, name: "Meal A", ...nutrition }, tokenA);
  assert.equal((await request("/api/ai/advice", { question: "x".repeat(1001) }, tokenA)).status, 400);
  assert.equal((await request("/api/ai/estimate", { description: " " }, tokenA)).status, 400);
  assert.equal((await request("/api/ai/advice", { date: "tomorrow" }, tokenA)).status, 400);
  const response = await request("/api/ai/advice", { date, goals, question: "What next?" }, tokenA);
  assert.equal(response.status, 200);
  const advice = await response.json();
  const sentContext = JSON.parse(advice.summary);
  assert.equal(sentContext.meals.length, 1);
  assert.equal(sentContext.meals[0].name, "Meal A");
  assert.equal(sentContext.question, "What next?");
  assert.doesNotMatch(advice.summary, /Private meal B|example.test|fake-test-key|password|userId/);
  for (let i = 0; i < 5; i++) assert.equal((await request("/api/ai/advice", { date }, tokenA)).status, 200);
  assert.equal((await request("/api/ai/advice", { date }, tokenA)).status, 429);
  assert.equal((await request("/api/ai/advice", { date }, tokenB)).status, 200);
});
}
