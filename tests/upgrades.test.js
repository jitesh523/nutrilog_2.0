const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const { streamChatReply } = require("../ai");
const { validateImage, weeklyContext } = require("../upgrades");
const macros = { calories: 350, protein: 20, carbs: 40, fat: 12 };
test("provider streaming handles split UTF-8/events and rejects incomplete streams", async () => {
  const wire =
    "data: " +
    JSON.stringify({
      choices: [{ delta: { content: "Dal 🥣" }, finish_reason: null }],
    }) +
    "\n\ndata: " +
    JSON.stringify({
      choices: [{ delta: { content: " and rice." }, finish_reason: "stop" }],
    }) +
    "\n\ndata: [DONE]\n\n";
  let content = "";
  const bytes = new TextEncoder().encode(wire);
  const mock = () =>
    new Response(
      new ReadableStream({
        start(c) {
          for (let i = 0; i < bytes.length; i += 3)
            c.enqueue(bytes.slice(i, i + 3));
          c.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  assert.equal(
    await streamChatReply({}, [], (d) => (content += d), {
      apiKey: "fake",
      fetchImpl: async () => mock(),
    }),
    "Dal 🥣 and rice.",
  );
  assert.equal(content, "Dal 🥣 and rice.");
  await assert.rejects(
    streamChatReply({}, [], () => {}, {
      apiKey: "fake",
      fetchImpl: async () =>
        new Response(
          'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    }),
    { statusCode: 502 },
  );
});
test("photo validation rejects remote URLs, false MIME types and oversized files", () => {
  for (const value of [
    "https://example.com/photo.jpg",
    "data:image/png;base64," +
      Buffer.from("not a png image").toString("base64"),
    "data:image/jpeg;base64," + Buffer.alloc(600001, 255).toString("base64"),
  ])
    assert.throws(() => validateImage(value));
  assert.equal(
    validateImage(
      "data:image/jpeg;base64," +
        Buffer.from([255, 216, 255, ...Array(20).fill(0)]).toString("base64"),
    ).startsWith("data:image/jpeg"),
    true,
  );
});
test("weekly metrics exclude unlogged days and other users", () => {
  const data = {
    weights: [{ userId: "other", date: "2026-10-09", kg: 100 }],
    profilesByUser: {},
    meals: [{ userId: "other", date: "2026-10-09", name: "Secret" }],
  };
  const { context } = weeklyContext(data, "mine", "2026-10-09", {
    buildHistory: () => [
      { date: "2026-10-09", mealCount: 0, totals: macros },
      { date: "2026-10-08", mealCount: 1, totals: macros, goals: macros },
      { date: "2026-10-01", mealCount: 5, totals: macros },
    ],
  });
  assert.equal(context.loggedDays, 1);
  assert.equal(context.averages.calories, 350);
  assert.deepEqual(context.weights, []);
  assert.deepEqual(context.foods, []);
});
for (const databaseUrl of [
  "",
  ...(process.env.TEST_UPGRADE_DATABASE_URL
    ? [process.env.TEST_UPGRADE_DATABASE_URL]
    : []),
]) {
  test(`upgrades API (${databaseUrl ? "PostgreSQL" : "local"}): owned templates, idempotent copying/offline replay, weekly caching, photo draft and saved SSE`, async (t) => {
    const root = path.resolve(__dirname, ".."),
      temp = fs.mkdtempSync(path.join(os.tmpdir(), "nutrilog-upgrades-"));
    const stub = path.join(temp, "provider.cjs");
    fs.writeFileSync(
      stub,
      `global.fetch=async(url,req)=>{const b=JSON.parse(req.body);let value=b.messages[0].content.includes('exactly the last seven') ? {summary:'1/7 days logged.',win:'Logged a meal.',focus:'Add vegetables.',nextStep:'Try dal tomorrow.'} : {items:[{food:'Dal',grams:150,calories:350,protein:20,carbs:40,fat:12}],notes:'Approximate portion.'};if(b.stream)return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Try dal and rice.'},finish_reason:'stop'}]})+'\\n\\ndata: [DONE]\\n\\n',{headers:{'content-type':'text/event-stream'}});return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));};`,
    );
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1");
    await once(socket, "listening");
    const port = socket.address().port;
    await new Promise((r) => socket.close(r));
    const child = spawn(process.execPath, ["--require", stub, "server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        DATA_DIR: path.join(temp, "data"),
        DATABASE_URL: databaseUrl,
        POSTGRES_URL: "",
        VERCEL: databaseUrl ? "1" : "",
        GROQ_API_KEY: "fake",
        ADMIN_EMAIL: "nobody@example.test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(async () => {
      child.kill();
      await once(child, "exit");
      fs.rmSync(temp, { recursive: true, force: true });
    });
    await once(child.stdout, "data");
    const base = "http://127.0.0.1:" + port;
    async function call(route, method = "GET", body, token) {
      const r = await fetch(base + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, ...(await r.json()) };
    }
    async function account(email) {
      await call("/api/auth/signup", "POST", {
        email,
        password: "test-password",
        timeZone: "Asia/Kolkata",
      });
      return (
        await call("/api/auth/login", "POST", {
          email,
          password: "test-password",
        })
      ).token;
    }
    const token = await account("upgrade@example.test"),
      other = await account("other@example.test");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const yesterday = new Date(Date.parse(today) - 86400000)
      .toISOString()
      .slice(0, 10);
    const meal = {
      date: today,
      name: "Dal",
      type: "Lunch",
      ...macros,
      requestId: "offline-unique-one",
      offline: true,
    };
    const a = await call("/api/meals", "POST", meal, token);
    assert.equal(a.status, 201);
    assert.equal(
      (await call("/api/meals", "POST", meal, token)).replayed,
      true,
    );
    assert.equal(
      (await call("/api/meals", "POST", { ...meal, name: "Other" }, token))
        .status,
      409,
    );
    await call("/api/meals/" + a.meal.id, "DELETE", null, token);
    assert.equal(
      (await call("/api/meals", "POST", meal, token)).replayed,
      true,
    );
    assert.equal(
      (await call("/api/meals", "GET", null, token)).meals.length,
      0,
    );
    assert.equal(
      (
        await call(
          "/api/meals",
          "POST",
          { ...meal, date: yesterday, requestId: "offline-yesterday" },
          token,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await call(
          "/api/meals",
          "POST",
          {
            ...meal,
            date: yesterday,
            offline: false,
            requestId: "online-yesterday",
          },
          token,
        )
      ).status,
      400,
    );
    const template = await call(
      "/api/templates",
      "POST",
      { name: "Training day", meals: [meal] },
      token,
    );
    assert.equal(template.status, 201);
    assert.equal(
      (await call("/api/templates", "GET", null, other)).templates.length,
      0,
    );
    assert.equal(
      (
        await call(
          "/api/meals/batch",
          "POST",
          {
            date: today,
            templateId: template.template.id,
            requestId: "batch-other",
          },
          other,
        )
      ).status,
      400,
    );
    const batch = {
      date: today,
      templateId: template.template.id,
      requestId: "batch-unique",
    };
    assert.equal(
      (await call("/api/meals/batch", "POST", batch, token)).status,
      201,
    );
    assert.equal(
      (await call("/api/meals/batch", "POST", batch, token)).replayed,
      true,
    );
    const review = await call("/api/ai/weekly", "POST", {}, token);
    assert.equal(review.status, 200);
    assert.equal(review.loggedDays, 2);
    assert.ok(review.review.summary);
    assert.deepEqual(
      (await call("/api/ai/weekly", "GET", null, token)).review,
      review.review,
    );
    assert.equal(
      (await call("/api/ai/weekly", "GET", null, other)).review,
      null,
    );
    const image =
      "data:image/jpeg;base64," +
      Buffer.from([255, 216, 255, ...Array(20).fill(0)]).toString("base64");
    const estimate = await call("/api/ai/photo", "POST", { image }, token);
    assert.equal(estimate.status, 200);
    assert.equal(estimate.totals.calories, 350);
    assert.equal(
      (await call("/api/meals", "GET", null, token)).meals.length,
      2,
      "Estimating does not save a meal",
    );
    const r = await fetch(base + "/api/ai/chat", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "What should I eat?",
        date: today,
        requestId: "stream-request-one",
        conversationId: null,
      }),
    });
    const wire = await r.text();
    assert.match(wire, /"type":"delta"/);
    assert.match(wire, /"type":"saved"/);
    const chat = await call("/api/ai/chat", "GET", null, token);
    const draft = await call(
      "/api/ai/meal-draft",
      "POST",
      { messageId: chat.messages.at(-1).id },
      token,
    );
    assert.equal(draft.status, 200);
    assert.equal(
      (
        await call(
          "/api/ai/meal-draft",
          "POST",
          { messageId: chat.messages.at(-1).id },
          other,
        )
      ).status,
      404,
    );
    assert.equal(
      (await call("/api/account/export", "GET", null, token)).templates.length,
      1,
    );
    assert.equal(
      (
        await call(
          "/api/account",
          "DELETE",
          {
            currentPassword: "test-password",
            confirmEmail: "upgrade@example.test",
          },
          token,
        )
      ).status,
      200,
    );
    let stored;
    if (databaseUrl) {
      const { Client } = require("pg"),
        c = new Client({ connectionString: databaseUrl });
      await c.connect();
      stored = (await c.query("SELECT payload FROM diet_app_state WHERE id=1"))
        .rows[0].payload;
      await c.end();
    } else
      stored = JSON.parse(
        fs.readFileSync(path.join(temp, "data/app-data.json")),
      );
    assert.equal(stored.templates.length, 0);
    assert.equal(stored.mealReceipts.length, 0);
    assert.deepEqual(stored.weeklyByUser, {});
  });
}

test("encrypted backups round-trip and reject tampering or the wrong key", () => {
  const { encrypt, decrypt } = require("../scripts/backup"),
    crypto = require("node:crypto"),
    key = crypto.randomBytes(32),
    snapshot = { version: 1, state: { users: [], meals: [] }, usage: [] };
  const encoded = encrypt(snapshot, key);
  assert.deepEqual(decrypt(encoded, key), snapshot);
  assert.doesNotMatch(encoded.toString(), /users|meals/);
  assert.throws(() => decrypt(encoded, crypto.randomBytes(32)));
  encoded[encoded.length - 1] ^= 1;
  assert.throws(() => decrypt(encoded, key));
});
