import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { getEnv } from "../env.js";
import { assertQuotaAllows, invalidateUsage, noteBlobDelta } from "./usage.js";

function blobsRoot(): string {
  return resolve(getEnv().DATA_DIR, "blobs");
}

export function userBlobDir(userId: string): string {
  return join(blobsRoot(), userId);
}

export function bookmarkBlobDir(userId: string, bookmarkId: string): string {
  return join(userBlobDir(userId), "bookmarks", bookmarkId);
}

export function folderBlobDir(userId: string, folderId: string): string {
  return join(userBlobDir(userId), "folders", folderId);
}

export function panelBlobDir(userId: string, panelId: string): string {
  return join(userBlobDir(userId), "panels", panelId);
}

/** Size on disk, or 0 when the file is not there yet. */
async function sizeOf(absPath: string): Promise<number> {
  try {
    return (await stat(absPath)).size;
  } catch {
    return 0;
  }
}

/**
 * Write bytes (already encrypted by caller) to disk.
 * Returns a stable storage path (relative to DATA_DIR/blobs) suitable for DB.
 *
 * `userId` is required rather than derived from the path so that storage
 * accounting and the quota check are structural: there is no way to put bytes
 * on disk without saying whose they are. Callers already know it.
 *
 * Icons are overwritten in place, so what counts against the quota is the
 * *delta*, not the file size — replacing a 1 MB banner with a 900 kB one must
 * not be billed twice.
 */
export async function writeBlob(
  userId: string,
  absPath: string,
  data: Buffer,
): Promise<string> {
  const previous = await sizeOf(absPath);
  const delta = data.length - previous;
  if (delta > 0) await assertQuotaAllows(userId, delta);

  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, data);

  const rel = relative(blobsRoot(), absPath);
  noteBlobDelta(userId, rel.split("\\").join("/"), delta);
  return rel;
}

export async function readBlob(relPath: string): Promise<Buffer> {
  return readFile(join(blobsRoot(), relPath));
}

/**
 * Copy an existing blob to a new absolute path. Icon/background blobs are
 * sealed with a user-scoped AAD (not entity-scoped), so the bytes stay valid
 * for a different entity — this is how a copied folder/bookmark keeps its
 * icon and background. Returns the new relative storage path.
 */
export async function copyBlob(
  userId: string,
  srcRelPath: string,
  destAbsPath: string,
): Promise<string> {
  const bytes = await readFile(join(blobsRoot(), srcRelPath));
  return writeBlob(userId, destAbsPath, bytes);
}

export async function deleteBlob(
  relPath: string | null | undefined,
  userId?: string,
): Promise<void> {
  if (!relPath) return;
  await rm(join(blobsRoot(), relPath), { force: true });
  // Deletes are rare next to writes, so dropping the cached total and letting
  // the next read re-walk is simpler than tracking each removed size.
  if (userId) invalidateUsage(userId);
}

export async function deleteUserBlobs(userId: string): Promise<void> {
  await rm(userBlobDir(userId), { recursive: true, force: true });
  invalidateUsage(userId);
}
