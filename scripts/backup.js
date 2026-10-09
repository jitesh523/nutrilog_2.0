// Run with DATABASE_URL and BACKUP_KEY (32 random bytes, base64) in the environment.
// Restore drills use a newly created isolated schema, then remove it.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
function encrypt(value, key) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from("NLOG1"), iv, cipher.getAuthTag(), data]);
}
function decrypt(bytes, key) {
  if (bytes.subarray(0, 5).toString() !== "NLOG1")
    throw new Error("Invalid backup format.");
  const cipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    bytes.subarray(5, 17),
  );
  cipher.setAuthTag(bytes.subarray(17, 33));
  return JSON.parse(
    Buffer.concat([
      cipher.update(bytes.subarray(33)),
      cipher.final(),
    ]).toString(),
  );
}
async function main() {
  const [command, file] = process.argv.slice(2),
    key = Buffer.from(process.env.BACKUP_KEY || "", "base64");
  if (
    key.length !== 32 ||
    !file ||
    !["create", "verify", "drill"].includes(command)
  )
    throw new Error(
      "Usage: node scripts/backup.js create|verify|drill /private/path/backup.nlog (BACKUP_KEY and DATABASE_URL required; drills use RESTORE_DATABASE_URL)",
    );
  if (command === "verify" || command === "drill") {
    const value = validateSnapshot(decrypt(fs.readFileSync(file), key));
    if (command === "drill") {
      if (!process.env.RESTORE_DATABASE_URL)
        throw new Error(
          "RESTORE_DATABASE_URL is required for an isolated restore drill.",
        );
      const { Client } = require("pg"),
        client = new Client({
          connectionString: process.env.RESTORE_DATABASE_URL,
        });
      await client.connect();
      try {
        await restoreDrill(client, value);
      } finally {
        await client.end();
      }
      console.log(
        "Backup restored into a new isolated schema, compared exactly, and drill schema removed. Live tables were not changed.",
      );
      return;
    }
    console.log(
      "Backup authentication, decryption and structure verified. Created " +
        value.createdAt,
    );
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const { Client } = require("pg"),
    client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows } = await client.query(
      "SELECT payload FROM diet_app_state WHERE id=1",
    );
    const usage = await client.query("SELECT * FROM diet_ai_usage");
    await client.query("COMMIT");
    if (!rows[0]) throw new Error("No app state found.");
    const snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      state: rows[0].payload,
      usage: usage.rows,
    };
    const encoded = encrypt(snapshot, key);
    fs.mkdirSync(path.dirname(path.resolve(file)), {
      recursive: true,
      mode: 0o700,
    });
    fs.writeFileSync(file, encoded, { mode: 0o600, flag: "wx" });
    if (
      JSON.stringify(decrypt(fs.readFileSync(file), key)) !==
      JSON.stringify(snapshot)
    )
      throw new Error("Backup verification failed.");
    console.log(
      "Encrypted consistent database snapshot created and round-trip verified.",
    );
  } finally {
    await client.end();
  }
}
function validateSnapshot(value) {
  if (
    value?.version !== 1 ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.state?.users) ||
    !Array.isArray(value.state?.meals) ||
    !Array.isArray(value.usage)
  )
    throw new Error("Invalid backup contents.");
  for (const row of value.usage)
    if (
      typeof row.user_id !== "string" ||
      !Number.isFinite(Date.parse(row.window_start)) ||
      !Number.isInteger(row.request_count) ||
      row.request_count < 0
    )
      throw new Error("Invalid quota snapshot.");
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
async function restoreDrill(client, snapshot) {
  validateSnapshot(snapshot);
  const schema = "nl_restore_" + crypto.randomBytes(10).toString("hex");
  let created = false;
  try {
    // Never reuse a schema, overwrite existing tables or set a public search path.
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await client.query("BEGIN");
    await client.query(
      `CREATE TABLE "${schema}".diet_app_state (id integer PRIMARY KEY CHECK(id=1), payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await client.query(
      `CREATE TABLE "${schema}".diet_ai_usage (user_id text PRIMARY KEY, window_start timestamptz NOT NULL, request_count integer NOT NULL)`,
    );
    await client.query(
      `INSERT INTO "${schema}".diet_app_state (id,payload) VALUES (1,$1::jsonb)`,
      [JSON.stringify(snapshot.state)],
    );
    for (const row of snapshot.usage)
      await client.query(
        `INSERT INTO "${schema}".diet_ai_usage VALUES ($1,$2,$3)`,
        [row.user_id, row.window_start, row.request_count],
      );
    await client.query("COMMIT");
    const state = (
      await client.query(
        `SELECT payload FROM "${schema}".diet_app_state WHERE id=1`,
      )
    ).rows[0].payload;
    const usage = (
      await client.query(
        `SELECT * FROM "${schema}".diet_ai_usage ORDER BY user_id`,
      )
    ).rows.map((r) => ({ ...r, window_start: r.window_start.toISOString() }));
    const expected = snapshot.usage
      .map((r) => ({
        ...r,
        window_start: new Date(r.window_start).toISOString(),
      }))
      .sort((a, b) => a.user_id.localeCompare(b.user_id));
    // Sort quota rows with the same JS ordering, independent of DB collation.
    usage.sort((a, b) => a.user_id.localeCompare(b.user_id));
    if (
      JSON.stringify(canonical(state)) !==
        JSON.stringify(canonical(snapshot.state)) ||
      JSON.stringify(canonical(usage)) !== JSON.stringify(canonical(expected))
    )
      throw new Error("Restored data did not match snapshot.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
}
if (require.main === module)
  main().catch(() => {
    console.error(
      "Backup failed. Check configuration, credentials and the destination.",
    );
    process.exitCode = 1;
  });
module.exports = { encrypt, decrypt, validateSnapshot, restoreDrill };
