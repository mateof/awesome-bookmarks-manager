import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getEnv } from "../env.js";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

export function dbPath(): string {
  return resolve(getEnv().DATA_DIR, "db.sqlite");
}

export function getDb() {
  if (_db) return _db;
  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  ensureFts5(sqlite);
  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });
  return _db;
}

export function getSqlite(): Database.Database {
  if (!_sqlite) getDb();
  return _sqlite!;
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

/**
 * FTS5 virtual table is created here (rather than via Drizzle migrations)
 * because Drizzle does not currently model virtual tables.
 */
function ensureFts5(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS snapshots_fts USING fts5(
      bookmark_id UNINDEXED,
      user_id UNINDEXED,
      content,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
}

export { schema };
