import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sharing content that an older release created.
 *
 * Every end-to-end test starts from an empty data directory, so they only ever
 * exercise content created by the current version. An instance that has been
 * upgraded is full of rows sealed the way previous releases sealed them, and
 * that is the state a share has to cope with:
 *
 * - a group whose key exists only as the master-wrapped copy (before per-member
 *   keys), and
 * - folders already sealed with a group's own key (before key scopes).
 *
 * Both of those threw "Unsupported state or unable to authenticate data" on a
 * real instance while every test here stayed green.
 */

let dir: string;

async function boot(dataDir: string) {
  process.env.DATA_DIR = dataDir;
  process.env.MASTER_KEY = Buffer.alloc(32, 5).toString("base64");
  process.env.SESSION_SECRET = Buffer.alloc(48, 6).toString("base64");
  vi.resetModules();
  const { ensureSchema } = await import("../../db/bootstrap.js");
  ensureSchema();
  return {
    db: await import("../../db/client.js"),
    groups: await import("../service.js"),
    folders: await import("../../folders/service.js"),
    bookmarks: await import("../../bookmarks/service.js"),
    keys: await import("../keys.js"),
    enc: await import("../encryption.js"),
    userKeys: await import("../../auth/userKeys.js"),
    crypto: await import("@awesome-bookmarks/crypto"),
    encryption: await import("../../auth/encryption.js"),
  };
}

/** A user row written directly: signing up properly costs an Argon2 hash. */
function seedUser(sqlite: Database.Database, id: string, email: string) {
  sqlite
    .prepare(
      `INSERT INTO users (id, email, nickname, password_hash, kdf_salt, master_wrap)
       VALUES (?, ?, ?, 'x', x'00', x'00')`,
    )
    .run(id, email, email.split("@")[0]);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-legacy-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("sharing content from an older release", () => {
  it("shares a group whose key only exists master-wrapped", async () => {
    const m = await boot(dir);
    const sqlite = m.db.getSqlite();
    const userId = "11111111-1111-4111-8111-111111111111";
    seedUser(sqlite, userId, "old@example.com");

    const ctx = { userId, dek: Buffer.alloc(32, 9) };

    // A group as v0.77 wrote one: master-wrapped key, no member copies.
    const groupId = "22222222-2222-4222-8222-222222222222";
    const groupKey = m.crypto.generateDEK();
    sqlite
      .prepare(
        `INSERT INTO groups (id, owner_id, name, group_dek_wrapped, key_version, recoverable)
         VALUES (?, ?, 'Viejo', ?, 1, 0)`,
      )
      .run(groupId, userId, m.enc.wrapGroupDek(groupId, groupKey));
    sqlite
      .prepare(
        `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')`,
      )
      .run(groupId, userId);

    const folder = m.folders.createFolder(ctx, { name: "Vieja" });

    // The share must not throw, and the content must end up readable.
    expect(() =>
      m.groups.shareToGroup(ctx, groupId, {
        sourceType: "folder",
        sourceId: folder.id,
      }),
    ).not.toThrow();

    expect(m.folders.getFolder(ctx, folder.id).name).toBe("Vieja");
  });

  it("shares a folder already sealed with a group's own key", async () => {
    const m = await boot(dir);
    const sqlite = m.db.getSqlite();
    const userId = "33333333-3333-4333-8333-333333333333";
    seedUser(sqlite, userId, "prev@example.com");
    const ctx = { userId, dek: Buffer.alloc(32, 4) };

    const groupId = "44444444-4444-4444-8444-444444444444";
    sqlite
      .prepare(
        `INSERT INTO groups (id, owner_id, name, group_dek_wrapped, key_version, recoverable)
         VALUES (?, ?, 'Grupo', NULL, 1, 0)`,
      )
      .run(groupId, userId);
    sqlite
      .prepare(
        `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')`,
      )
      .run(groupId, userId);
    m.userKeys.ensureUserKeys(userId, ctx.dek);
    const groupKey = m.keys.createGroupKey(groupId, false);

    const folder = m.folders.createFolder(ctx, {
      name: "Compartida antes",
      description: "<p>hola</p>",
    });
    m.bookmarks.createBookmark(ctx, {
      folderId: folder.id,
      url: "https://viejo.example/",
      title: "Antiguo",
      fetchSnapshot: false,
    });

    // Rewrite both rows the way v0.78 sealed group-owned content: with the
    // group's own key, AAD scoped to the group id, and `key_group_id` set.
    const toGroup = (field: string, plain: string) =>
      m.encryption.sealField(groupKey, groupId, field, plain);
    sqlite
      .prepare(
        `UPDATE folders SET key_group_id = ?, key_scope_id = NULL,
           name_ct = ?, description_ct = ? WHERE id = ?`,
      )
      .run(
        groupId,
        toGroup("folder.name", "Compartida antes"),
        toGroup("folder.description", "<p>hola</p>"),
        folder.id,
      );
    sqlite
      .prepare(
        `UPDATE bookmarks SET key_group_id = ?, key_scope_id = NULL,
           title_ct = ?, url_ct = ? WHERE folder_id = ?`,
      )
      .run(
        groupId,
        toGroup("bookmark.title", "Antiguo"),
        toGroup("bookmark.url", "https://viejo.example/"),
        folder.id,
      );

    // Sharing it again (with the same group or another) has to promote it to a
    // key scope without losing the ability to read it.
    expect(() =>
      m.groups.shareToGroup(ctx, groupId, {
        sourceType: "folder",
        sourceId: folder.id,
      }),
    ).not.toThrow();

    const after = m.folders.getFolder(ctx, folder.id);
    expect(after.name).toBe("Compartida antes");
    expect(after.description).toContain("hola");
    expect(
      m.bookmarks.listBookmarks(ctx, {}).map((b) => b.title),
    ).toContain("Antiguo");
  });
});
