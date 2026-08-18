import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import yauzl from "yauzl";
import { loadConnection } from "../../cloud/registry.js";
import { keyCache } from "../../auth/key-cache.js";
import { getSqlite } from "../../db/client.js";
import { invalidateUsage } from "../../storage/usage.js";
import { userBlobDir } from "../../storage/blobs.js";

/**
 * Restore a backup from a cloud connection back into this server.
 *
 * Semantics are **merge, not wipe**: rows are inserted or replaced by their
 * primary key, and anything created after the backup is left alone. A restore
 * that silently deleted a week of new bookmarks because they postdate the
 * archive would be a far worse failure than a restore that leaves a few
 * duplicates, and the destructive variant is always available by deleting
 * first and then restoring.
 *
 * The archive holds ciphertext exactly as it sat on disk, so nothing is
 * decrypted here. That also means a backup can only be restored onto the
 * account that made it: the rows are sealed with that user's DEK.
 */

interface RestorePayload {
  connectionId: string;
  filename: string;
}

/** Tables restored, in dependency order (parents before children). */
const TABLES = [
  "folders",
  "bookmarks",
  "tags",
  "folder_tags",
  "bookmark_tags",
] as const;

const KEY_BY_TABLE: Record<string, keyof BackupData> = {
  folders: "folders",
  bookmarks: "bookmarks",
  tags: "tags",
  folder_tags: "folderTags",
  bookmark_tags: "bookmarkTags",
};

interface BackupData {
  version?: number;
  folders?: Row[];
  bookmarks?: Row[];
  tags?: Row[];
  folderTags?: Row[];
  bookmarkTags?: Row[];
}

type Row = Record<string, unknown>;

/** Undo the `{ __b64 }` wrapping the backup writer applies to Buffers. */
function reviveValue(value: unknown): unknown {
  if (value && typeof value === "object" && "__b64" in (value as object)) {
    return Buffer.from(String((value as { __b64: string }).__b64), "base64");
  }
  return value;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

interface ZipEntryHandler {
  (name: string, read: () => Promise<Buffer>): Promise<void>;
}

/** Walk a zip in memory, handing each file to the callback. */
function readZip(buf: Buffer, onEntry: ZipEntryHandler): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Invalid zip"));
      zip.on("entry", (entry) => {
        if (entry.fileName.endsWith("/")) {
          zip.readEntry();
          return;
        }
        const read = () =>
          new Promise<Buffer>((res, rej) => {
            zip.openReadStream(entry, (e, stream) => {
              if (e || !stream) return rej(e ?? new Error("Unreadable entry"));
              streamToBuffer(stream).then(res, rej);
            });
          });
        onEntry(entry.fileName, read).then(
          () => zip.readEntry(),
          (e) => reject(e),
        );
      });
      zip.on("end", () => resolve());
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

export interface RestoreSummary {
  folders: number;
  bookmarks: number;
  tags: number;
  blobs: number;
}

export async function runRestoreJob(
  userId: string,
  payload: RestorePayload,
): Promise<RestoreSummary> {
  const dek = keyCache.get(userId);
  if (!dek) throw new Error("DEK not in cache");

  const { provider } = loadConnection(userId, payload.connectionId, dek);
  const archive = await streamToBuffer(
    Readable.from(await provider.download(payload.filename)),
  );

  const summary: RestoreSummary = {
    folders: 0,
    bookmarks: 0,
    tags: 0,
    blobs: 0,
  };
  await readZip(archive, async (name, read) => {
    if (name === "data.json") {
      const data = JSON.parse((await read()).toString("utf8")) as BackupData;
      summary.folders += restoreTable(userId, data, "folders");
      summary.bookmarks += restoreTable(userId, data, "bookmarks");
      summary.tags += restoreTable(userId, data, "tags");
      restoreTable(userId, data, "folder_tags");
      restoreTable(userId, data, "bookmark_tags");
      return;
    }
    if (!name.startsWith("blobs/")) return;

    // The archive is user-supplied input once it has been anywhere near a
    // cloud account, so entry names must not be able to escape the user's own
    // blob directory (zip-slip).
    const relative = name.slice("blobs/".length);
    const target = normalize(join(userBlobDir(userId), relative));
    if (!target.startsWith(userBlobDir(userId) + sep)) {
      console.warn(`[restore] skipping suspicious entry ${name}`);
      return;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await read());
    summary.blobs++;
  });

  // The restored blobs changed what this account occupies.
  invalidateUsage(userId);
  return summary;
}

/**
 * Insert-or-replace every row of one table, scoped to this user.
 *
 * Rows carry their original primary keys, so replaying a backup is idempotent:
 * restoring twice leaves the same state as restoring once.
 */
function restoreTable(
  userId: string,
  data: BackupData,
  table: (typeof TABLES)[number],
): number {
  const rows = data[KEY_BY_TABLE[table] as keyof BackupData] as Row[] | undefined;
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  const sql = getSqlite();
  // Only columns the running schema actually has: a backup taken by an older
  // build must still restore, just without the fields it never had.
  const columns = new Set(
    (sql.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
      .map((c) => c.name),
  );

  let n = 0;
  const tx = sql.transaction(() => {
    for (const raw of rows) {
      const row: Row = {};
      for (const [k, v] of Object.entries(raw)) {
        const column = camelToSnake(k);
        if (columns.has(column)) row[column] = reviveValue(v);
      }
      // Never let an archive write rows onto another account.
      if (columns.has("user_id")) row.user_id = userId;
      const names = Object.keys(row);
      if (names.length === 0) continue;
      sql
        .prepare(
          `INSERT OR REPLACE INTO ${table} (${names.join(",")})
           VALUES (${names.map(() => "?").join(",")})`,
        )
        .run(...names.map((c) => row[c] as never));
      n++;
    }
  });
  tx();
  return n;
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Stream a backup straight from one connection into another. */
export async function copyBackupBetween(
  userId: string,
  fromConnectionId: string,
  toConnectionId: string,
  filename: string,
): Promise<void> {
  const dek = keyCache.get(userId);
  if (!dek) throw new Error("DEK not in cache");
  const source = loadConnection(userId, fromConnectionId, dek);
  const target = loadConnection(userId, toConnectionId, dek);
  // Streamed, never buffered: a library with a few thousand snapshots makes an
  // archive far larger than anything worth holding in memory.
  const stream = await source.provider.download(filename);
  await target.provider.upload(filename, Readable.from(stream));
}
