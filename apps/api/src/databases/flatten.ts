import { applyView, type CellValue, type DbColumn } from "@awesome-bookmarks/shared";
import type { AuthedContext } from "../auth/session.js";
import { getDatabase } from "./service.js";

/**
 * Replace embedded database blocks with a static table of their current rows.
 *
 * A published panel and a group share are **materialised copies**: the reader
 * has no session of the owner's, so they cannot call the database API, and the
 * live component would render an empty box. Flattening at build time gives
 * them the content that was there when the copy was made, which is exactly the
 * contract every other part of those payloads already has.
 *
 * The first view's filters and sorting are applied, so a shared copy shows
 * what the owner's default view shows rather than the raw insertion order.
 * Hidden columns stay hidden: a column the owner chose not to display is not
 * something to reveal to a wider audience than the original.
 */

const BLOCK_RE =
  /<div\b[^>]*data-db-id="([0-9a-fA-F-]{36})"[^>]*>[\s\S]*?<\/div>/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCell(column: DbColumn, value: CellValue | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  switch (column.kind) {
    case "checkbox":
      return value ? "✓" : "";
    case "select": {
      const o = column.config.options.find((x) => x.id === value);
      return o ? escapeHtml(o.name) : "";
    }
    case "multiSelect": {
      const ids = Array.isArray(value) ? value : [];
      return ids
        .map((id) => column.config.options.find((x) => x.id === id)?.name)
        .filter((n): n is string => !!n)
        .map(escapeHtml)
        .join(", ");
    }
    case "url": {
      const url = String(value);
      // Only http(s) becomes a link. A javascript: URL in a cell must not turn
      // into a clickable one on a public page.
      if (!/^https?:\/\//i.test(url)) return escapeHtml(url);
      const safe = escapeHtml(url);
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
    }
    case "ref":
      // The reference points at something only the owner can open, so the copy
      // shows nothing rather than a link that 404s for the reader.
      return "";
    default:
      return escapeHtml(String(value));
  }
}

/**
 * `html` in, `html` out, with every database block turned into a table. Rich
 * text with no blocks comes back untouched.
 */
export function flattenDatabases(
  ctx: AuthedContext,
  html: string | null | undefined,
): string | null {
  if (!html) return html ?? null;
  if (!html.includes("data-db-id")) return html;

  return html.replace(BLOCK_RE, (_match, id: string) => {
    let db;
    try {
      db = getDatabase(ctx, id);
    } catch {
      // Deleted since the note was written. Drop the block rather than leave
      // an empty frame in somebody else's copy.
      return "";
    }
    const view = db.views[0];
    const config = view?.config;
    const columns = db.columns.filter(
      (c) => !config?.hiddenColumnIds.includes(c.id),
    );
    const rows = config ? applyView(db.rows, db.columns, config) : db.rows;

    const head = columns
      .map((c) => `<th>${escapeHtml(c.name)}</th>`)
      .join("");
    const body = rows
      .map(
        (r) =>
          `<tr>${columns
            .map((c) => `<td>${renderCell(c, r.cells[c.id])}</td>`)
            .join("")}</tr>`,
      )
      .join("");

    return (
      `<table><caption>${escapeHtml(db.name)}</caption>` +
      `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    );
  });
}
