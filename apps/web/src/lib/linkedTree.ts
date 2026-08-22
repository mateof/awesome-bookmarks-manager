import type { Folder } from "@awesome-bookmarks/shared";
import { useQueries } from "@tanstack/react-query";
import { api } from "../api.js";
import type { SharedFolderPayload } from "../components/SharedNodeEditor.js";

/**
 * The subfolders of a linked share, as rows the sidebar tree can draw.
 *
 * A portal folder is a single row in your account: its contents live in the
 * share payload, not in your `folders`, so the sidebar showed it as a leaf no
 * matter how much was inside. This fetches each portal's share and hands the
 * tree synthetic rows parented to the portal, plus the link each one needs
 * (`/linked/<portal>?p=<trail>`, which is how the share view addresses a
 * folder inside itself).
 *
 * Nothing is invented: these rows are the same payload the share view renders,
 * so the two cannot disagree about what is in there.
 */
export interface LinkedTree {
  folders: Folder[];
  /** Folder id → where clicking it should go. */
  hrefs: Map<string, string>;
}

const EPOCH = "1970-01-01T00:00:00.000Z";

export function useLinkedShareTree(folders: Folder[]): LinkedTree {
  const portals = folders.filter((f) => f.linkedShareId);
  const results = useQueries({
    queries: portals.map((p) => ({
      queryKey: ["shared-content", p.linkedShareId],
      queryFn: () => api.getSharedContent(p.linkedShareId!),
      // The sidebar is not the place to hammer the server: the share view
      // refetches on its own when something changes there.
      staleTime: 60_000,
    })),
  });

  const out: Folder[] = [];
  const hrefs = new Map<string, string>();

  portals.forEach((portal, i) => {
    const data = results[i]?.data as
      | { content?: SharedFolderPayload }
      | undefined;
    const root = data?.content;
    if (!root || root.type !== "folder") return;

    const walk = (node: SharedFolderPayload, parentId: string, trail: string[]) => {
      node.subfolders.forEach((sub, position) => {
        const next = [...trail, sub.id];
        out.push({
          id: sub.id,
          keyGroupId: null,
          mine: false,
          canWrite: true,
          parentId,
          name: sub.name,
          description: null,
          iconBlobPath: null,
          imageBlobPath: null,
          bgColor: null,
          textTone: null,
          shareOrigin: null,
          favorite: sub.favorite ?? false,
          aliasOf: null,
          linkedShareId: null,
          position,
          rev: 1,
          tagIds: [],
          createdAt: EPOCH,
          updatedAt: EPOCH,
        });
        hrefs.set(sub.id, `/linked/${portal.id}?p=${next.join(".")}`);
        walk(sub, sub.id, next);
      });
    };
    walk(root, portal.id, []);
  });

  return { folders: out, hrefs };
}
