import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PAGE =
  "<!doctype html><html><head><title>Buscador</title></head><body><article><p>Una página cualquiera con texto suficiente para que Readability la considere un artículo de verdad y no devuelva null.</p></article></body></html>";

// The fetch is not what is under test, and letting it out to the network would
// make this depend on undici's option handling under the test runner and on
// whatever some real site answers today.
vi.mock("undici", () => ({
  request: async () => ({
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: (async function* () {
      yield Buffer.from(PAGE);
    })(),
  }),
}));

/**
 * Background jobs touching a row that a group can read.
 *
 * A row sealed with a scope key is opened with that key, not with its owner's.
 * `openRowField` exists for exactly that, and the conversion was done field by
 * field, so the fields nobody happened to exercise kept the old call. They fail
 * as "Unsupported state or unable to authenticate data", which is AES-GCM
 * refusing to authenticate, and it reads like a network problem when it
 * surfaces as "could not capture the snapshot".
 *
 * The trap is that it only bites once the row is shared: sharing does not
 * change who owns a bookmark, so `userId` still matches and the job runs, it
 * just cannot read what it selected.
 */

let dir: string;
const URL_UNDER_TEST = "https://ejemplo.invalid/buscar";

async function boot(dataDir: string) {
  process.env.DATA_DIR = dataDir;
  process.env.MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.SESSION_SECRET = Buffer.alloc(48, 8).toString("base64");
  vi.resetModules();
  const { ensureSchema } = await import("../../db/bootstrap.js");
  ensureSchema();
  return {
    db: await import("../../db/client.js"),
    groups: await import("../../groups/service.js"),
    folders: await import("../../folders/service.js"),
    bookmarks: await import("../../bookmarks/service.js"),
    userKeys: await import("../../auth/userKeys.js"),
    keys: await import("../../groups/keys.js"),
    snapshot: await import("../handlers/snapshot.js"),
    shares: await import("../../shares/service.js"),
    shareSeal: await import("../handlers/share_seal.js"),
    importJob: await import("../handlers/import.js"),
    trash: await import("../../trash/service.js"),
  };
}

/** A group the user owns, with a key they hold. */
function seedGroup(
  m: { db: { getSqlite: () => import("better-sqlite3").Database };
       keys: { createGroupKey: (id: string, r: boolean) => Buffer } },
  groupId: string,
  userId: string,
) {
  const sqlite = m.db.getSqlite();
  sqlite
    .prepare(
      `INSERT INTO groups (id, owner_id, name, group_dek_wrapped, key_version, recoverable)
       VALUES (?, ?, 'Equipo', NULL, 1, 0)`,
    )
    .run(groupId, userId);
  sqlite
    .prepare(
      `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')`,
    )
    .run(groupId, userId);
  m.keys.createGroupKey(groupId, false);
}

function seedUser(
  sqlite: import("better-sqlite3").Database,
  id: string,
  email: string,
) {
  sqlite
    .prepare(
      `INSERT INTO users (id, email, nickname, password_hash, kdf_salt, master_wrap)
       VALUES (?, ?, ?, 'x', x'00', x'00')`,
    )
    .run(id, email, email.split("@")[0]);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-jobs-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("snapshotting a bookmark the group can read", () => {
  it("re-snapshots a bookmark inside a folder its owner shared", async () => {
    const m = await boot(dir);
    const sqlite = m.db.getSqlite();
    const userId = "55555555-5555-4555-8555-555555555555";
    seedUser(sqlite, userId, "snap@example.com");
    const ctx = { userId, dek: Buffer.alloc(32, 3) };
    m.userKeys.ensureUserKeys(userId, ctx.dek);

    const groupId = "66666666-6666-4666-8666-666666666666";
    sqlite
      .prepare(
        `INSERT INTO groups (id, owner_id, name, group_dek_wrapped, key_version, recoverable)
         VALUES (?, ?, 'Equipo', NULL, 1, 0)`,
      )
      .run(groupId, userId);
    sqlite
      .prepare(
        `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')`,
      )
      .run(groupId, userId);
    m.keys.createGroupKey(groupId, false);

    const folder = m.folders.createFolder(ctx, { name: "Buscadores" });
    // The title is the URL, which is what makes the job try to improve it and
    // reach the field that was being opened with the wrong key.
    const bookmark = m.bookmarks.createBookmark(ctx, {
      folderId: folder.id,
      url: URL_UNDER_TEST,
      fetchSnapshot: false,
    });

    // Sharing re-seals the folder and everything under it with a scope key.
    // The owner is still the owner: nothing about the row's ownership moves.
    m.groups.shareToGroup(ctx, groupId, {
      sourceType: "folder",
      sourceId: folder.id,
    });

    await expect(
      m.snapshot.runSnapshotJob(userId, ctx.dek, { bookmarkId: bookmark.id }),
    ).resolves.not.toThrow();

    // The captured title landed, and everyone who could read the bookmark
    // before can still read it: writing the title back with the wrong key
    // would have turned a failure into silent corruption.
    const after = m.bookmarks.getBookmark(ctx, bookmark.id);
    expect(after.title).toBe("Buscador");
    expect(after.url).toBe(URL_UNDER_TEST);
    expect(after.snapshotStatus).toBe("ready");
  });

  it("still snapshots an ordinary bookmark nobody shared", async () => {
    const m = await boot(dir);
    const sqlite = m.db.getSqlite();
    const userId = "77777777-7777-4777-8777-777777777777";
    seedUser(sqlite, userId, "solo@example.com");
    const ctx = { userId, dek: Buffer.alloc(32, 6) };
    m.userKeys.ensureUserKeys(userId, ctx.dek);

    const bookmark = m.bookmarks.createBookmark(ctx, {
      url: URL_UNDER_TEST,
      fetchSnapshot: false,
    });
    await m.snapshot.runSnapshotJob(userId, ctx.dek, {
      bookmarkId: bookmark.id,
    });

    const after = m.bookmarks.getBookmark(ctx, bookmark.id);
    expect(after.title).toBe("Buscador");
    expect(after.snapshotStatus).toBe("ready");
  });
});

describe("other jobs on a row the group can read", () => {
  it("seals a public share of a shared folder that has a description", async () => {
    const m = await boot(dir);
    const userId = "88888888-8888-4888-8888-888888888888";
    seedUser(m.db.getSqlite(), userId, "seal@example.com");
    const ctx = { userId, dek: Buffer.alloc(32, 2) };
    m.userKeys.ensureUserKeys(userId, ctx.dek);
    const groupId = "99999999-9999-4999-8999-999999999999";
    seedGroup(m, groupId, userId);

    // Descriptions are the fields the conversion to row keys missed, on both
    // folders and bookmarks, so both are present here.
    const folder = m.folders.createFolder(ctx, {
      name: "Con texto",
      description: "<p>una carpeta descrita</p>",
    });
    m.bookmarks.createBookmark(ctx, {
      folderId: folder.id,
      url: URL_UNDER_TEST,
      title: "Descrito",
      description: "<p>un bookmark descrito</p>",
      fetchSnapshot: false,
    });
    m.groups.shareToGroup(ctx, groupId, {
      sourceType: "folder",
      sourceId: folder.id,
    });

    const link = await m.shares.createShare(ctx, {
      targetType: "folder",
      targetId: folder.id,
    });
    await expect(
      m.shareSeal.runShareSealJob(userId, ctx.dek, { shareId: link.id }),
    ).resolves.not.toThrow();
  });

  it("imports into a shared folder with the key that folder uses", async () => {
    const m = await boot(dir);
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    seedUser(m.db.getSqlite(), userId, "imp@example.com");
    const ctx = { userId, dek: Buffer.alloc(32, 1) };
    m.userKeys.ensureUserKeys(userId, ctx.dek);
    const groupId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    seedGroup(m, groupId, userId);

    const folder = m.folders.createFolder(ctx, { name: "Destino" });
    m.groups.shareToGroup(ctx, groupId, {
      sourceType: "folder",
      sourceId: folder.id,
    });

    await m.importJob.runImportJob(userId, ctx.dek, {
      parentId: folder.id,
      fetchSnapshots: false,
      html: `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="https://importado.invalid/">Importado</A></DL>`,
    });

    // The row has to carry the folder's key, not the owner's. Sealed with the
    // owner's DEK it reads fine for them and not at all for the group, which is
    // the kind of failure nobody reports because nobody sees it.
    const imported = m.bookmarks
      .listBookmarks(ctx, { folderId: folder.id })
      .find((b: { title: string }) => b.title === "Importado");
    expect(imported).toBeTruthy();
    expect(imported!.keyScopeId ?? imported!.keyGroupId).toBeTruthy();
    expect(imported!.shared).toBe(true);
  });
});

describe("the trash of a shared bookmark", () => {
  it("lists a deleted bookmark that belongs to a shared folder", async () => {
    const m = await boot(dir);
    const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    seedUser(m.db.getSqlite(), userId, "trash@example.com");
    const ctx = { userId, dek: Buffer.alloc(32, 8) };
    m.userKeys.ensureUserKeys(userId, ctx.dek);
    const groupId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    seedGroup(m, groupId, userId);

    const folder = m.folders.createFolder(ctx, { name: "Compartida" });
    const bookmark = m.bookmarks.createBookmark(ctx, {
      folderId: folder.id,
      url: URL_UNDER_TEST,
      title: "Borrado",
      fetchSnapshot: false,
    });
    m.groups.shareToGroup(ctx, groupId, {
      sourceType: "folder",
      sourceId: folder.id,
    });
    m.bookmarks.deleteBookmark(ctx, bookmark.id);

    // This one never threw: the decrypt failure was swallowed and the row was
    // dropped from the listing. Deleting a shared bookmark made it disappear
    // from the trash, which is the one place you go to undo that.
    const items = m.trash.listTrash(ctx);
    const found = items.find((i: { id: string }) => i.id === bookmark.id);
    expect(found).toBeTruthy();
    expect(found!.title).toBe("Borrado");
  });
});
