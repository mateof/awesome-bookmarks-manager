import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Upgrading an existing database.
 *
 * Every other test in this repo starts from an empty data directory, so they
 * all exercise the `CREATE TABLE` path and none of them exercise the migration
 * path. That gap shipped a crash loop: `relaxGroupDekNotNull` rebuilt the
 * `groups` table with a SELECT naming `key_version`, and ran *before* the
 * ALTER that adds it, so every server with existing data failed to boot with
 * "no such column: key_version".
 *
 * These tests build a database shaped like an older release and boot the
 * schema over it. They are cheap and they are the only thing standing between
 * a migration mistake and somebody's server.
 */

let dir: string;

/** The `groups` table as it was before group keys moved to the members. */
function legacyDatabase(file: string) {
  const sql = new Database(file);
  sql.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      kdf_salt BLOB NOT NULL,
      master_wrap BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      group_dek_wrapped BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE TABLE group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (current_timestamp),
      PRIMARY KEY (group_id, user_id)
    );
    INSERT INTO users (id, email, password_hash, kdf_salt, master_wrap)
      VALUES ('u1', 'a@example.com', 'x', x'00', x'00');
    INSERT INTO groups (id, owner_id, name, group_dek_wrapped)
      VALUES ('g1', 'u1', 'Equipo', x'0102030405');
    INSERT INTO group_members (group_id, user_id, role)
      VALUES ('g1', 'u1', 'owner');
  `);
  sql.close();
}

async function boot(dataDir: string) {
  process.env.DATA_DIR = dataDir;
  process.env.MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.SESSION_SECRET = Buffer.alloc(48, 9).toString("base64");
  // The env and the sqlite handle are both cached in module scope, so the
  // registry has to be cleared or a second boot reuses the first one's file.
  vi.resetModules();
  const { ensureSchema } = await import("../bootstrap.js");
  ensureSchema();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-migration-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("ensureSchema over an existing database", () => {
  it("boots a database written before group keys existed", async () => {
    legacyDatabase(join(dir, "db.sqlite"));
    await expect(boot(dir)).resolves.not.toThrow();

    const sql = new Database(join(dir, "db.sqlite"));
    const cols = sql.prepare("PRAGMA table_info(groups)").all() as {
      name: string;
      notnull: number;
    }[];
    const wrapped = cols.find((c) => c.name === "group_dek_wrapped");
    // The whole point of the rebuild: the column has to accept null, because
    // a group whose key lives with its members has nothing to put there.
    expect(wrapped?.notnull).toBe(0);
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining(["key_version", "recoverable"]),
    );

    // And it is a migration, not a fresh start: the existing rows survive.
    const row = sql
      .prepare("SELECT id, name, group_dek_wrapped FROM groups WHERE id = 'g1'")
      .get() as { id: string; name: string; group_dek_wrapped: Buffer };
    expect(row.name).toBe("Equipo");
    expect(Buffer.from(row.group_dek_wrapped)).toEqual(
      Buffer.from([1, 2, 3, 4, 5]),
    );
    // Members are referenced by `groups` through a foreign key, and the table
    // is dropped mid-rebuild; losing them is the failure mode that made the
    // rebuild switch foreign keys off.
    expect(
      sql.prepare("SELECT count(*) AS n FROM group_members").get(),
    ).toEqual({ n: 1 });
    sql.close();
  });

  it("is idempotent: booting twice changes nothing", async () => {
    legacyDatabase(join(dir, "db.sqlite"));
    await boot(dir);
    await expect(boot(dir)).resolves.not.toThrow();

    const sql = new Database(join(dir, "db.sqlite"));
    expect(sql.prepare("SELECT count(*) AS n FROM groups").get()).toEqual({
      n: 1,
    });
    // The rebuild is guarded on the current shape, so a second run must not
    // leave its scratch table behind.
    const tables = sql
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).not.toContain("groups_migrated");
    sql.close();
  });

  it("boots an empty directory, which is the fresh-install path", async () => {
    await expect(boot(dir)).resolves.not.toThrow();
    const sql = new Database(join(dir, "db.sqlite"));
    const cols = sql.prepare("PRAGMA table_info(groups)").all() as {
      name: string;
    }[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining(["key_version", "recoverable"]),
    );
    sql.close();
  });
});
