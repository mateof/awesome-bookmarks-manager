#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * AwesomeBookmarks MCP server.
 *
 * A thin stdio MCP server that an AI client (Claude Desktop, etc.) runs
 * locally. It forwards tool calls to a self-hosted AwesomeBookmarks
 * instance over its public /api/v1 surface using a Bearer API token.
 *
 * Configuration (environment variables):
 *   AWESOMEBOOKMARKS_URL    Base URL of the instance, e.g. http://192.168.0.22:7055
 *   AWESOMEBOOKMARKS_TOKEN  An API token created in Settings -> API.
 */

const BASE = (process.env.AWESOMEBOOKMARKS_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.AWESOMEBOOKMARKS_TOKEN ?? "";

if (!BASE) {
  console.error("AWESOMEBOOKMARKS_URL environment variable is required.");
  process.exit(1);
}
if (!TOKEN) {
  console.error("AWESOMEBOOKMARKS_TOKEN environment variable is required.");
  process.exit(1);
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const hasBody = init.body !== undefined && init.body !== null;
  const headers: Record<string, string> = {
    authorization: `Bearer ${TOKEN}`,
  };
  if (hasBody) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}/api/v1${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      (body && (body.error as string)) || `HTTP ${res.status} for ${path}`;
    throw new Error(msg);
  }
  return body as T;
}

/** Turn tag names into ids, creating any that don't exist yet. */
async function resolveTagIds(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const existing = await apiFetch<Tag[]>("/tags");
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));
  const out: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const found = byName.get(lower);
    if (found) {
      out.push(found);
    } else {
      const created = await apiFetch<Tag>("/tags", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      byName.set(lower, created.id);
      out.push(created.id);
    }
  }
  return out;
}

function ok(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

const server = new McpServer({
  name: "awesomebookmarks",
  version: "0.6.0",
});

server.tool(
  "list_folders",
  "List all folders (id, name, parentId) for the account.",
  {},
  async () => ok(await apiFetch("/folders")),
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
      await apiFetch("/folders", {
        method: "POST",
        body: JSON.stringify(args),
      }),
    ),
);

server.tool(
  "list_bookmarks",
  "List bookmarks. Optionally filter by folder, tag id or a text query.",
  {
    folderId: z.string().uuid().optional(),
    tagId: z.string().uuid().optional(),
    query: z.string().max(256).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (args) => {
    const qs = new URLSearchParams();
    if (args.folderId) qs.set("folderId", args.folderId);
    if (args.tagId) qs.set("tagId", args.tagId);
    if (args.query) qs.set("q", args.query);
    if (args.limit) qs.set("limit", String(args.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return ok(await apiFetch(`/bookmarks${suffix}`));
  },
);

server.tool(
  "get_bookmark",
  "Get a single bookmark by id.",
  { id: z.string().uuid() },
  async ({ id }) => ok(await apiFetch(`/bookmarks/${id}`)),
);

server.tool(
  "add_bookmark",
  "Add a bookmark. A page snapshot and favicon are captured in the background. Tags are given by name and created if missing.",
  {
    url: z.string().url().max(8192),
    title: z.string().min(1).max(1024).optional(),
    description: z.string().max(100000).optional(),
    folderId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().min(1).max(64)).optional(),
  },
  async (args) => {
    const tagIds = args.tags ? await resolveTagIds(args.tags) : undefined;
    return ok(
      await apiFetch("/bookmarks", {
        method: "POST",
        body: JSON.stringify({
          url: args.url,
          title: args.title,
          description: args.description,
          folderId: args.folderId ?? null,
          tagIds,
        }),
      }),
    );
  },
);

server.tool(
  "update_bookmark",
  "Update a bookmark's fields. Only the provided fields change. Tags (by name) replace the whole tag set when given.",
  {
    id: z.string().uuid(),
    title: z.string().min(1).max(1024).optional(),
    url: z.string().url().max(8192).optional(),
    description: z.string().max(100000).nullable().optional(),
    folderId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().min(1).max(64)).optional(),
  },
  async (args) => {
    const tagIds = args.tags ? await resolveTagIds(args.tags) : undefined;
    const body: Record<string, unknown> = {};
    if (args.title !== undefined) body.title = args.title;
    if (args.url !== undefined) body.url = args.url;
    if (args.description !== undefined) body.description = args.description;
    if (args.folderId !== undefined) body.folderId = args.folderId;
    if (tagIds !== undefined) body.tagIds = tagIds;
    return ok(
      await apiFetch(`/bookmarks/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
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
    await apiFetch(`/bookmarks/${args.id}/move`, {
      method: "POST",
      body: JSON.stringify({
        newFolderId: args.newFolderId,
        position: args.position,
      }),
    });
    return ok({ ok: true });
  },
);

server.tool(
  "delete_bookmark",
  "Delete a bookmark by id.",
  { id: z.string().uuid() },
  async ({ id }) => {
    await apiFetch(`/bookmarks/${id}`, { method: "DELETE" });
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
  async (args) => {
    const qs = new URLSearchParams({ q: args.query });
    if (args.folderId) qs.set("folderId", args.folderId);
    if (args.limit) qs.set("limit", String(args.limit));
    return ok(await apiFetch(`/search?${qs.toString()}`));
  },
);

server.tool(
  "list_tags",
  "List all tags (id, name, color).",
  {},
  async () => ok(await apiFetch("/tags")),
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
    ok(
      await apiFetch("/tags", {
        method: "POST",
        body: JSON.stringify(args),
      }),
    ),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs; stdout is the MCP transport.
  console.error(`AwesomeBookmarks MCP server connected to ${BASE}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
