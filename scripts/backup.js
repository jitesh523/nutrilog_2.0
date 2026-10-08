// Run with DATABASE_URL and BACKUP_KEY (32 random bytes, base64) in the environment.
// This command never restores over the live database.
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
  if (key.length !== 32 || !file || !["create", "verify"].includes(command))
    throw new Error(
      "Usage: BACKUP_KEY=<32-byte-base64> DATABASE_URL=<url> node scripts/backup.js create|verify /private/path/backup.nlog",
    );
  if (command === "verify") {
    const value = decrypt(fs.readFileSync(file), key);
    if (
      value.version !== 1 ||
      !Array.isArray(value.state?.users) ||
      !Array.isArray(value.state?.meals) ||
      !Array.isArray(value.usage)
    )
      throw new Error("Invalid backup contents.");
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
if (require.main === module)
  main().catch(() => {
    console.error(
      "Backup failed. Check configuration, credentials and the destination.",
    );
    process.exitCode = 1;
  });
module.exports = { encrypt, decrypt };
