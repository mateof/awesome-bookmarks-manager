import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Timestamps say which zone they are in.
 *
 * SQLite's `current_timestamp` writes `2026-08-23 08:15:00`: the right instant,
 * in UTC, with nothing saying so. A browser given that space-separated form
 * falls back to *local time*, so it lands offset by the reader's own zone —
 * two hours in Madrid in summer. Which is exactly how wrong the history looked.
 *
 * Half the columns were already right, because code that wrote them from JS
 * used `toISOString()` and got the `Z`. One row could hold `created_at` in one
 * shape and `updated_at` in the other, which broke ordering too: these are TEXT
 * columns, so `ORDER BY` is a string comparison and a space sorts before a `T`.
 */

let dir: string;

async function boot(dataDir: string) {
  process.env.DATA_DIR = dataDir;
  process.env.MASTER_KEY = Buffer.alloc(32, 4).toString("base64");
  process.env.SESSION_SECRET = Buffer.alloc(48, 5).toString("base64");
  vi.resetModules();
  const { ensureSchema } = await import("../bootstrap.js");
  ensureSchema();
  return {
    db: await import("../client.js"),
    folders: await import("../../folders/service.js"),
    versions: await import("../../versions/service.js"),
  };
}

/** What a release before this fix left in the column. */
const OLD_SHAPE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
/** What every reader can parse without guessing. */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-ts-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("stored timestamps", () => {
  it("writes new rows with an explicit UTC marker", async () => {
    const m = await boot(dir);
    const userId = "12121212-1212-4121-8121-121212121212";
    m.db
      .getSqlite()
      .prepare(
        `INSERT INTO users (id, email, nickname, password_hash, kdf_salt, master_wrap)
         VALUES (?, 'ts@example.com', 'ts', 'x', x'00', x'00')`,
      )
      .run(userId);
    const ctx = { userId, dek: Buffer.alloc(32, 1) };

    const folder = m.folders.createFolder(ctx, { name: "Cuando" });
    const row = m.db
      .getSqlite()
      .prepare(`SELECT created_at, updated_at FROM folders WHERE id = ?`)
      .get(folder.id) as { created_at: string; updated_at: string };

    expect(row.created_at).toMatch(ISO_UTC);
    expect(row.updated_at).toMatch(ISO_UTC);

    // The point of the marker: read back, it is the same instant the server
    // meant, whatever zone the reader happens to be in.
    const drift = Math.abs(Date.now() - new Date(row.created_at).getTime());
    expect(drift).toBeLessThan(60_000);
  });

  it("re-stamps rows a previous release wrote without one", async () => {
    // A database as an older version left it: unmarked timestamps everywhere.
    const dbPath = join(dir, "db.sqlite");
    const seed = new Database(dbPath);
    seed.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL,
        kdf_salt BLOB NOT NULL, master_wrap BLOB NOT NULL,
        created_at TEXT NOT NULL DEFAULT (current_timestamp),
        updated_at TEXT NOT NULL DEFAULT (current_timestamp)
      );
      INSERT INTO users (id, email, password_hash, kdf_salt, master_wrap,
                         created_at, updated_at)
      VALUES ('u1', 'old@example.com', 'x', x'00', x'00',
              '2026-05-02 10:11:51', '2026-05-02 10:11:51');
    `);
    expect(
      (seed.prepare(`SELECT created_at AS c FROM users`).get() as { c: string })
        .c,
    ).toMatch(OLD_SHAPE);
    seed.close();

    const m = await boot(dir);
    const after = m.db
      .getSqlite()
      .prepare(`SELECT created_at, updated_at FROM users WHERE id = 'u1'`)
      .get() as { created_at: string; updated_at: string };

    expect(after.created_at).toBe("2026-05-02T10:11:51.000Z");
    expect(after.updated_at).toBe("2026-05-02T10:11:51.000Z");
    // The instant does not move: it was already UTC, it just never said so.
    expect(new Date(after.created_at).getUTCHours()).toBe(10);
  });

  it("leaves values that already carry a zone alone", async () => {
    const dbPath = join(dir, "db.sqlite");
    const seed = new Database(dbPath);
    seed.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL,
        kdf_salt BLOB NOT NULL, master_wrap BLOB NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO users VALUES ('u2', 'iso@example.com', 'x', x'00', x'00',
        '2026-05-02T10:11:51.123Z', '2026-05-02T10:11:51.123Z');
    `);
    seed.close();

    const m = await boot(dir);
    const after = m.db
      .getSqlite()
      .prepare(`SELECT created_at FROM users WHERE id = 'u2'`)
      .get() as { created_at: string };
    // Milliseconds and all: re-stamping this would lose precision for nothing.
    expect(after.created_at).toBe("2026-05-02T10:11:51.123Z");
  });

  it("orders history by time once both shapes are gone", async () => {
    const m = await boot(dir);
    const sqlite = m.db.getSqlite();
    const userId = "13131313-1313-4131-8131-131313131313";
    sqlite
      .prepare(
        `INSERT INTO users (id, email, nickname, password_hash, kdf_salt, master_wrap)
         VALUES (?, 'hist@example.com', 'hist', 'x', x'00', x'00')`,
      )
      .run(userId);
    const ctx = { userId, dek: Buffer.alloc(32, 2) };

    const folder = m.folders.createFolder(ctx, { name: "Uno" });
    m.folders.updateFolder(ctx, folder.id, { name: "Dos" });
    m.folders.updateFolder(ctx, folder.id, { name: "Tres" });

    const stamps = sqlite
      .prepare(
        `SELECT created_at AS c FROM entity_versions WHERE entity_id = ?`,
      )
      .all(folder.id) as { c: string }[];
    expect(stamps.length).toBeGreaterThan(0);
    for (const s of stamps) expect(s.c).toMatch(ISO_UTC);

    // Same shape throughout, so the string comparison `ORDER BY` performs is
    // also a comparison of instants. With both shapes present it was not:
    // '2026-08-23 23:00:00' sorts before '2026-08-23T09:00:00.000Z'.
    const sorted = [...stamps].sort((a, b) => a.c.localeCompare(b.c));
    const byTime = [...stamps].sort(
      (a, b) => new Date(a.c).getTime() - new Date(b.c).getTime(),
    );
    expect(sorted.map((s) => s.c)).toEqual(byTime.map((s) => s.c));
  });
});
