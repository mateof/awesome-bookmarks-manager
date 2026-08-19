import { aeadDecrypt, aeadEncrypt } from "@awesome-bookmarks/crypto";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readBlob, userBlobDir, writeBlob } from "../storage/blobs.js";
import { invalidateUsage } from "../storage/usage.js";
import type { ShareAssetSource } from "./content.js";

/**
 * Icons and backgrounds for group shares.
 *
 * The owner's own blobs are sealed with the owner's DEK, so a member cannot
 * read them: the route that serves them needs the owner's key, and the owner
 * may well be offline. A share therefore keeps its *own* copy of every icon
 * and background, re-sealed with the group key, written by the seal job (the
 * one moment we do hold the owner's DEK).
 *
 * They live on disk rather than inside the sealed payload because the payload
 * is decrypted and parsed on every read of the share; a 4 MB background in
 * there would be paid for on every page load instead of once per image.
 *
 * The bytes count against the *owner's* quota. They chose to share, and
 * charging the member for a file they cannot delete would be worse.
 */

export type ShareAssetKind = "icon" | "image";

const ASSET_AAD = "share.asset";

function shareAssetDir(ownerUserId: string, shareId: string): string {
  return join(userBlobDir(ownerUserId), "shares", shareId);
}

function assetFile(nodeId: string, kind: ShareAssetKind): string {
  return `${nodeId}-${kind}.bin`;
}

function assetPath(
  ownerUserId: string,
  shareId: string,
  nodeId: string,
  kind: ShareAssetKind,
): string {
  return join(shareAssetDir(ownerUserId, shareId), assetFile(nodeId, kind));
}

async function exists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy this share's icons/backgrounds out of the owner's blobs and into the
 * share, re-sealed with the group key.
 *
 * `previous` maps `${nodeId}:${kind}` to the version token already stored, so
 * a re-seal (which happens on every edit anywhere in the shared subtree) does
 * not rewrite megabytes of unchanged images.
 *
 * Returns the keys that are actually readable afterwards; the caller blanks
 * out the payload's version token for anything missing, so a failed copy
 * degrades to the default look instead of a broken image.
 */
export async function materializeShareAssets(
  ownerUserId: string,
  ownerDek: Buffer,
  groupId: string,
  groupDek: Buffer,
  shareId: string,
  sources: ShareAssetSource[],
  previous: Map<string, string>,
): Promise<Set<string>> {
  const ok = new Set<string>();
  const wanted = new Set<string>();

  for (const src of sources) {
    const key = `${src.nodeId}:${src.kind}`;
    wanted.add(assetFile(src.nodeId, src.kind));
    const dest = assetPath(ownerUserId, shareId, src.nodeId, src.kind);
    if (previous.get(key) === src.version && (await exists(dest))) {
      ok.add(key);
      continue;
    }
    try {
      const sealed = await readBlob(src.srcPath);
      const bytes = aeadDecrypt(
        ownerDek,
        sealed,
        `${ownerUserId}|${src.field}`,
      );
      await writeBlob(
        ownerUserId,
        dest,
        aeadEncrypt(groupDek, bytes, `${groupId}|${ASSET_AAD}`),
      );
      ok.add(key);
    } catch (err) {
      // A missing source blob or a full quota must not fail the whole seal:
      // the share is still worth publishing without that one image.
      console.error(
        `[share-assets] ${shareId} ${src.nodeId}/${src.kind}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  await pruneShareAssets(ownerUserId, shareId, wanted);
  return ok;
}

/** Drop copies for nodes that have left the share (moved out, deleted, or
 * had their icon removed). */
async function pruneShareAssets(
  ownerUserId: string,
  shareId: string,
  keep: Set<string>,
): Promise<void> {
  const dir = shareAssetDir(ownerUserId, shareId);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (keep.has(name)) continue;
    await rm(join(dir, name), { force: true });
  }
}

/** Everything a revoked share leaves behind. */
export async function deleteShareAssets(
  ownerUserId: string,
  shareId: string,
): Promise<void> {
  await rm(shareAssetDir(ownerUserId, shareId), {
    recursive: true,
    force: true,
  });
  invalidateUsage(ownerUserId);
}

/**
 * Read one asset back as plaintext for a member. Membership is the caller's
 * job; this only proves the bytes belong to this group (the AAD binds them to
 * it, so a blob from another group fails to open rather than being served).
 */
export async function readShareAsset(
  ownerUserId: string,
  shareId: string,
  nodeId: string,
  kind: ShareAssetKind,
  groupId: string,
  groupDek: Buffer,
): Promise<Buffer | null> {
  const dir = resolve(shareAssetDir(ownerUserId, shareId));
  const abs = resolve(join(dir, assetFile(nodeId, kind)));
  // nodeId arrives in the URL. The route parses it as a uuid, but a path that
  // resolves outside its own share is never worth serving.
  if (abs !== join(dir, assetFile(nodeId, kind))) return null;
  try {
    const sealed = await readFile(abs);
    return aeadDecrypt(groupDek, sealed, `${groupId}|${ASSET_AAD}`);
  } catch {
    return null;
  }
}
