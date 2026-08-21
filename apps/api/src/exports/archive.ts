import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  type ArchiveData,
  type ArchiveManifest,
  ArchiveDataSchema,
  ArchiveManifestSchema,
  type ArchiveScope,
  type ImportArchiveResult,
} from "@awesome-bookmarks/shared";
import { aeadDecrypt, aeadEncrypt } from "@awesome-bookmarks/crypto";
import archiver from "archiver";
import { randomBytes, scryptSync } from "node:crypto";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import yauzl from "yauzl";
import type { AuthedContext } from "../auth/session.js";
import { createBookmark } from "../bookmarks/service.js";
import { listBookmarks } from "../bookmarks/service.js";
import { createFolder, listFolders, subtreeFolderIds } from "../folders/service.js";
import {
  bookmarkBlobDir,
  folderBlobDir,
  readBlob,
  writeBlob,
} from "../storage/blobs.js";
import {
  listAttachments,
  readAttachment,
  storeAttachment,
} from "../attachments/service.js";
import { createTag, listTags } from "../tags/service.js";
import { APP_VERSION } from "../util/app-version.js";
import { BadRequest, NotFound } from "../util/errors.js";

/**
 * Read and write the app's portable archive.
 *
 * The whole point is that it leaves the account: blobs and text come out
 * decrypted, so the file is readable by another instance and another user.
 * That also means it is a plaintext copy of the data, which is why the
 * passphrase option exists and why the UI has to say so plainly.
 *
 * On import, rows get **new** ids. A backup restore replaces by id, which is
 * right when putting your own account back; importing a folder someone sent
 * you must not be able to overwrite rows that happen to share an id.
 */

const SCRYPT = { N: 1 << 15, r: 8, p: 1 };

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  });
}

interface BlobEntry {
  path: string;
  bytes: Buffer;
}

/** Decrypt a stored blob so it can leave the account. */
async function openBlob(
  ctx: AuthedContext,
  relPath: string,
  aad: string,
): Promise<Buffer | null> {
  try {
    const sealed = await readBlob(relPath);
    return aeadDecrypt(ctx.dek, sealed, `${ctx.userId}|${aad}`);
  } catch {
    // A missing or unreadable blob must not sink the whole export.
    return null;
  }
}

export interface BuildOptions {
  scope: ArchiveScope;
  id?: string;
  includeSnapshots: boolean;
  passphrase?: string;
}

/** Collect what the scope selects, decrypted and ready to serialise. */
async function collect(
  ctx: AuthedContext,
  opts: BuildOptions,
): Promise<{ data: ArchiveData; blobs: BlobEntry[] }> {
  const allFolders = listFolders(ctx);
  const allBookmarks = listBookmarks(ctx, {});
  const allTags = listTags(ctx);

  let folders = allFolders;
  let bookmarks = allBookmarks;

  if (opts.scope === "folder") {
    if (!opts.id) throw BadRequest("Falta el id de la carpeta");
    const ids = new Set(subtreeFolderIds(ctx, opts.id));
    if (!allFolders.some((f) => f.id === opts.id)) throw NotFound("Folder not found");
    folders = allFolders.filter((f) => ids.has(f.id));
    bookmarks = allBookmarks.filter((b) => b.folderId && ids.has(b.folderId));
  } else if (opts.scope === "bookmark") {
    if (!opts.id) throw BadRequest("Falta el id del bookmark");
    const one = allBookmarks.find((b) => b.id === opts.id);
    if (!one) throw NotFound("Bookmark not found");
    folders = [];
    bookmarks = [one];
  }

  const tagById = new Map(allTags.map((t) => [t.id, t]));
  const usedTagIds = new Set<string>();
  for (const f of folders) for (const id of f.tagIds) usedTagIds.add(id);
  for (const b of bookmarks) for (const id of b.tagIds) usedTagIds.add(id);

  const nameOf = (ids: string[]) =>
    ids.map((id) => tagById.get(id)?.name).filter((n): n is string => !!n);

  const blobs: BlobEntry[] = [];

  /**
   * Attached files travel with their entity. Leaving them out would make the
   * archive a quiet data-loss trap: the user exports to move accounts and the
   * files are simply gone on the other side. They are not gated behind
   * `includeSnapshots` because, unlike a page copy, they are content the user
   * put there on purpose.
   */
  const attachmentsOf = async (
    kind: "folders" | "bookmarks",
    entityId: string,
  ) => {
    const files = listAttachments(
      ctx,
      kind === "folders" ? "folder" : "bookmark",
      entityId,
    );
    const meta: {
      id: string;
      name: string;
      mime: string;
      description: string | null;
      slug: string;
    }[] = [];
    for (const f of files) {
      try {
        const { bytes } = await readAttachment(ctx, f.id);
        blobs.push({
          path: `blobs/${kind}/${entityId}/att-${f.id}.bin`,
          bytes,
        });
        meta.push({
          id: f.id,
          name: f.name,
          mime: f.mime,
          description: f.description,
          slug: f.slug,
        });
      } catch {
        // Same rule as the icons above: one unreadable blob must not sink
        // the whole export.
      }
    }
    return meta;
  };

  type FileMeta = Awaited<ReturnType<typeof attachmentsOf>>[number];
  const folderFiles = new Map<string, FileMeta[]>();
  const bookmarkFiles = new Map<string, FileMeta[]>();

  for (const f of folders) {
    if (f.iconBlobPath) {
      const bytes = await openBlob(ctx, f.iconBlobPath, "folder.icon");
      if (bytes) blobs.push({ path: `blobs/folders/${f.id}/icon.bin`, bytes });
    }
    if (f.imageBlobPath) {
      const bytes = await openBlob(ctx, f.imageBlobPath, "folder.bg");
      if (bytes) blobs.push({ path: `blobs/folders/${f.id}/bg.bin`, bytes });
    }
    folderFiles.set(f.id, await attachmentsOf("folders", f.id));
  }
  for (const b of bookmarks) {
    if (b.iconBlobPath) {
      const bytes = await openBlob(ctx, b.iconBlobPath, "bookmark.icon");
      if (bytes) blobs.push({ path: `blobs/bookmarks/${b.id}/icon.bin`, bytes });
    }
    if (b.imageBlobPath) {
      const bytes = await openBlob(ctx, b.imageBlobPath, "bookmark.bg");
      if (bytes) blobs.push({ path: `blobs/bookmarks/${b.id}/bg.bin`, bytes });
    }
    bookmarkFiles.set(b.id, await attachmentsOf("bookmarks", b.id));
  }

  return {
    data: {
      folders: folders.map((f) => ({
        id: f.id,
        parentId: f.parentId,
        name: f.name,
        description: f.description,
        bgColor: f.bgColor ?? null,
        textTone: f.textTone ?? null,
        favorite: f.favorite,
        position: f.position,
        tags: nameOf(f.tagIds),
        attachments: folderFiles.get(f.id) ?? [],
      })),
      bookmarks: bookmarks.map((b) => ({
        id: b.id,
        folderId: b.folderId,
        title: b.title,
        url: b.url,
        description: b.description,
        bgColor: b.bgColor ?? null,
        textTone: b.textTone ?? null,
        favorite: b.favorite,
        position: b.position,
        tags: nameOf(b.tagIds),
        attachments: bookmarkFiles.get(b.id) ?? [],
      })),
      tags: allTags
        .filter((t) => usedTagIds.has(t.id))
        .map((t) => ({ name: t.name, color: t.color })),
    },
    blobs,
  };
}

function zipOf(entries: BlobEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    const sink = new PassThrough();
    sink.on("data", (c) => chunks.push(Buffer.from(c)));
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.pipe(sink);
    for (const e of entries) archive.append(e.bytes, { name: e.path });
    void archive.finalize();
  });
}

export interface BuiltArchive {
  filename: string;
  bytes: Buffer;
}

export async function buildArchive(
  ctx: AuthedContext,
  opts: BuildOptions,
): Promise<BuiltArchive> {
  const { data, blobs } = await collect(ctx, opts);

  const payload: BlobEntry[] = [
    { path: "data.json", bytes: Buffer.from(JSON.stringify(data, null, 2)) },
    ...blobs,
  ];

  const counts = {
    folders: data.folders.length,
    bookmarks: data.bookmarks.length,
    tags: data.tags.length,
    blobs: blobs.length,
  };

  let entries: BlobEntry[];
  let manifest: ArchiveManifest;

  if (opts.passphrase) {
    // The inner archive is built in memory before being sealed. Acceptable for
    // a folder or an account without snapshots; worth knowing before someone
    // exports a library with thousands of archived pages under a passphrase.
    const salt = randomBytes(16);
    const inner = await zipOf(payload);
    const sealed = aeadEncrypt(deriveKey(opts.passphrase, salt), inner, ARCHIVE_FORMAT);
    entries = [{ path: "payload.bin", bytes: sealed }];
    manifest = {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      scope: opts.scope,
      exportedAt: new Date().toISOString(),
      app: APP_VERSION,
      encrypted: true,
      kdf: { algorithm: "scrypt", salt: salt.toString("base64"), ...SCRYPT },
      counts,
    };
  } else {
    entries = payload;
    manifest = {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      scope: opts.scope,
      exportedAt: new Date().toISOString(),
      app: APP_VERSION,
      encrypted: false,
      counts,
    };
  }

  const bytes = await zipOf([
    { path: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest, null, 2)) },
    ...entries,
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  return { filename: `awesomebookmarks-${opts.scope}-${stamp}.abz`, bytes };
}

/* ---- Import ------------------------------------------------------------ */

function readZipEntries(buf: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, Buffer>();
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Archivo no válido"));
      zip.on("entry", (entry) => {
        if (entry.fileName.endsWith("/")) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(e ?? new Error("Entrada ilegible"));
          const chunks: Buffer[] = [];
          stream.on("data", (c) => chunks.push(Buffer.from(c)));
          stream.on("end", () => {
            out.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => resolve(out));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

export async function importArchive(
  ctx: AuthedContext,
  buf: Buffer,
  opts: { parentId: string | null; passphrase?: string },
): Promise<ImportArchiveResult> {
  let entries = await readZipEntries(buf);

  const manifestRaw = entries.get("manifest.json");
  if (!manifestRaw) throw BadRequest("El archivo no tiene manifest.json");
  const manifest = ArchiveManifestSchema.parse(JSON.parse(manifestRaw.toString("utf8")));
  if (manifest.format !== ARCHIVE_FORMAT) {
    throw BadRequest("El archivo no es un export de AwesomeBookmarks");
  }
  if (manifest.version > ARCHIVE_VERSION) {
    throw BadRequest(
      `El archivo viene de una versión más nueva (v${manifest.version}). Actualiza para importarlo.`,
    );
  }

  if (manifest.encrypted) {
    if (!opts.passphrase) throw BadRequest("El archivo está cifrado: falta la contraseña");
    const sealed = entries.get("payload.bin");
    if (!sealed || !manifest.kdf) throw BadRequest("Archivo cifrado incompleto");
    const key = deriveKey(opts.passphrase, Buffer.from(manifest.kdf.salt, "base64"));
    let inner: Buffer;
    try {
      inner = aeadDecrypt(key, sealed, ARCHIVE_FORMAT);
    } catch {
      throw BadRequest("Contraseña incorrecta");
    }
    entries = await readZipEntries(inner);
  }

  const dataRaw = entries.get("data.json");
  if (!dataRaw) throw BadRequest("El archivo no tiene data.json");
  const data = ArchiveDataSchema.parse(JSON.parse(dataRaw.toString("utf8")));

  // Tags match by name: an id from another instance means nothing here.
  const existing = new Map(listTags(ctx).map((t) => [t.name.toLowerCase(), t]));
  const tagIdByName = new Map<string, string>();
  let newTags = 0;
  for (const tag of data.tags) {
    const hit = existing.get(tag.name.toLowerCase());
    if (hit) {
      tagIdByName.set(tag.name, hit.id);
      continue;
    }
    const created = createTag(ctx, { name: tag.name, color: tag.color });
    tagIdByName.set(tag.name, created.id);
    newTags++;
  }
  const resolveTags = (names: string[]) =>
    names.map((n) => tagIdByName.get(n)).filter((id): id is string => !!id);

  // Folders keep their shape but take new ids, rooted at the destination.
  const idMap = new Map<string, string>();
  const byOldId = new Map(data.folders.map((f) => [f.id, f]));
  const sorted = [...data.folders].sort(
    (a, b) => depthOf(a, byOldId) - depthOf(b, byOldId),
  );

  const blobCount = { n: 0 };
  for (const f of sorted) {
    const parent =
      f.parentId && idMap.has(f.parentId) ? idMap.get(f.parentId)! : opts.parentId;
    const created = createFolder(ctx, {
      parentId: parent,
      name: f.name,
      description: f.description ?? undefined,
      bgColor: f.bgColor,
      textTone: f.textTone,
      favorite: f.favorite,
      tagIds: resolveTags(f.tags),
    });
    idMap.set(f.id, created.id);
    await restoreBlobs(ctx, entries, "folders", f.id, created.id, blobCount);
    await restoreAttachments(ctx, entries, "folders", f, created.id, blobCount);
  }

  for (const b of data.bookmarks) {
    const folderId =
      b.folderId && idMap.has(b.folderId) ? idMap.get(b.folderId)! : opts.parentId;
    const created = createBookmark(ctx, {
      folderId,
      url: b.url,
      title: b.title,
      description: b.description ?? undefined,
      bgColor: b.bgColor,
      textTone: b.textTone,
      favorite: b.favorite,
      tagIds: resolveTags(b.tags),
      // An import is not the moment to fire hundreds of page fetches.
      fetchSnapshot: false,
    });
    await restoreBlobs(ctx, entries, "bookmarks", b.id, created.id, blobCount);
    await restoreAttachments(ctx, entries, "bookmarks", b, created.id, blobCount);
  }

  return {
    folders: data.folders.length,
    bookmarks: data.bookmarks.length,
    tags: newTags,
    blobs: blobCount.n,
    parentId: opts.parentId,
  };
}

function depthOf(
  folder: { id: string; parentId: string | null },
  byId: Map<string, { id: string; parentId: string | null }>,
): number {
  let depth = 0;
  let cur = folder.parentId;
  const seen = new Set<string>();
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    depth++;
    cur = byId.get(cur)?.parentId ?? null;
  }
  return depth;
}

/** Re-seal an archive's plaintext blobs under the importing user's own key. */
async function restoreBlobs(
  ctx: AuthedContext,
  entries: Map<string, Buffer>,
  kind: "folders" | "bookmarks",
  oldId: string,
  newId: string,
  counter: { n: number },
): Promise<void> {
  const dir =
    kind === "folders"
      ? folderBlobDir(ctx.userId, newId)
      : bookmarkBlobDir(ctx.userId, newId);
  const aadPrefix = kind === "folders" ? "folder" : "bookmark";

  for (const [suffix, aad, file] of [
    ["icon.bin", `${aadPrefix}.icon`, "user-icon.bin"],
    ["bg.bin", `${aadPrefix}.bg`, "user-bg.bin"],
  ] as const) {
    const bytes = entries.get(`blobs/${kind}/${oldId}/${suffix}`);
    if (!bytes) continue;
    const sealed = aeadEncrypt(ctx.dek, bytes, `${ctx.userId}|${aad}`);
    const path = await writeBlob(ctx.userId, join(dir, file), sealed);
    if (kind === "folders") {
      const { setFolderIconPath, setFolderBgImagePath } = await import(
        "../folders/service.js"
      );
      if (suffix === "icon.bin") setFolderIconPath(ctx, newId, path);
      else setFolderBgImagePath(ctx, newId, path);
    } else {
      const { setBookmarkIconPath, setBookmarkBgImagePath } = await import(
        "../bookmarks/service.js"
      );
      if (suffix === "icon.bin") setBookmarkIconPath(ctx, newId, path);
      else setBookmarkBgImagePath(ctx, newId, path);
    }
    counter.n++;
  }
}

/** Recreate the attached files an archive carries, under the importer's key. */
async function restoreAttachments(
  ctx: AuthedContext,
  entries: Map<string, Buffer>,
  kind: "folders" | "bookmarks",
  source: {
    id: string;
    attachments?: {
      id: string;
      name: string;
      mime: string;
      description?: string | null;
      slug?: string;
    }[];
  },
  newId: string,
  counter: { n: number },
): Promise<void> {
  for (const a of source.attachments ?? []) {
    const bytes = entries.get(`blobs/${kind}/${source.id}/att-${a.id}.bin`);
    if (!bytes) continue;
    try {
      await storeAttachment(
        ctx,
        kind === "folders" ? "folder" : "bookmark",
        newId,
        a.name,
        a.mime,
        bytes,
        // A suggestion, not a demand: importing an archive back into the same
        // account must not fail on its own slugs, it should sit beside them.
        { description: a.description ?? undefined, suggestSlug: a.slug || undefined },
      );
      counter.n++;
    } catch (err) {
      // Almost always the importer's quota. Skip the file and keep going:
      // losing one attachment beats losing the rest of the import.
      console.warn(
        `[archive] could not restore attachment ${a.name}`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
