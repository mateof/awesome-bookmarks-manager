import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { groupShares, groups } from "../../db/schema.js";
import { buildPayloadForShare } from "../../groups/content.js";
import {
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
  const sealed = sealGroupField(
    groupDek,
    row.group.id,
    "share.payload",
    JSON.stringify(content),
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
