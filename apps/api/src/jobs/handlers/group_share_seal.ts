import { eq } from "drizzle-orm";
import type { AuthedContext } from "../../auth/session.js";
import { groupKeyFor } from "../../groups/keys.js";
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
} from "../../groups/encryption.js";
import {
  pendingAssetKeys,
  pendingFieldsByNode,
  pendingNodeIds,
} from "../../groups/ops.js";

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

  const groupDek = groupKeyFor({ userId, dek } as AuthedContext, row.group.id);

  const previousPayload =
    row.share.payloadStatus === "ready" && row.share.payloadCt
      ? readPayload(groupDek, row.group.id, Buffer.from(row.share.payloadCt))
      : null;

  /**
   * Overlay edits that exist only in the payload, and *only* when there are
   * any.
   *
   * This merge belongs to the old model, where a member's edit lived in the
   * group's copy until the owner logged in and it could be replayed. Shared
   * content is now rows the group owns, so `content` rebuilt from those rows
   * is already current and merging the previous payload over it would put
   * stale values back: it did exactly that to the owner's renames, because
   * every share now counts as editable and the merge stopped being skipped.
   *
   * So it runs when there is genuinely something waiting, which means a share
   * created before this change with operations still queued.
   */
  const pendingIds = pendingNodeIds(row.share.id, row.group.id, groupDek);
  const pendingFields = pendingFieldsByNode(row.share.id, row.group.id, groupDek);
  const hasPending =
    pendingIds.size > 0 || pendingFields.size > 0;

  let finalContent: SharedContent = content;
  if (previousPayload && hasPending) {
    finalContent = mergeEditorFieldEdits(
      content,
      previousPayload,
      pendingIds,
      pendingFields,
    );
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
    // What a member uploaded and this rebuild knows nothing about, because the
    // owner's rows do not have it yet.
    pendingAssetKeys(row.share.id, row.group.id, groupDek),
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
