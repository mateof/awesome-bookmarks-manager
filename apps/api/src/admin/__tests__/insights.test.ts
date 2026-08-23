import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin panel.
 *
 * Two things are worth pinning down. The first is mundane and the reason this
 * file exists at all: the counts are raw SQL over table and column names, which
 * typecheck fine and fail at runtime when one is wrong.
 *
 * The second is the point of the feature. An admin holds nobody's key, so the
 * panel is metadata and must stay metadata. The last test spells that out, so
 * that adding a folder name to this response has to be a decision somebody
 * makes on purpose against a failing test, not a small convenience nobody
 * noticed.
 */

let dir: string;

async function boot(dataDir: string) {
  process.env.DATA_DIR = dataDir;
  process.env.MASTER_KEY = Buffer.alloc(32, 11).toString("base64");
  process.env.SESSION_SECRET = Buffer.alloc(48, 12).toString("base64");
  vi.resetModules();
  const { ensureSchema } = await import("../../db/bootstrap.js");
  ensureSchema();
  return {
    db: await import("../../db/client.js"),
    insights: await import("../insights.js"),
    folders: await import("../../folders/service.js"),
    bookmarks: await import("../../bookmarks/service.js"),
    tags: await import("../../tags/service.js"),
  };
}

function seedUser(
  sqlite: import("better-sqlite3").Database,
  id: string,
  email: string,
  role: "user" | "admin",
) {
  sqlite
    .prepare(
      `INSERT INTO users (id, email, nickname, password_hash, kdf_salt, master_wrap, role)
       VALUES (?, ?, ?, 'x', x'00', x'00', ?)`,
    )
    .run(id, email, email.split("@")[0], role);
}

const ADMIN = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
const OTHER = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-insights-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("admin insights", () => {
  it("counts what each account holds, and the instance as a whole", async () => {
    const m = await boot(dir);
    const sqlite = m.db.getSqlite();
    seedUser(sqlite, ADMIN, "admin@example.com", "admin");
    seedUser(sqlite, OTHER, "other@example.com", "user");
    const adminCtx = { userId: ADMIN, dek: Buffer.alloc(32, 1) };
    const otherCtx = { userId: OTHER, dek: Buffer.alloc(32, 2) };

    const f = m.folders.createFolder(otherCtx, { name: "Suya" });
    m.bookmarks.createBookmark(otherCtx, {
      folderId: f.id,
      url: "https://uno.invalid/",
      fetchSnapshot: false,
    });
    const gone = m.bookmarks.createBookmark(otherCtx, {
      url: "https://dos.invalid/",
      fetchSnapshot: false,
    });
    m.bookmarks.deleteBookmark(otherCtx, gone.id);
    m.tags.createTag(otherCtx, { name: "eti", color: "#abcdef" });

    const out = await m.insights.getInsights(adminCtx);

    const them = out.users.find((u) => u.userId === OTHER)!;
    expect(them.counts.folders).toBe(1);
    // The deleted one counts as trash, not as a live bookmark.
    expect(them.counts.bookmarks).toBe(1);
    expect(them.counts.trashed).toBe(1);
    expect(them.counts.tags).toBe(1);
    expect(them.counts.snapshots).toBe(0);

    expect(out.instance.users).toBe(2);
    expect(out.instance.admins).toBe(1);
    expect(out.instance.counts.bookmarks).toBe(1);
    // Nobody has a session, so nobody is active and everybody is "never in".
    expect(out.instance.activeWeek).toBe(0);
    expect(out.instance.neverSignedIn).toBe(2);
    // Thirty days, gaps filled: a strip with holes reads as a busy instance.
    expect(out.instance.activity).toHaveLength(30);
  });

  it("reports last seen from the sessions, revoked ones included", async () => {
    const m = await boot(dir);
    const sqlite = m.db.getSqlite();
    seedUser(sqlite, ADMIN, "admin2@example.com", "admin");
    seedUser(sqlite, OTHER, "other2@example.com", "user");

    sqlite
      .prepare(
        `INSERT INTO user_sessions (id, user_id, ip, user_agent, created_at, last_seen_at, revoked_at)
         VALUES ('s1', ?, '', '', ?, ?, NULL),
                ('s2', ?, '', '', ?, ?, ?)`,
      )
      .run(
        OTHER,
        "2026-08-20T10:00:00.000Z",
        "2026-08-20T10:00:00.000Z",
        OTHER,
        "2026-08-22T10:00:00.000Z",
        // The most recent activity sits on a session that was later revoked.
        // Ignoring it would report this account as less recently seen than it
        // was, which is the opposite of useful.
        "2026-08-22T18:00:00.000Z",
        "2026-08-22T19:00:00.000Z",
      );

    const out = await m.insights.getInsights({
      userId: ADMIN,
      dek: Buffer.alloc(32, 1),
    });
    const them = out.users.find((u) => u.userId === OTHER)!;
    expect(them.lastSeenAt).toBe("2026-08-22T18:00:00.000Z");
    expect(them.activeSessions).toBe(1);
  });

  it("refuses anyone who is not an admin", async () => {
    const m = await boot(dir);
    seedUser(m.db.getSqlite(), OTHER, "nope@example.com", "user");
    await expect(
      m.insights.getInsights({ userId: OTHER, dek: Buffer.alloc(32, 3) }),
    ).rejects.toThrow();
  });

  it("carries no decrypted content anywhere in the response", async () => {
    const m = await boot(dir);
    const sqlite = m.db.getSqlite();
    seedUser(sqlite, ADMIN, "admin3@example.com", "admin");
    seedUser(sqlite, OTHER, "other3@example.com", "user");
    const otherCtx = { userId: OTHER, dek: Buffer.alloc(32, 4) };

    // Distinctive enough that a leak could not be a coincidence.
    m.folders.createFolder(otherCtx, {
      name: "Carpeta secretisima Zzyzx",
      description: "<p>descripcion secretisima Zzyzx</p>",
    });
    m.bookmarks.createBookmark(otherCtx, {
      url: "https://secretisimo-zzyzx.invalid/",
      title: "Titulo secretisimo Zzyzx",
      fetchSnapshot: false,
    });

    const out = await m.insights.getInsights({
      userId: ADMIN,
      dek: Buffer.alloc(32, 1),
    });
    // The admin's own key cannot open another account's rows, and the panel
    // must not pretend otherwise: it is counts, bytes and timestamps.
    expect(JSON.stringify(out)).not.toContain("Zzyzx");
    expect(JSON.stringify(out)).not.toContain("zzyzx");
  });
});
