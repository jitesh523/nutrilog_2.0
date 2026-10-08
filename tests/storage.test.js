const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStorage } = require("../storage");

test("hosted app refuses temporary file storage when no database is configured", async () => {
  const storage = createStorage({ hosted: true, connectionString: "" });
  await assert.rejects(storage.initialize(), { statusCode: 503 });
});

test("local transactions persist across instances and roll back failed writes", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "diet-storage-test-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const storage = createStorage({ dataDir, hosted: false, connectionString: "" });
  await Promise.all(Array.from({ length: 12 }, () => storage.runRequest(true, async () => {
    const data = storage.read();
    await new Promise((resolve) => setImmediate(resolve));
    data.counter = (data.counter || 0) + 1;
    storage.write(data);
  })));
  let responded = false;
  await assert.rejects(storage.runRequest(true, () => {
    storage.write({ counter: 999 });
    storage.respond(() => { responded = true; });
    throw new Error("Simulated failure");
  }));
  assert.equal(responded, false);
  const restarted = createStorage({ dataDir, hosted: false, connectionString: "" });
  await restarted.runRequest(false, () => assert.equal(restarted.read().counter, 12));
});

test("PostgreSQL persists across instances, locks concurrent writes and shares AI quotas", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  const first = createStorage({ connectionString, hosted: true });
  const second = createStorage({ connectionString, hosted: true });
  t.after(async () => { await first.close(); await second.close(); });
  await Promise.all([first.initialize(), second.initialize()]);
  await first.runRequest(true, () => {
    const data = first.read(); data.counter = 0; first.write(data);
  });
  await Promise.all(Array.from({ length: 20 }, (_, index) => {
    const storage = index % 2 ? first : second;
    return storage.runRequest(true, async () => {
      const data = storage.read();
      await new Promise((resolve) => setImmediate(resolve));
      data.counter += 1;
      storage.write(data);
    });
  }));
  let committedValue;
  await first.runRequest(true, () => {
    const data = first.read(); data.counter += 1; first.write(data);
    first.respond(() => { committedValue = data.counter; });
    assert.equal(committedValue, undefined);
  });
  assert.equal(committedValue, 21);
  let failedResponse = false;
  await assert.rejects(first.runRequest(true, () => {
    first.write({ counter: 1000 });
    first.respond(() => { failedResponse = true; });
    throw new Error("Simulated failed save");
  }));
  assert.equal(failedResponse, false);
  await second.runRequest(false, () => assert.equal(second.read().counter, 21));
  const userId = `test-quota-${Date.now()}`;
  const requests = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    (index % 2 ? first : second).consumeAiQuota(userId)));
  assert.equal(requests.filter(Boolean).length, 6);
  const third = createStorage({ connectionString, hosted: true });
  t.after(() => third.close());
  await third.runRequest(false, () => assert.equal(third.read().counter, 21));
  assert.equal(await third.consumeAiQuota(userId), false);
});
