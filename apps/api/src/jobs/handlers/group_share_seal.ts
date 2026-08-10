import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { groupShares, groups } from "../../db/schema.js";
import {
  buildPayloadForShare,
  mergeEditorFieldEdits,
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

  const content = buildPayloadForShare(userId, dek, row.share);

  const groupDek = unwrapGroupDek(
    row.group.id,
    Buffer.from(row.group.groupDekWrapped),
  );

  // Editor shares can carry the group's in-place field edits. Rebuilding from
  // the owner's originals gives us the current structure; overlay the group's
  // edits on surviving nodes so a re-seal never wipes collaborative work.
  let finalContent: SharedContent = content;
  if (
    row.share.access === "editor" &&
    row.share.payloadStatus === "ready" &&
    row.share.payloadCt
  ) {
    try {
      const old = JSON.parse(
        openGroupField(
          groupDek,
          row.group.id,
          "share.payload",
          Buffer.from(row.share.payloadCt),
        ),
      ) as SharedContent;
      finalContent = mergeEditorFieldEdits(content, old);
    } catch {
      // If the previous payload can't be read, fall back to the fresh tree.
      finalContent = content;
    }
  }

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
