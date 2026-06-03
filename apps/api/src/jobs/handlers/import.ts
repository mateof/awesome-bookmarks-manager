import { and, eq, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { sealField } from "../../auth/encryption.js";
import { getAutoSnapshots } from "../../auth/service.js";
import { getDb } from "../../db/client.js";
import { bookmarks, folders } from "../../db/schema.js";
import { enqueue } from "../queue.js";
import { urlHash } from "../../util/url.js";

interface ImportPayload {
  html: string;
  /** When false, skip snapshot/favicon enqueue for every imported bookmark. */
  fetchSnapshots?: boolean;
  /** Existing folder id to import into. Null/undefined = root. */
  parentId?: string | null;
  /**
   * If set, a new folder with this name is created (under parentId) and the
   * import tree is placed inside it.
   */
  wrapperFolderName?: string;
}

interface ImportNode {
  type: "folder" | "bookmark";
  name?: string;
  url?: string;
  children?: ImportNode[];
}

/**
 * Netscape Bookmark File Format parser (Chrome / Firefox / Edge / Safari).
 *
 * The format is HTML-ish but with omitted closing tags (`<DT>`, `<P>`) and
 * a folder's children live in a `<DL>` *sibling* of the folder's `<DT>`,
 * not nested inside. Building a real DOM and walking it is brittle because
 * different parsers reconstruct the tree differently.
 *
 * Instead we scan the raw HTML for the four meaningful tokens in order
 * — `<DL>`, `</DL>`, `<H3>...</H3>`, `<A HREF="...">...</A>` — and track
 * folder nesting with a `<DL>` push/pop stack. This is the classical
 * approach for this format and is immune to weird whitespace/wrapper tags.
 */
function parseBookmarksHtml(html: string): ImportNode[] {
  const root: ImportNode[] = [];
  // Stack of "current children list to insert into". Top of stack is where
  // new folders/bookmarks go.
  const stack: ImportNode[][] = [root];
  // For each open <DL>, track whether opening it pushed a folder context
  // (true) or it's an outer/orphan <DL> that didn't (false). Tells us whether
  // the matching </DL> should pop the stack.
  const dlPushed: boolean[] = [];
  // The most recent <H3> we saw and haven't yet associated with its <DL>.
  let pendingFolder: ImportNode | null = null;

  // Token regex — anchor capture is permissive: we grab the full attribute
  // string and the inner text, then parse `href` separately. That avoids
  // brittle ordering assumptions (whitespace before href, quote style, etc.).
  const TOKEN =
    /(<dl\b[^>]*>)|(<\/dl\s*>)|<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(html)) !== null) {
    if (m[1] !== undefined) {
      // <DL>
      if (pendingFolder) {
        stack.push(pendingFolder.children ?? []);
        dlPushed.push(true);
        pendingFolder = null;
      } else {
        dlPushed.push(false);
      }
    } else if (m[2] !== undefined) {
      // </DL>
      const popped = dlPushed.pop() ?? false;
      if (popped && stack.length > 1) stack.pop();
      pendingFolder = null;
    } else if (m[3] !== undefined) {
      // <H3>name</H3>
      const name = cleanText(m[3]) || "Sin nombre";
      const folder: ImportNode = { type: "folder", name, children: [] };
      const top = stack[stack.length - 1];
      if (top) top.push(folder);
      pendingFolder = folder;
    } else if (m[4] !== undefined) {
      // <A ...attrs...>text</A>
      const attrs = m[4];
      const hrefMatch = HREF_RE.exec(attrs);
      const url = decodeEntities(
        (hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim(),
      );
      const text = cleanText(m[5] ?? "") || url;
      if (url) {
        const top = stack[stack.length - 1];
        if (top) top.push({ type: "bookmark", name: text, url });
      }
    }
  }

  return root;
}

function cleanText(raw: string): string {
  // Strip any nested HTML tags and decode common entities.
  const noTags = raw.replace(/<[^>]*>/g, "");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => safeFromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) =>
      safeFromCodePoint(parseInt(n, 16)),
    );
}

function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

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

/** Diagnostic counts — useful when investigating parse misses. */
function countNodes(nodes: ImportNode[]): { folders: number; bookmarks: number } {
  let f = 0;
  let b = 0;
  const walk = (list: ImportNode[]) => {
    for (const n of list) {
      if (n.type === "folder") {
        f++;
        if (n.children) walk(n.children);
      } else {
        b++;
      }
    }
  };
  walk(nodes);
  return { folders: f, bookmarks: b };
}

export async function runImportJob(
  userId: string,
  dek: Buffer,
  payload: ImportPayload,
) {
  const tree = parseBookmarksHtml(payload.html);
  const counts = countNodes(tree);
  console.log(
    `[import] parsed ${counts.folders} folders + ${counts.bookmarks} bookmarks for user ${userId}`,
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
    (payload.fetchSnapshots ?? true) && getAutoSnapshots(userId);

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

  const wrapperName = payload.wrapperFolderName?.trim();
  if (wrapperName) {
    const wrapperId = uuidv4();
    db.insert(folders)
      .values({
        id: wrapperId,
        userId,
        parentId: resolvedParent,
        nameCt: sealField(dek, userId, "folder.name", wrapperName),
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
            parentId,
            nameCt: sealField(
              dek,
              userId,
              "folder.name",
              node.name ?? "Untitled",
            ),
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
            folderId: parentId,
            titleCt: sealField(dek, userId, "bookmark.title", title),
            urlCt: sealField(dek, userId, "bookmark.url", node.url),
            urlHash: urlHash(node.url, userId),
            snapshotStatus: wantSnapshots ? "pending" : "none",
            position: pos++,
          })
          .run();
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
