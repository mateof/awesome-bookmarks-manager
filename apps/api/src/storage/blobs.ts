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

export async function deleteBlob(relPath: string | null | undefined): Promise<void> {
  if (!relPath) return;
  await rm(join(blobsRoot(), relPath), { force: true });
}

export async function deleteUserBlobs(userId: string): Promise<void> {
  await rm(userBlobDir(userId), { recursive: true, force: true });
}
