import { pickTagColor, type Tag } from "@awesome-bookmarks/shared";
import { and, eq, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../../auth/session.js";
import { sealRowField } from "../../groups/scope.js";
import { getAutoSnapshots } from "../../auth/service.js";
import { groupOfFolder } from "../../folders/service.js";
import { getDb } from "../../db/client.js";
import { bookmarks, bookmarkTags, folders, tags } from "../../db/schema.js";
import {
  countNodes,
  parseNetscapeHtml,
  type ImportNode,
} from "../../imports/formats.js";
import { enqueue } from "../queue.js";
import { urlHash } from "../../util/url.js";

interface ImportPayload {
  /** Legacy shape: an HTML file, parsed here. */
  html?: string;
  /** Any supported export, already parsed and named by the route. */
  tree?: ImportNode[];
  app?: string;
  /** When false, skip snapshot/favicon enqueue for every imported bookmark. */
  fetchSnapshots?: boolean;
  /** Existing folder id to import into. Null/undefined = root. */
  parentId?: string | null;
  /**
   * If set, a new folder with this name is created (under parentId) and the
   * import tree is placed inside it.
   */
  wrapperFolderName?: string;
  /**
   * Keep "archived" and "to read" as tags. The app has no such states of its
   * own, and the alternative to a tag is throwing the information away.
   */
  stateTags?: boolean;
}

/** Names for states this app does not have, so they survive as tags. */
const ARCHIVED_TAG = "archivado";
const UNREAD_TAG = "por leer";

/** A file that names four hundred tags on one bookmark is not a bookmark. */
const MAX_TAGS_PER_ITEM = 20;

/**
 * Print the parsed tree as a compact ASCII outline. Up to 4 levels deep so
 * we can eyeball whether bookmarks ended up in the right folders without
 * spamming the console.
 */
function dumpTree(nodes: ImportNode[], maxDepth = 4): string {
  const lines: string[] = [];
  const walk = (list: ImportNode[], depth: number) => {
    for (const n of list) {
      const indent = "  ".repeat(depth);
      if (n.type === "folder") {
        const childCount = n.children?.length ?? 0;
        lines.push(`${indent}📁 ${n.name} (${childCount} items)`);
        if (depth < maxDepth && n.children) walk(n.children, depth + 1);
      } else {
        lines.push(`${indent}🔗 ${truncate(n.name ?? "", 60)}`);
      }
    }
  };
  walk(nodes, 0);
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export async function runImportJob(
  userId: string,
  dek: Buffer,
  payload: ImportPayload,
) {
  const tree = payload.tree ?? parseNetscapeHtml(payload.html ?? "");
  const counts = countNodes(tree);
  console.log(
    `[import] parsed ${counts.folders} folders + ${counts.bookmarks} bookmarks` +
      ` (${payload.app ?? "HTML"}) for user ${userId}`,
  );
  // Tree dump — helps diagnose missing items. Prints to stderr to keep stdout
  // clean for the regular request log.
  console.error(`[import] tree:\n${dumpTree(tree)}`);
  if (counts.folders === 0 && counts.bookmarks === 0) {
    throw new Error(
      "No se encontraron marcadores en el fichero (¿formato no soportado?)",
    );
  }
  const db = getDb();

  const wantSnapshots =
    (payload.fetchSnapshots ?? false) && getAutoSnapshots(userId);

  let resolvedParent: string | null = null;
  if (payload.parentId) {
    const found = db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.id, payload.parentId),
          eq(folders.userId, userId),
          isNull(folders.deletedAt),
        ),
      )
      .get();
    if (found) resolvedParent = payload.parentId;
  }

  // Everything imported inherits the destination folder's key, the same way
  // `createBookmark` does when you add one by hand. Sealing with the owner's
  // DEK instead produced rows that sit inside a shared folder and look like
  // they belong to it, while the group cannot read a single one — and silently,
  // because the owner can read them perfectly well.
  const ctx = { userId, dek } as AuthedContext;
  const inherited = resolvedParent
    ? groupOfFolder(ctx, resolvedParent)
    : { keyGroupId: null, keyScopeId: null };
  const keyed = { userId, ...inherited };
  const seal = (field: string, plaintext: string) =>
    sealRowField(ctx, keyed, field, plaintext);

  /**
   * Tags by name, reusing the ones already in the library.
   *
   * Matched case-insensitively: an import that brings `Prensa` when `prensa`
   * exists should not leave two tags that look identical in every list.
   * Tag names are not encrypted, so this is a plain lookup rather than a
   * decrypt-everything pass.
   */
  const known: Tag[] = db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(eq(tags.userId, userId))
    .all();
  const idByName = new Map(known.map((t) => [t.name.toLowerCase(), t.id]));

  const ensureTag = (rawName: string): string | null => {
    const name = rawName.trim().slice(0, 128);
    if (!name) return null;
    const hit = idByName.get(name.toLowerCase());
    if (hit) return hit;
    const id = uuidv4();
    const color = pickTagColor(known);
    db.insert(tags).values({ id, userId, name, color }).run();
    known.push({ id, name, color });
    idByName.set(name.toLowerCase(), id);
    return id;
  };

  const wrapperName = payload.wrapperFolderName?.trim();
  if (wrapperName) {
    const wrapperId = uuidv4();
    db.insert(folders)
      .values({
        id: wrapperId,
        userId,
        ...inherited,
        parentId: resolvedParent,
        nameCt: seal("folder.name", wrapperName),
        position: nextRootPosition(userId, resolvedParent),
      })
      .run();
    resolvedParent = wrapperId;
  }

  const insertNodes = (nodes: ImportNode[], parentId: string | null) => {
    let pos = 0;
    for (const node of nodes) {
      if (node.type === "folder") {
        const id = uuidv4();
        db.insert(folders)
          .values({
            id,
            userId,
            ...inherited,
            parentId,
            nameCt: seal("folder.name", node.name ?? "Untitled"),
            position: pos++,
          })
          .run();
        if (node.children) insertNodes(node.children, id);
      } else if (node.type === "bookmark" && node.url) {
        const id = uuidv4();
        const title = node.name?.trim() || node.url;
        db.insert(bookmarks)
          .values({
            id,
            userId,
            ...inherited,
            folderId: parentId,
            titleCt: seal("bookmark.title", title),
            urlCt: seal("bookmark.url", node.url),
            descriptionCt: node.description
              ? seal("bookmark.description", node.description)
              : null,
            urlHash: urlHash(node.url, userId),
            favorite: node.favorite ?? false,
            // The date the link was saved in the app it came from. Without it
            // an import of ten years of bookmarks is ten years of links all
            // saved this afternoon, and "recently added" stops meaning
            // anything.
            ...(node.createdAt
              ? { createdAt: new Date(node.createdAt * 1000).toISOString() }
              : {}),
            snapshotStatus: wantSnapshots ? "pending" : "none",
            position: pos++,
          })
          .run();

        const wanted = [...(node.tags ?? [])];
        if (payload.stateTags !== false) {
          if (node.archived) wanted.push(ARCHIVED_TAG);
          if (node.unread) wanted.push(UNREAD_TAG);
        }
        const seen = new Set<string>();
        for (const name of wanted.slice(0, MAX_TAGS_PER_ITEM)) {
          const tagId = ensureTag(name);
          if (!tagId || seen.has(tagId)) continue;
          seen.add(tagId);
          db.insert(bookmarkTags).values({ bookmarkId: id, tagId }).run();
        }

        if (wantSnapshots) {
          enqueue({ userId, type: "favicon", payload: { bookmarkId: id } });
          enqueue({ userId, type: "snapshot", payload: { bookmarkId: id } });
        }
      }
    }
  };

  db.transaction(() => {
    insertNodes(tree, resolvedParent);
  });
}

function nextRootPosition(userId: string, parentId: string | null): number {
  const rows = getDb()
    .select({ position: folders.position })
    .from(folders)
    .where(
      and(
        eq(folders.userId, userId),
        parentId === null
          ? isNull(folders.parentId)
          : eq(folders.parentId, parentId),
        isNull(folders.deletedAt),
      ),
    )
    .all();
  return rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;
}
