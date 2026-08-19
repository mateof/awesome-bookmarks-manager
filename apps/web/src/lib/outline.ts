/**
 * Turn a selection of folders and bookmarks into a hierarchical list, ready to
 * paste somewhere else.
 *
 * Two formats at once, the same trick `copyRichLink` uses for a single link:
 * Markdown in `text/plain`, which chats show readably (and Slack, Discord or
 * GitHub render outright), and a nested `<ul>` of real anchors in `text/html`,
 * which email clients and documents paste as a clickable outline. One action,
 * both destinations, and neither loses the shape of the tree.
 */

export interface OutlineFolder {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
}

export interface OutlineBookmark {
  id: string;
  folderId: string | null;
  title: string;
  url: string;
  position: number;
}

export interface OutlineSelection {
  folderIds: string[];
  bookmarkIds: string[];
}

interface Node {
  kind: "folder" | "bookmark";
  label: string;
  url?: string;
  children: Node[];
}

function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Markdown's list and emphasis markers, so a title containing them survives
 * the round trip instead of turning into formatting. */
function escapeMarkdown(s: string): string {
  return s.replace(/([\\`*_[\]])/g, "\\$1");
}

function subtree(
  folderId: string,
  folders: OutlineFolder[],
  bookmarks: OutlineBookmark[],
): Node[] {
  const out: Node[] = [];
  for (const f of folders.filter((x) => x.parentId === folderId).sort(byPosition)) {
    out.push({
      kind: "folder",
      label: f.name,
      children: subtree(f.id, folders, bookmarks),
    });
  }
  for (const b of bookmarks.filter((x) => x.folderId === folderId).sort(byPosition)) {
    out.push({ kind: "bookmark", label: b.title || b.url, url: b.url, children: [] });
  }
  return out;
}

/**
 * The roots to render for a selection.
 *
 * A folder whose ancestor is also selected is dropped, and so is a bookmark
 * that already lives inside one of the selected folders: selecting a folder
 * and something inside it is a normal thing to do with a mouse, and it should
 * not produce the same entry twice.
 */
function rootsOf(
  selection: OutlineSelection,
  folders: OutlineFolder[],
  bookmarks: OutlineBookmark[],
): Node[] {
  const selectedFolders = new Set(selection.folderIds);
  const byId = new Map(folders.map((f) => [f.id, f]));

  const coveredByAncestor = (id: string): boolean => {
    let cur = byId.get(id)?.parentId ?? null;
    let guard = 0;
    while (cur && guard++ < 100) {
      if (selectedFolders.has(cur)) return true;
      cur = byId.get(cur)?.parentId ?? null;
    }
    return false;
  };

  const topFolders = folders
    .filter((f) => selectedFolders.has(f.id) && !coveredByAncestor(f.id))
    .sort(byPosition);

  const nodes: Node[] = topFolders.map((f) => ({
    kind: "folder",
    label: f.name,
    children: subtree(f.id, folders, bookmarks),
  }));

  const selectedBookmarks = new Set(selection.bookmarkIds);
  const topBookmarks = bookmarks
    .filter(
      (b) =>
        selectedBookmarks.has(b.id) &&
        !(
          b.folderId &&
          (selectedFolders.has(b.folderId) || coveredByAncestor(b.folderId))
        ),
    )
    .sort(byPosition);
  for (const b of topBookmarks) {
    nodes.push({
      kind: "bookmark",
      label: b.title || b.url,
      url: b.url,
      children: [],
    });
  }
  return nodes;
}

function toMarkdown(nodes: Node[], depth = 0): string {
  const pad = "  ".repeat(depth);
  return nodes
    .map((n) => {
      const line =
        n.kind === "folder"
          ? `${pad}- **${escapeMarkdown(n.label)}**`
          : `${pad}- [${escapeMarkdown(n.label)}](${n.url})`;
      const rest = n.children.length > 0 ? `\n${toMarkdown(n.children, depth + 1)}` : "";
      return line + rest;
    })
    .join("\n");
}

function toHtml(nodes: Node[]): string {
  if (nodes.length === 0) return "";
  const items = nodes
    .map((n) => {
      const label =
        n.kind === "folder"
          ? `<strong>${escapeHtml(n.label)}</strong>`
          : `<a href="${escapeHtml(n.url ?? "")}">${escapeHtml(n.label)}</a>`;
      return `<li>${label}${toHtml(n.children)}</li>`;
    })
    .join("");
  return `<ul>${items}</ul>`;
}

export interface Outline {
  text: string;
  html: string;
  /** Bookmarks in the result, for the "nothing to copy" case. */
  links: number;
}

export function buildOutline(
  selection: OutlineSelection,
  folders: OutlineFolder[],
  bookmarks: OutlineBookmark[],
): Outline {
  const nodes = rootsOf(selection, folders, bookmarks);
  const count = (list: Node[]): number =>
    list.reduce(
      (n, x) => n + (x.kind === "bookmark" ? 1 : 0) + count(x.children),
      0,
    );
  return { text: toMarkdown(nodes), html: toHtml(nodes), links: count(nodes) };
}

/** Copy an outline as Markdown *and* as HTML, so it pastes right into a chat
 * and into an email. Falls back to the Markdown alone. */
export async function copyOutline(outline: Outline): Promise<boolean> {
  try {
    if (
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard &&
      "write" in navigator.clipboard
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([outline.text], { type: "text/plain" }),
          "text/html": new Blob([outline.html], { type: "text/html" }),
        }),
      ]);
      return true;
    }
  } catch {
    // Fall through to plain-text Markdown.
  }
  try {
    await navigator.clipboard?.writeText(outline.text);
    return true;
  } catch {
    return false;
  }
}
