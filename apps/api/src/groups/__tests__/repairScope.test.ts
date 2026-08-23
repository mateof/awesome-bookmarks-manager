import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rows that ended up inside a shared folder without its key.
 *
 * The failure mode is the quiet one. Sharing does not change who owns a row, so
 * a row created inside a shared folder with its creator's own key looks fine
 * from the owner's side and is **invisible to the group**: `visibleTo` needs a
 * scope the group can reach, and this row has none. Nobody reports it, because
 * the only person who could see that something is missing is the one who cannot
 * see it.
 *
 * Two things are pinned here: that creating such a row is no longer possible,
 * and that sharing the folder again repairs whatever a previous version left
 * behind — which is the only fix a person can perform without being told about
 * key scopes.
 */

let dir: string;

async function boot(dataDir: string) {
  process.env.DATA_DIR = dataDir;
  process.env.MASTER_KEY = Buffer.alloc(32, 21).toString("base64");
  process.env.SESSION_SECRET = Buffer.alloc(48, 22).toString("base64");
  vi.resetModules();
  const { ensureSchema } = await import("../../db/bootstrap.js");
  ensureSchema();
  return {
    db: await import("../../db/client.js"),
    groups: await import("../service.js"),
    keys: await import("../keys.js"),
    folders: await import("../../folders/service.js"),
    bookmarks: await import("../../bookmarks/service.js"),
    aliases: await import("../../aliases/service.js"),
    importJob: await import("../../jobs/handlers/import.js"),
    userKeys: await import("../../auth/userKeys.js"),
    encryption: await import("../../auth/encryption.js"),
  };
}

const OWNER = "aaaa1111-aaaa-4aaa-8aaa-aaaa1111aaaa";
const MEMBER = "bbbb2222-bbbb-4bbb-8bbb-bbbb2222bbbb";
const GROUP = "cccc3333-cccc-4ccc-8ccc-cccc3333cccc";

function seed(m: Awaited<ReturnType<typeof boot>>) {
  const sqlite = m.db.getSqlite();
  for (const [id, email] of [
    [OWNER, "owner@example.com"],
    [MEMBER, "member@example.com"],
  ]) {
    sqlite
      .prepare(
        `INSERT INTO users (id, email, nickname, password_hash, kdf_salt, master_wrap)
         VALUES (?, ?, ?, 'x', x'00', x'00')`,
      )
      .run(id, email, email!.split("@")[0]);
  }
  const ownerCtx = { userId: OWNER, dek: Buffer.alloc(32, 1) };
  const memberCtx = { userId: MEMBER, dek: Buffer.alloc(32, 2) };
  m.userKeys.ensureUserKeys(OWNER, ownerCtx.dek);
  m.userKeys.ensureUserKeys(MEMBER, memberCtx.dek);
  sqlite
    .prepare(
      `INSERT INTO groups (id, owner_id, name, group_dek_wrapped, key_version, recoverable)
       VALUES (?, ?, 'Equipo', NULL, 1, 0)`,
    )
    .run(GROUP, OWNER);
  sqlite
    .prepare(
      `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner'), (?, ?, 'editor')`,
    )
    .run(GROUP, OWNER, GROUP, MEMBER);
  m.keys.createGroupKey(GROUP, false);
  return { ownerCtx, memberCtx };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-repair-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("rows inside a shared folder", () => {
  it("gives an imported bookmark the folder's key", async () => {
    const m = await boot(dir);
    const { ownerCtx, memberCtx } = seed(m);
    const folder = m.folders.createFolder(ownerCtx, { name: "Destino" });
    m.groups.shareToGroup(ownerCtx, GROUP, {
      sourceType: "folder",
      sourceId: folder.id,
    });

    await m.importJob.runImportJob(OWNER, ownerCtx.dek, {
      parentId: folder.id,
      fetchSnapshots: false,
      html: `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="https://importado.invalid/">Importado</A></DL>`,
    });

    const seen = m.bookmarks
      .listBookmarks(memberCtx, { folderId: folder.id })
      .map((b) => b.title);
    expect(seen).toContain("Importado");
  });

  it("gives a symlink the key of the folder it is dropped into", async () => {
    const m = await boot(dir);
    const { ownerCtx, memberCtx } = seed(m);
    const shared = m.folders.createFolder(ownerCtx, { name: "Compartida" });
    const elsewhere = m.folders.createFolder(ownerCtx, { name: "Aparte" });
    const target = m.bookmarks.createBookmark(ownerCtx, {
      folderId: elsewhere.id,
      url: "https://enlazado.invalid/",
      title: "Enlazado",
      fetchSnapshot: false,
    });
    m.groups.shareToGroup(ownerCtx, GROUP, {
      sourceType: "folder",
      sourceId: shared.id,
    });

    m.aliases.createBookmarkAlias(ownerCtx, target.id, shared.id);

    // A symlink the group cannot see reads as the link never having been made.
    const seen = m.bookmarks
      .listBookmarks(memberCtx, { folderId: shared.id })
      .map((b) => b.title);
    expect(seen).toContain("Enlazado");
  });

  it("repairs a stranded row when the folder is shared again", async () => {
    const m = await boot(dir);
    const { ownerCtx, memberCtx } = seed(m);
    const folder = m.folders.createFolder(ownerCtx, { name: "Con huérfano" });
    const stray = m.bookmarks.createBookmark(ownerCtx, {
      folderId: folder.id,
      url: "https://huerfano.invalid/",
      title: "Huerfano",
      fetchSnapshot: false,
    });
    m.groups.shareToGroup(ownerCtx, GROUP, {
      sourceType: "folder",
      sourceId: folder.id,
    });

    // Put the row back the way a previous release left it: the owner's own key,
    // no scope, sitting inside a folder that has one.
    const sqlite = m.db.getSqlite();
    sqlite
      .prepare(
        `UPDATE bookmarks SET key_scope_id = NULL, key_group_id = NULL,
           title_ct = ?, url_ct = ? WHERE id = ?`,
      )
      .run(
        m.encryption.sealField(ownerCtx.dek, OWNER, "bookmark.title", "Huerfano"),
        m.encryption.sealField(
          ownerCtx.dek,
          OWNER,
          "bookmark.url",
          "https://huerfano.invalid/",
        ),
        stray.id,
      );

    // Invisible to the group, and perfectly readable by its owner. That gap is
    // the whole problem.
    expect(
      m.bookmarks.listBookmarks(memberCtx, { folderId: folder.id }).map((b) => b.title),
    ).not.toContain("Huerfano");
    expect(
      m.bookmarks.listBookmarks(ownerCtx, { folderId: folder.id }).map((b) => b.title),
    ).toContain("Huerfano");

    // Sharing the same folder with the same group again used to be a no-op.
    m.groups.shareToGroup(ownerCtx, GROUP, {
      sourceType: "folder",
      sourceId: folder.id,
    });

    expect(
      m.bookmarks.listBookmarks(memberCtx, { folderId: folder.id }).map((b) => b.title),
    ).toContain("Huerfano");
    // And the owner did not lose it on the way.
    expect(
      m.bookmarks.listBookmarks(ownerCtx, { folderId: folder.id }).map((b) => b.title),
    ).toContain("Huerfano");
  });

  it("leaves an already-correct share alone", async () => {
    const m = await boot(dir);
    const { ownerCtx, memberCtx } = seed(m);
    const folder = m.folders.createFolder(ownerCtx, { name: "Sana" });
    m.bookmarks.createBookmark(ownerCtx, {
      folderId: folder.id,
      url: "https://sano.invalid/",
      title: "Sano",
      fetchSnapshot: false,
    });
    m.groups.shareToGroup(ownerCtx, GROUP, {
      sourceType: "folder",
      sourceId: folder.id,
    });

    // Re-sharing walks the subtree now, so it has to be safe to do twice.
    const before = m.db
      .getSqlite()
      .prepare(`SELECT key_scope_id AS s FROM bookmarks WHERE title_ct IS NOT NULL`)
      .all() as { s: string | null }[];
    m.groups.shareToGroup(ownerCtx, GROUP, {
      sourceType: "folder",
      sourceId: folder.id,
    });
    const after = m.db
      .getSqlite()
      .prepare(`SELECT key_scope_id AS s FROM bookmarks WHERE title_ct IS NOT NULL`)
      .all() as { s: string | null }[];
    expect(after).toEqual(before);
    expect(
      m.bookmarks.listBookmarks(memberCtx, { folderId: folder.id }).map((b) => b.title),
    ).toContain("Sano");
  });
});
