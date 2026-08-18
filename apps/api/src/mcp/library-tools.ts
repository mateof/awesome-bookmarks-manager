import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SmartQuerySchema } from "@awesome-bookmarks/shared";
import { z } from "zod";
import type { AuthedContext } from "../auth/session.js";
import { findDuplicates, mergeBookmarks } from "../bookmarks/duplicates.js";
import {
  createSmartFolder,
  deleteSmartFolder,
  listSmartFolders,
  resolveSmartFolder,
  resolveSmartQuery,
  updateSmartFolder,
} from "../smart-folders/service.js";
import {
  listTrash,
  purgeOne,
  purgeTrash,
  restoreBookmark,
  restoreFolder,
  trashCount,
} from "../trash/service.js";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Refusals are returned as a normal result with `isError`, not thrown: the
 * model needs to read *why* it was stopped and what to do instead, and a
 * transport-level exception gives it neither.
 */
function refuse(reason: string, extra: Record<string, unknown> = {}) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: reason, ...extra }, null, 2),
      },
    ],
  };
}

/**
 * MCP tools for the library-maintenance surface: smart folders (saved
 * queries), the trash, and duplicate detection.
 *
 * Note the asymmetry in how carefully these are guarded, which is deliberate.
 * Almost everything in this app is recoverable — deletes are soft and merges
 * send copies to the trash — so those tools are plain. Purging is the one
 * genuinely irreversible operation, so those tools demand an explicit
 * confirmation, and emptying the trash additionally requires the caller to
 * state how many items it expects to destroy. An assistant that has not
 * looked at the trash first cannot supply that number, which is the point:
 * "clean up my bookmarks" must not be able to become "shred the trash".
 */
export function registerLibraryTools(server: McpServer, ctx: AuthedContext) {
  /* ---- Smart folders --------------------------------------------------- */

  server.tool(
    "list_smart_folders",
    "List the caller's smart folders. A smart folder is a saved query (tags with AND/OR, free text, favourites-only), not a container: it holds no items of its own and its contents are recomputed on every read.",
    {},
    async () => ok(listSmartFolders(ctx)),
  );

  server.tool(
    "get_smart_folder_items",
    "Resolve a smart folder by id and return the folders and bookmarks it currently selects, together with its saved query.",
    { id: z.string().uuid() },
    async (args) => ok(resolveSmartFolder(ctx, args.id)),
  );

  server.tool(
    "preview_smart_query",
    "Run a smart-folder query without saving it, to check what it would select before creating the folder. Same predicates as create_smart_folder.",
    SmartQuerySchema.shape,
    async (args) => ok(resolveSmartQuery(ctx, SmartQuerySchema.parse(args))),
  );

  server.tool(
    "create_smart_folder",
    "Create a smart folder from a query. 'tagIds' come from list_tags; 'match' is \"all\" (AND) or \"any\" (OR); 'text' matches title/name, URL and description; 'favorite' restricts to starred items. An all-empty query selects nothing, so set at least one of them.",
    {
      name: z.string().min(1).max(120),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional()
        .describe("Sidebar dot colour, e.g. #6366f1."),
      ...SmartQuerySchema.shape,
    },
    async (args) => {
      const { name, color, ...query } = args;
      return ok(
        createSmartFolder(ctx, {
          name,
          color: color ?? "#6366f1",
          query: SmartQuerySchema.parse(query),
        }),
      );
    },
  );

  server.tool(
    "update_smart_folder",
    "Rename a smart folder, recolour it, or replace its query. Provide the whole query when changing it: the fields are not merged individually.",
    {
      id: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      query: SmartQuerySchema.optional(),
    },
    async (args) =>
      ok(
        updateSmartFolder(ctx, args.id, {
          name: args.name,
          color: args.color,
          query: args.query,
        }),
      ),
  );

  server.tool(
    "delete_smart_folder",
    "Delete a smart folder. Only the saved query is removed; the folders and bookmarks it listed are untouched.",
    { id: z.string().uuid() },
    async (args) => {
      deleteSmartFolder(ctx, args.id);
      return ok({ ok: true });
    },
  );

  /* ---- Trash ----------------------------------------------------------- */

  server.tool(
    "list_trash",
    "List everything in the trash. Deleting a folder stamps its whole subtree at once, so rows sharing a 'groupKey' were removed in the same action and come back together. 'path' is where each item will return to.",
    {},
    async () => ok(listTrash(ctx)),
  );

  server.tool(
    "count_trash",
    "How many items are in the trash. Call this before empty_trash: its 'expectedItemCount' must match.",
    {},
    async () => ok({ count: trashCount(ctx) }),
  );

  server.tool(
    "restore_from_trash",
    "Restore a trashed item. Restoring a folder brings back everything deleted alongside it in the same action, to its original place (or to the root if the parent folder no longer exists). Items removed separately at another time stay in the trash.",
    {
      type: z.enum(["folder", "bookmark"]),
      id: z.string().uuid(),
    },
    async (args) =>
      ok(
        args.type === "folder"
          ? restoreFolder(ctx, args.id)
          : restoreBookmark(ctx, args.id),
      ),
  );

  server.tool(
    "delete_from_trash_permanently",
    "IRREVERSIBLE. Destroy one trashed item and its history, snapshot and images. There is no undo and no backup. Only call it when the user has explicitly asked for this specific item to be destroyed; to merely remove something from view use delete_bookmark, which is recoverable.",
    {
      type: z.enum(["folder", "bookmark"]),
      id: z.string().uuid(),
      confirm: z
        .literal(true)
        .describe("Must be true, and only after the user asked for it."),
    },
    async (args) => {
      await purgeOne(ctx, args.type, args.id);
      return ok({ ok: true, purged: { type: args.type, id: args.id } });
    },
  );

  server.tool(
    "empty_trash",
    "IRREVERSIBLE. Destroy trashed items for good. 'expectedItemCount' must equal what count_trash returns right now, so call that first; if it does not match, nothing is destroyed and the real count is returned. Pass 'olderThanDays' to spare anything deleted more recently. Only call it when the user explicitly asked to empty the trash.",
    {
      confirm: z
        .literal(true)
        .describe("Must be true, and only after the user asked for it."),
      expectedItemCount: z
        .number()
        .int()
        .min(0)
        .describe("The count_trash value the caller believes is current."),
      olderThanDays: z
        .number()
        .int()
        .min(0)
        .max(3650)
        .optional()
        .describe("Only destroy items deleted more than this many days ago."),
    },
    async (args) => {
      // Same idea as the `baseRev` check on edits: a bulk destructive action
      // must prove it knows the state it is acting on. It also stops a model
      // from calling this blind, since the number can only come from a prior
      // count_trash.
      const actual = trashCount(ctx);
      if (actual !== args.expectedItemCount) {
        return refuse(
          "Trash size does not match expectedItemCount, so nothing was destroyed. Re-check with count_trash and, if the user still wants it, call again with the real number.",
          { expectedItemCount: args.expectedItemCount, actualItemCount: actual },
        );
      }
      const res = await purgeTrash(ctx, { olderThanDays: args.olderThanDays });
      return ok({ ...res, destroyed: res.folders + res.bookmarks });
    },
  );

  /* ---- Duplicates ------------------------------------------------------ */

  server.tool(
    "find_duplicate_bookmarks",
    "Group bookmarks that point at the same URL. Matching ignores trailing slashes, default ports and #fragments. Symlinks are excluded, since pointing at the same URL from two places is what they are for.",
    {},
    async () => ok(findDuplicates(ctx)),
  );

  server.tool(
    "merge_duplicate_bookmarks",
    "Fold duplicates into one. The keeper gains every tag and any description or real title it was missing, stays starred if any copy was, and inherits symlinks that pointed at the copies. The copies go to the trash, so a merge can be undone with restore_from_trash. All ids must share the same URL; the call is rejected otherwise.",
    {
      keepId: z.string().uuid().describe("The bookmark that survives."),
      mergeIds: z
        .array(z.string().uuid())
        .min(1)
        .max(200)
        .describe("Copies to fold into the keeper, from find_duplicate_bookmarks."),
    },
    async (args) => ok(mergeBookmarks(ctx, args.keepId, args.mergeIds)),
  );
}
