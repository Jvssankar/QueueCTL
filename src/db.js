import Database from "better-sqlite3";
import { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = `${__dirname}/../data`;
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = `${DB_DIR}/queuectl.db`;

const db = new Database(DB_PATH);

function migrate() {
  // jobs table: main queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      locked_by TEXT,
      locked_at TEXT,
      run_after TEXT,        -- ISO timestamp: for backoff/delayed runs
      output TEXT
    );
  `);

  // dlq table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dlq (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      max_retries INTEGER NOT NULL,
      failed_at TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // default config if not present
  const getCfg = db.prepare("SELECT value FROM config WHERE key = ?");
  const setCfg = db.prepare(
    "INSERT OR REPLACE INTO config(key,value) VALUES(?,?)"
  );

  if (!getCfg.get("backoff_base")) setCfg.run("backoff_base", "2"); // base
  if (!getCfg.get("base_delay_seconds")) setCfg.run("base_delay_seconds", "1"); // base delay
  if (!getCfg.get("max_retries")) setCfg.run("max_retries", "3");
}
migrate();

export default db;
