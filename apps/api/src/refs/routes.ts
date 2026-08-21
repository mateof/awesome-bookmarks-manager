import {
  ResolveRefsBodySchema,
  type RefCandidate,
  type ResolvedRef,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { attachmentBySlug } from "../attachments/service.js";
import { requireAuth } from "../auth/session.js";
import { listBookmarks } from "../bookmarks/service.js";
import { listFolders } from "../folders/service.js";

/**
 * Resolving and finding the things a description can point at.
 *
 * Two endpoints rather than one because they answer different questions at
 * different moments: `search` is what the picker calls while you type a
 * reference, `resolve` is what the *rendered* note calls once, in a batch, to
 * turn the ids it stored into chips with titles and tooltips. Resolving one
 * reference per request would mean a request per chip on every render.
 */

/** Rich text in, one line of readable text out, for the tooltip preview. */
function plainPreview(html: string | null | undefined, max = 240): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export const refRoutes: FastifyPluginAsync = async (app) => {
  app.get("/refs/search", async (req) => {
    const ctx = requireAuth(req);
    const { q, limit } = z
      .object({
        q: z.string().max(128).default(""),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);

    const needle = q.trim().toLowerCase();
    const folders = listFolders(ctx);
    const folderName = new Map(folders.map((f) => [f.id, f.name]));

    const out: RefCandidate[] = [];
    for (const f of folders) {
      if (needle && !f.name.toLowerCase().includes(needle)) continue;
      out.push({
        type: "folder",
        id: f.id,
        slug: null,
        title: f.name,
        url: null,
        hint: f.parentId ? (folderName.get(f.parentId) ?? null) : null,
      });
    }
    for (const b of listBookmarks(ctx, { limit: 5000 })) {
      const hay = `${b.title} ${b.url}`.toLowerCase();
      if (needle && !hay.includes(needle)) continue;
      out.push({
        type: "bookmark",
        id: b.id,
        slug: null,
        title: b.title,
        url: b.url,
        hint: b.folderId ? (folderName.get(b.folderId) ?? null) : null,
      });
    }

    // Titles that start with what was typed first: when you type "cont" you
    // almost always mean the thing called "Contratos", not the one that merely
    // mentions it halfway through.
    out.sort((a, b) => {
      const as = a.title.toLowerCase().startsWith(needle) ? 0 : 1;
      const bs = b.title.toLowerCase().startsWith(needle) ? 0 : 1;
      return as - bs || a.title.localeCompare(b.title);
    });
    return out.slice(0, limit);
  });

  app.post("/refs/resolve", async (req) => {
    const ctx = requireAuth(req);
    const { refs } = ResolveRefsBodySchema.parse(req.body ?? {});
    if (refs.length === 0) return [];

    // Listed once and indexed, not queried per reference: a note with thirty
    // chips would otherwise walk the whole table thirty times.
    const wantsFolder = refs.some((r) => r.type === "folder");
    const wantsBookmark = refs.some((r) => r.type === "bookmark");
    const folders = wantsFolder ? listFolders(ctx) : [];
    const bookmarks = wantsBookmark ? listBookmarks(ctx, { limit: 5000 }) : [];
    const folderById = new Map(folders.map((f) => [f.id, f]));
    const bookmarkById = new Map(bookmarks.map((b) => [b.id, b]));

    const missing = (type: ResolvedRef["type"], id: string | null, slug: string | null): ResolvedRef => ({
      type,
      id,
      slug,
      title: "",
      url: null,
      description: null,
      found: false,
    });

    return refs.map((r): ResolvedRef => {
      if (r.type === "folder") {
        const f = r.id ? folderById.get(r.id) : undefined;
        if (!f) return missing("folder", r.id ?? null, null);
        return {
          type: "folder",
          id: f.id,
          slug: null,
          title: f.name,
          url: null,
          description: plainPreview(f.description),
          found: true,
        };
      }
      if (r.type === "bookmark") {
        const b = r.id ? bookmarkById.get(r.id) : undefined;
        if (!b) return missing("bookmark", r.id ?? null, null);
        return {
          type: "bookmark",
          id: b.id,
          slug: null,
          title: b.title,
          url: b.url,
          description: plainPreview(b.description),
          found: true,
        };
      }
      // Assets are addressed by slug, so that a file replaced under the same
      // slug keeps every note that mentions it working.
      const a = r.slug ? attachmentBySlug(ctx, r.slug) : null;
      if (!a) return missing("asset", null, r.slug ?? null);
      return {
        type: "asset",
        id: a.id,
        slug: a.slug,
        title: a.name,
        url: null,
        description: a.description,
        found: true,
      };
    });
  });
};
