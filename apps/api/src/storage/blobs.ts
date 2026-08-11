import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { getEnv } from "../env.js";

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

/**
 * Write bytes (already encrypted by caller) to disk.
 * Returns a stable storage path (relative to DATA_DIR/blobs) suitable for DB.
 */
export async function writeBlob(absPath: string, data: Buffer): Promise<string> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, data);
  return relative(blobsRoot(), absPath);
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
  srcRelPath: string,
  destAbsPath: string,
): Promise<string> {
  const bytes = await readFile(join(blobsRoot(), srcRelPath));
  return writeBlob(destAbsPath, bytes);
}

export async function deleteBlob(relPath: string | null | undefined): Promise<void> {
  if (!relPath) return;
  await rm(join(blobsRoot(), relPath), { force: true });
}

export async function deleteUserBlobs(userId: string): Promise<void> {
  await rm(userBlobDir(userId), { recursive: true, force: true });
}
