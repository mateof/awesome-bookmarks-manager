import type { PanelFolder } from "@awesome-bookmarks/shared";

/**
 * Build a Netscape bookmarks file from a panel's tree, in the browser.
 *
 * It is generated client-side from the tree the page already holds instead of
 * from a new public endpoint: that way it works identically for password- and
 * user-restricted panels (the viewer has already been authorised to see this
 * content) without putting credentials in a download URL.
 *
 * The markup mirrors apps/api/src/exports/netscape.ts so both exports import
 * the same way into Chrome, Firefox and Edge. Symlinks need no special casing:
 * the panel snapshot already resolved them into real content.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emitFolder(out: string[], folder: PanelFolder, indent: string): void {
  out.push(`${indent}<DT><H3>${escapeHtml(folder.name)}</H3>`);
  out.push(`${indent}<DL><p>`);
  const inner = `${indent}    `;
  for (const b of folder.bookmarks) {
    out.push(`${inner}<DT><A HREF="${escapeHtml(b.url)}">${escapeHtml(b.title)}</A>`);
  }
  for (const sub of folder.subfolders) emitFolder(out, sub, inner);
  out.push(`${indent}</DL><p>`);
}

/**
 * `title` names the wrapper folder the browser creates on import, so the whole
 * panel lands in one place instead of scattering into the bookmarks bar.
 */
export function buildPanelBookmarksHtml(root: PanelFolder, title: string): string {
  const out: string[] = [];
  out.push("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
  out.push("<!-- This is an automatically generated file. Do not edit. -->");
  out.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  out.push(`<TITLE>${escapeHtml(title)}</TITLE>`);
  out.push(`<H1>${escapeHtml(title)}</H1>`);
  out.push("<DL><p>");
  emitFolder(out, { ...root, name: title }, "    ");
  out.push("</DL><p>");
  return `${out.join("\n")}\n`;
}

/** Safe, readable filename for the downloaded file. */
export function bookmarksFilename(title: string): string {
  const base =
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "bookmarks";
  return `${base}.html`;
}

/** Trigger the download of the panel as a browser-importable bookmarks file. */
export function downloadPanelBookmarks(root: PanelFolder, title: string): void {
  const blob = new Blob([buildPanelBookmarksHtml(root, title)], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bookmarksFilename(title);
  a.click();
  URL.revokeObjectURL(url);
}
