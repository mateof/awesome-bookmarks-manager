import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "node:path";
import { getDb } from "./client.js";

export function runMigrations() {
  const db = getDb();
  migrate(db, { migrationsFolder: resolve(import.meta.dirname, "migrations") });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  console.log("[db] migrations applied");
}
