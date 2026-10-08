const fs = require("node:fs");
const path = require("node:path");
const { AsyncLocalStorage } = require("node:async_hooks");

class StorageError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 503;
  }
}

function emptyData() {
  return {
    users: [], sessions: [], meals: [], goalsByUser: {}, goalSnapshotsByUser: {},
    auditEvents: [], notifications: [], settings: { adminUserId: null },
  };
}

function createStorage(options = {}) {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  const hosted = options.hosted ?? Boolean(process.env.VERCEL);
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(__dirname, "data");
  const dataFile = path.join(dataDir, "app-data.json");
  const context = new AsyncLocalStorage();
  let pool;
  let ready;
  let localQueue = Promise.resolve();

  function localWrite(data) {
    const tempFile = `${dataFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tempFile, dataFile);
  }

  async function initialize() {
    if (ready) return ready;
    ready = (async () => {
      if (!connectionString) {
        if (hosted) throw new StorageError("Persistent storage is not configured. Set DATABASE_URL on Vercel.");
        fs.mkdirSync(dataDir, { recursive: true });
        if (!fs.existsSync(dataFile)) localWrite(emptyData());
        return;
      }
      const { Pool } = require("pg");
      if (!pool) {
        pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
        // Avoid an idle connection's error crashing a warm serverless instance.
        pool.on("error", () => {});
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize schema initialization across simultaneous cold starts.
        await client.query("SELECT pg_advisory_xact_lock(94721032)");
        await client.query(`CREATE TABLE IF NOT EXISTS diet_app_state (
          id integer PRIMARY KEY CHECK (id = 1), payload jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);
        await client.query("INSERT INTO diet_app_state (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING", [JSON.stringify(emptyData())]);
        await client.query(`CREATE TABLE IF NOT EXISTS diet_ai_usage (
          user_id text PRIMARY KEY, window_start timestamptz NOT NULL, request_count integer NOT NULL
        )`);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    })().catch((error) => {
      ready = undefined;
      if (error instanceof StorageError) throw error;
      throw new StorageError("Could not connect to persistent storage. Please try again shortly.");
    });
    return ready;
  }

  async function runRequest(mutating, action) {
    await initialize();
    if (!connectionString) {
      const run = async () => {
        const state = { data: JSON.parse(fs.readFileSync(dataFile, "utf8")), mutating, dirty: false, responses: [] };
        const result = await context.run(state, action);
        if (state.dirty) localWrite(state.data);
        state.responses.forEach((respond) => respond());
        return result;
      };
      if (!mutating) return run();
      const result = localQueue.then(run);
      localQueue = result.catch(() => {});
      return result;
    }
    if (!mutating) {
      const { rows } = await pool.query("SELECT payload FROM diet_app_state WHERE id = 1");
      return context.run({ data: rows[0].payload, mutating: false }, action);
    }
    const client = await pool.connect();
    let state;
    let result;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      const { rows } = await client.query("SELECT payload FROM diet_app_state WHERE id = 1 FOR UPDATE");
      state = { data: rows[0].payload, mutating: true, dirty: false, responses: [] };
      result = await context.run(state, action);
      if (state.dirty) {
        await client.query("UPDATE diet_app_state SET payload = $1::jsonb, updated_at = now() WHERE id = 1", [JSON.stringify(state.data)]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    // Send success only after the database transaction has committed.
    state.responses.forEach((respond) => respond());
    return result;
  }

  function read() {
    const state = context.getStore();
    if (!state) throw new Error("Storage reads require a request context.");
    return state.data;
  }

  function write(data) {
    const state = context.getStore();
    if (!state?.mutating) throw new Error("Storage writes require a transaction.");
    state.data = data;
    state.dirty = true;
  }

  function respond(callback) {
    const state = context.getStore();
    if (state?.mutating) state.responses.push(callback);
    else callback();
  }

  async function consumeAiQuota(userId) {
    if (!connectionString) return true; // Local requests use the existing in-process limiter.
    const { rows } = await pool.query(`
      INSERT INTO diet_ai_usage (user_id, window_start, request_count) VALUES ($1, now(), 1)
      ON CONFLICT (user_id) DO UPDATE SET
        window_start = CASE WHEN diet_ai_usage.window_start < now() - interval '1 minute' THEN now() ELSE diet_ai_usage.window_start END,
        request_count = CASE WHEN diet_ai_usage.window_start < now() - interval '1 minute' THEN 1 ELSE diet_ai_usage.request_count + 1 END
      WHERE diet_ai_usage.window_start < now() - interval '1 minute' OR diet_ai_usage.request_count < 6
      RETURNING request_count`, [userId]);
    return rows.length > 0;
  }

  return { initialize, runRequest, read, write, respond, consumeAiQuota, close: async () => { if (pool) await pool.end(); } };
}

module.exports = { createStorage, StorageError };
