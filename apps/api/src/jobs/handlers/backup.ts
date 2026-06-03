import archiver from "archiver";
import { eq } from "drizzle-orm";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { keyCache } from "../../auth/key-cache.js";
import {
  buildProvider,
  unpackCredentials,
} from "../../cloud/registry.js";
import { getDb } from "../../db/client.js";
import {
  bookmarkTags,
  bookmarks,
  cloudConnections,
  folderTags,
  folders,
  shareLinks,
  tags,
  users,
} from "../../db/schema.js";
import { userBlobDir } from "../../storage/blobs.js";

interface BackupPayload {
  connectionId: string;
}

const BACKUP_VERSION = 1;

export async function runBackupJob(userId: string, payload: BackupPayload) {
  const dek = keyCache.get(userId);
  if (!dek) throw new Error("DEK not in cache");

  const conn = getDb()
    .select()
    .from(cloudConnections)
    .where(eq(cloudConnections.id, payload.connectionId))
    .get();
  if (!conn || conn.userId !== userId) throw new Error("Connection not found");
  const creds = unpackCredentials(dek, userId, Buffer.from(conn.credentialsCt));
  const provider = buildProvider(creds);

  const archive = archiver("zip", { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  const data = serializeUserData(userId);
  archive.append(JSON.stringify(data, bufToJson, 2), { name: "data.json" });

  // Blobs are already encrypted on disk — we add them as-is.
  const root = userBlobDir(userId);
  await mkdir(root, { recursive: true });
  await appendDir(archive, root, "blobs");

  archive.finalize();

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `awesome-bookmarks-${userId}-${ts}.zip`;
  await provider.upload(filename, passthrough);

  getDb()
    .update(cloudConnections)
    .set({
      lastBackupAt: new Date().toISOString(),
      lastStatus: "ok",
    })
    .where(eq(cloudConnections.id, conn.id))
    .run();
}

async function appendDir(
  archive: archiver.Archiver,
  abs: string,
  rel: string,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(abs);
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(abs, e);
    const s = await stat(full);
    if (s.isDirectory()) {
      await appendDir(archive, full, `${rel}/${e}`);
    } else {
      archive.file(full, { name: `${rel}/${e}` });
    }
  }
}

interface SerializedBuffer {
  type: "Buffer";
  data: number[];
}

function bufToJson(_key: string, value: unknown) {
  if (Buffer.isBuffer(value)) {
    return { __b64: value.toString("base64") };
  }
  if (
    value &&
    typeof value === "object" &&
    (value as SerializedBuffer).type === "Buffer" &&
    Array.isArray((value as SerializedBuffer).data)
  ) {
    return {
      __b64: Buffer.from((value as SerializedBuffer).data).toString("base64"),
    };
  }
  return value;
}

function serializeUserData(userId: string) {
  const db = getDb();
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    user: db.select().from(users).where(eq(users.id, userId)).get(),
    folders: db.select().from(folders).where(eq(folders.userId, userId)).all(),
    bookmarks: db.select().from(bookmarks).where(eq(bookmarks.userId, userId)).all(),
    tags: db.select().from(tags).where(eq(tags.userId, userId)).all(),
    folderTags: getFolderTagsForUser(userId),
    bookmarkTags: getBookmarkTagsForUser(userId),
    shares: db
      .select({
        id: shareLinks.id,
        targetType: shareLinks.targetType,
        targetId: shareLinks.targetId,
        token: shareLinks.token,
        expiresAt: shareLinks.expiresAt,
        passwordHash: shareLinks.passwordHash,
        createdAt: shareLinks.createdAt,
      })
      .from(shareLinks)
      .where(eq(shareLinks.userId, userId))
      .all(),
  };
}

function getFolderTagsForUser(userId: string) {
  const db = getDb();
  const userFolders = db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.userId, userId))
    .all()
    .map((r) => r.id);
  if (userFolders.length === 0) return [];
  return db.select().from(folderTags).all().filter((r) => userFolders.includes(r.folderId));
}

function getBookmarkTagsForUser(userId: string) {
  const db = getDb();
  const userBookmarks = db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .all()
    .map((r) => r.id);
  if (userBookmarks.length === 0) return [];
  return db.select().from(bookmarkTags).all().filter((r) => userBookmarks.includes(r.bookmarkId));
}
