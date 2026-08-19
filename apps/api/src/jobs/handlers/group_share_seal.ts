import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { groupShares, groups } from "../../db/schema.js";
import { materializeShareAssets } from "../../groups/assets.js";
import {
  buildPayloadForShare,
  mergeEditorFieldEdits,
  type ShareAssetSource,
  type SharedContent,
} from "../../groups/content.js";
import {
  openGroupField,
  sealGroupField,
  unwrapGroupDek,
} from "../../groups/encryption.js";

interface Payload {
  groupShareId: string;
}

function readPayload(
  groupDek: Buffer,
  groupId: string,
  sealed: Buffer,
): SharedContent | null {
  try {
    return JSON.parse(
      openGroupField(groupDek, groupId, "share.payload", sealed),
    ) as SharedContent;
  } catch {
    return null;
  }
}

/** `${nodeId}:${kind}` → version already copied, so an unchanged image is not
 * rewritten on every re-seal. */
function assetVersions(tree: SharedContent | null): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (n: SharedContent): void => {
    if (n.icon) out.set(`${n.id}:icon`, n.icon);
    if (n.image) out.set(`${n.id}:image`, n.image);
    if (n.type === "folder") {
      for (const b of n.bookmarks) walk(b);
      for (const f of n.subfolders) walk(f);
    }
  };
  if (tree) walk(tree);
  return out;
}

function dropMissingAssets(tree: SharedContent, available: Set<string>): void {
  if (tree.icon && !available.has(`${tree.id}:icon`)) tree.icon = null;
  if (tree.image && !available.has(`${tree.id}:image`)) tree.image = null;
  if (tree.type === "folder") {
    for (const b of tree.bookmarks) dropMissingAssets(b, available);
    for (const f of tree.subfolders) dropMissingAssets(f, available);
  }
}

export async function runGroupShareSealJob(
  userId: string,
  dek: Buffer,
  payload: Payload,
) {
  const row = getDb()
    .select({
      share: groupShares,
      group: groups,
    })
    .from(groupShares)
    .innerJoin(groups, eq(groups.id, groupShares.groupId))
    .where(eq(groupShares.id, payload.groupShareId))
    .get();
  if (!row) throw new Error("Group share not found");
  if (row.share.sharedBy !== userId) {
    throw new Error("Job user does not match share owner");
  }

  const assets: ShareAssetSource[] = [];
  const content = buildPayloadForShare(userId, dek, row.share, assets);

  const groupDek = unwrapGroupDek(
    row.group.id,
    Buffer.from(row.group.groupDekWrapped),
  );

  const previousPayload =
    row.share.payloadStatus === "ready" && row.share.payloadCt
      ? readPayload(groupDek, row.group.id, Buffer.from(row.share.payloadCt))
      : null;

  // Editor shares can carry the group's in-place field edits. Rebuilding from
  // the owner's originals gives us the current structure; overlay the group's
  // edits on surviving nodes so a re-seal never wipes collaborative work.
  let finalContent: SharedContent = content;
  if (row.share.access === "editor" && previousPayload) {
    finalContent = mergeEditorFieldEdits(content, previousPayload);
  }

  // Copy this share's icons/backgrounds under the group key, then blank out
  // whatever did not make it so the member gets the default look rather than
  // a broken image.
  const available = await materializeShareAssets(
    userId,
    dek,
    row.group.id,
    groupDek,
    row.share.id,
    assets,
    assetVersions(previousPayload),
  );
  dropMissingAssets(finalContent, available);

  const sealed = sealGroupField(
    groupDek,
    row.group.id,
    "share.payload",
    JSON.stringify(finalContent),
  );

  getDb()
    .update(groupShares)
    .set({
      payloadCt: sealed,
      payloadStatus: "ready",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(groupShares.id, row.share.id))
    .run();
}
