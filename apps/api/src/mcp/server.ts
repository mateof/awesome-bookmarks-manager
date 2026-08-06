import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthedContext } from "../auth/session.js";
import { getMe } from "../auth/service.js";
import {
  createBookmark,
  deleteBookmark,
  getBookmark,
  listBookmarks,
  moveBookmark,
  updateBookmark,
} from "../bookmarks/service.js";
import {
  createFolder,
  listFolders,
} from "../folders/service.js";
import { search } from "../search/service.js";
import { createTag, listTags } from "../tags/service.js";

const MCP_VERSION = "0.6.0";

function ok(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

/**
 * Build a fresh in-process MCP server bound to one authenticated user. Tools
 * call the domain services directly (no HTTP hop). A new instance is created
 * per request by the stateless Streamable HTTP transport.
 */
export function buildMcpServer(ctx: AuthedContext): McpServer {
  const server = new McpServer({
    name: "awesomebookmarks",
    version: MCP_VERSION,
  });

  const resolveTagIds = (names: string[]): string[] => {
    if (names.length === 0) return [];
    const existing = listTags(ctx);
    const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));
    const out: string[] = [];
    for (const name of names) {
      const lower = name.toLowerCase();
      const found = byName.get(lower);
      if (found) {
        out.push(found);
      } else {
        const created = createTag(ctx, { name, color: "#64748b" });
        byName.set(lower, created.id);
        out.push(created.id);
      }
    }
    return out;
  };

  server.tool(
    "whoami",
    "Return the authenticated account (id, email, nickname).",
    {},
    async () => ok(getMe(ctx.userId)),
  );

  server.tool(
    "list_folders",
    "List all folders (id, name, parentId). Build the tree from parentId.",
    {},
    async () => ok(listFolders(ctx)),
  );

  server.tool(
    "create_folder",
    "Create a folder. Returns the created folder.",
    {
      name: z.string().min(1).max(256),
      parentId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Parent folder id, or null/omit for the root."),
      description: z.string().max(100000).optional(),
    },
    async (args) =>
      ok(
        createFolder(ctx, {
          name: args.name,
          parentId: args.parentId ?? null,
          description: args.description,
        }),
      ),
  );

  server.tool(
    "list_bookmarks",
    "List bookmarks. Optionally filter by folderId, tagId or a text query.",
    {
      folderId: z.string().uuid().optional(),
      tagId: z.string().uuid().optional(),
      query: z.string().max(256).optional(),
      limit: z.number().int().min(1).max(1000).optional(),
    },
    async (args) =>
      ok(
        listBookmarks(ctx, {
          folderId: args.folderId,
          tagId: args.tagId,
          q: args.query,
          limit: args.limit,
        }),
      ),
  );

  server.tool(
    "get_bookmark",
    "Get a single bookmark by id.",
    { id: z.string().uuid() },
    async ({ id }) => ok(getBookmark(ctx, id)),
  );

  server.tool(
    "add_bookmark",
    "Add a bookmark. Favicon and page snapshot are captured in the background. Tags are given by name and created if missing.",
    {
      url: z.string().url().max(8192),
      title: z.string().min(1).max(1024).optional(),
      description: z.string().max(100000).optional(),
      folderId: z.string().uuid().nullable().optional(),
      tags: z.array(z.string().min(1).max(64)).optional(),
    },
    async (args) => {
      const tagIds = args.tags ? resolveTagIds(args.tags) : undefined;
      return ok(
        createBookmark(ctx, {
          url: args.url,
          title: args.title,
          description: args.description,
          folderId: args.folderId ?? null,
          tagIds,
        }),
      );
    },
  );

  server.tool(
    "update_bookmark",
    "Update a bookmark's fields. Only provided fields change. Tags (by name) replace the whole set when given.",
    {
      id: z.string().uuid(),
      title: z.string().min(1).max(1024).optional(),
      url: z.string().url().max(8192).optional(),
      description: z.string().max(100000).nullable().optional(),
      folderId: z.string().uuid().nullable().optional(),
      tags: z.array(z.string().min(1).max(64)).optional(),
    },
    async (args) => {
      const tagIds = args.tags ? resolveTagIds(args.tags) : undefined;
      return ok(
        updateBookmark(ctx, args.id, {
          title: args.title,
          url: args.url,
          description: args.description,
          folderId: args.folderId,
          tagIds,
        }),
      );
    },
  );

  server.tool(
    "move_bookmark",
    "Move a bookmark to another folder and/or position. newFolderId null = root.",
    {
      id: z.string().uuid(),
      newFolderId: z.string().uuid().nullable(),
      position: z.number().int().min(0).default(0),
    },
    async (args) => {
      moveBookmark(ctx, args.id, args.newFolderId, args.position);
      return ok({ ok: true });
    },
  );

  server.tool(
    "delete_bookmark",
    "Delete a bookmark by id.",
    { id: z.string().uuid() },
    async ({ id }) => {
      deleteBookmark(ctx, id);
      return ok({ ok: true });
    },
  );

  server.tool(
    "search_bookmarks",
    "Full-text + fuzzy search over the account's bookmarks. Optionally scope to a folder.",
    {
      query: z.string().min(1).max(256),
      folderId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) =>
      ok(
        search(ctx, args.query, args.limit ?? 50, {
          folderId: args.folderId ?? null,
        }),
      ),
  );

  server.tool(
    "list_tags",
    "List all tags (id, name, color).",
    {},
    async () => ok(listTags(ctx)),
  );

  server.tool(
    "create_tag",
    "Create a tag with an optional hex color (defaults to a neutral gray).",
    {
      name: z.string().min(1).max(64),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    },
    async (args) =>
      ok(createTag(ctx, { name: args.name, color: args.color ?? "#64748b" })),
  );

  return server;
}
