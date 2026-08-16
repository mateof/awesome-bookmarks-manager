import { rebuildPanelPayload } from "../../panels/service.js";

interface Payload {
  panelId: string;
}

/**
 * Re-materialise a panel so its public snapshot reflects the owner's current
 * folders/bookmarks (symlinks included). Enqueued whenever something inside the
 * panel's source subtree changes.
 */
export async function runPanelRebuildJob(
  userId: string,
  dek: Buffer,
  payload: Payload,
) {
  rebuildPanelPayload(userId, dek, payload.panelId);
}
