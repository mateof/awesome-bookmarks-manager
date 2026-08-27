import { parseCsv } from "@awesome-bookmarks/shared";

/**
 * Reading other people's bookmark files.
 *
 * Every read-later and bookmarking app exports something, and no two agree on
 * what. Rather than one parser per app — which ages badly, because the app
 * you have never heard of is the one your user is leaving — this is three
 * readers (HTML, CSV, JSON) that are **liberal about shape** and a detector
 * whose only job is to put a name on the file so the UI can say what it
 * recognised.
 *
 * The rule throughout: never drop a link because a field was missing or a
 * column was called something else. A bookmark with a URL and nothing else is
 * still worth importing.
 */

/** A folder or a bookmark, in the order the file listed them. */
export interface ImportNode {
  type: "folder" | "bookmark";
  name?: string;
  url?: string;
  children?: ImportNode[];
  /** Bookmarks only, and all optional: most formats carry only some of these. */
  description?: string;
  tags?: string[];
  /** Epoch seconds. */
  createdAt?: number;
  favorite?: boolean;
  /** Read/archived in the source app, if it had such a state. */
  archived?: boolean;
  /** Explicitly flagged as still to read. */
  unread?: boolean;
}

export interface ParsedImport {
  /** The app the file looks like it came from, for the message shown back. */
  app: string;
  tree: ImportNode[];
}

/** A flat item, before it is folded into the folder tree. */
interface FlatItem {
  url: string;
  title: string;
  description?: string;
  tags: string[];
  /** Folder names from the top of the import down. */
  path: string[];
  createdAt?: number;
  favorite?: boolean;
  archived?: boolean;
  unread?: boolean;
}

// ---------------------------------------------------------------------------
// Netscape bookmark HTML (Chrome, Firefox, Edge, Safari, linkding, Shaarli,
// Shiori, LinkAce, Karakeep, and anything else that speaks the 1990s format)
// ---------------------------------------------------------------------------

/**
 * Netscape Bookmark File Format parser.
 *
 * The format is HTML-ish but with omitted closing tags (`<DT>`, `<P>`) and
 * a folder's children live in a `<DL>` *sibling* of the folder's `<DT>`,
 * not nested inside. Building a real DOM and walking it is brittle because
 * different parsers reconstruct the tree differently.
 *
 * Instead we scan the raw HTML for the meaningful tokens in order — `<DL>`,
 * `</DL>`, `<H3>...</H3>`, `<A HREF="...">...</A>`, `<DD>` — and track folder
 * nesting with a `<DL>` push/pop stack. This is the classical approach for
 * this format and is immune to weird whitespace and wrapper tags.
 *
 * The anchor's attributes carry more than the link: `TAGS` is how linkding,
 * Shaarli and Karakeep export tags, `ADD_DATE` is the epoch second it was
 * saved, and a `<DD>` line after the anchor is its description. Dropping them
 * — which this parser used to do — turns a tagged library into a pile of bare
 * links.
 */
export function parseNetscapeHtml(html: string): ImportNode[] {
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
  // The bookmark a following <DD> would describe.
  let lastBookmark: ImportNode | null = null;

  // The `<DD>` arm reads plain text up to the next tag rather than "anything
  // until the next <DT>". Written the second way, a file with a `<DD>` and no
  // following `<DT>` makes the engine rescan to the end of the file for every
  // match, which on a few megabytes takes seconds.
  const TOKEN =
    /(<dl\b[^>]*>)|(<\/dl\s*>)|<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*)>([\s\S]*?)<\/a>|<dd>([^<]*)/gi;
  const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
  const attr = (attrs: string, name: string): string | undefined => {
    const re = new RegExp(
      `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    );
    const m = re.exec(attrs);
    const raw = m?.[1] ?? m?.[2] ?? m?.[3];
    return raw === undefined ? undefined : decodeEntities(raw);
  };

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
      lastBookmark = null;
    } else if (m[2] !== undefined) {
      // </DL>
      const popped = dlPushed.pop() ?? false;
      if (popped && stack.length > 1) stack.pop();
      pendingFolder = null;
      lastBookmark = null;
    } else if (m[3] !== undefined) {
      // <H3>name</H3>
      const name = cleanText(m[3]) || "Sin nombre";
      const folder: ImportNode = { type: "folder", name, children: [] };
      const top = stack[stack.length - 1];
      if (top) top.push(folder);
      pendingFolder = folder;
      lastBookmark = null;
    } else if (m[4] !== undefined) {
      // <A ...attrs...>text</A>
      const attrs = m[4];
      const hrefMatch = HREF_RE.exec(attrs);
      const url = decodeEntities(
        (hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim(),
      );
      const text = cleanText(m[5] ?? "") || url;
      if (url) {
        const node: ImportNode = { type: "bookmark", name: text, url };
        const tags = splitTags(attr(attrs, "tags"));
        if (tags.length > 0) node.tags = tags;
        const added = Number(attr(attrs, "add_date"));
        if (Number.isFinite(added) && added > 0) node.createdAt = normalizeEpoch(added);
        // linkding writes both; Shaarli only the first.
        if (truthy(attr(attrs, "toread"))) node.unread = true;
        const top = stack[stack.length - 1];
        if (top) top.push(node);
        lastBookmark = node;
      }
    } else if (m[6] !== undefined && lastBookmark) {
      // <DD>description
      const text = cleanText(m[6]);
      if (text) lastBookmark.description = text;
    }
  }

  return root;
}

// ---------------------------------------------------------------------------
// CSV (Pocket, Raindrop, Instapaper, Readwise Reader, Diigo, and the rest)
// ---------------------------------------------------------------------------

/**
 * Columns are matched by name, not by position.
 *
 * Every one of these exports is "a table of links" with the columns named
 * slightly differently, so recognising names covers the apps listed above and
 * also the next one, which will call its URL column `link` or `address` and
 * otherwise be identical.
 */
const CSV_FIELDS = {
  url: ["url", "link", "href", "address", "uri", "urls"],
  title: ["title", "name", "document title", "article title"],
  tags: ["tags", "labels", "document tags", "keywords", "tag"],
  folder: ["folder", "collection", "folders", "category", "list", "collections"],
  note: ["note", "notes", "excerpt", "description", "comment", "comments", "summary", "selection"],
  created: [
    "created",
    "created_at",
    "createdat",
    "time_added",
    "timestamp",
    "saved date",
    "saved_at",
    "savedat",
    "date",
    "date_added",
    "added",
    "published date",
    "creation date",
    "creation_date",
  ],
  favorite: ["favorite", "favourite", "starred", "is_starred", "star"],
  status: ["status", "state", "is_archived", "archived", "read"],
} as const;

function headerIndex(header: string[]): Record<keyof typeof CSV_FIELDS, number> {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/^﻿/, ""));
  const out = {} as Record<keyof typeof CSV_FIELDS, number>;
  for (const key of Object.keys(CSV_FIELDS) as (keyof typeof CSV_FIELDS)[]) {
    out[key] = norm.findIndex((h) => (CSV_FIELDS[key] as readonly string[]).includes(h));
  }
  return out;
}

/** Which app a set of headers looks like, for the message, not for the parsing. */
function csvApp(header: string[]): string {
  const set = new Set(header.map((h) => h.trim().toLowerCase()));
  if (set.has("mime type") && set.has("creation date")) return "wallabag";
  if (set.has("time_added") && set.has("status")) return "Pocket";
  if (set.has("excerpt") && set.has("folder")) return "Raindrop.io";
  if (set.has("selection") && set.has("timestamp")) return "Instapaper";
  if (set.has("document tags") || set.has("reading progress")) return "Readwise Reader";
  if (set.has("annotations") && set.has("comments")) return "Diigo";
  return "CSV";
}

export function parseCsvExport(text: string): { app: string; items: FlatItem[] } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) return { app: "CSV", items: [] };
  const header = rows[0] ?? [];
  const idx = headerIndex(header);
  const app = csvApp(header);
  // A file whose first line is already a link has no header at all. Rare, but
  // the alternative is silently eating somebody's first bookmark.
  const hasHeader = idx.url >= 0 || header.some((h) => /^(url|link|href)$/i.test(h.trim()));
  const body = hasHeader ? rows.slice(1) : rows;
  const urlAt = idx.url >= 0 ? idx.url : header.findIndex((c) => /^https?:\/\//i.test(c));

  const items: FlatItem[] = [];
  for (const row of body) {
    const cell = (at: number) => (at >= 0 ? (row[at] ?? "").trim() : "");
    const url = cell(urlAt) || row.find((c) => /^https?:\/\//i.test(c.trim()))?.trim() || "";
    if (!isHttpUrl(url)) continue;
    const status = cell(idx.status).toLowerCase();
    items.push({
      url,
      title: cell(idx.title) || url,
      description: cell(idx.note) || undefined,
      tags: splitTags(cell(idx.tags)),
      path: splitFolderPath(cell(idx.folder)),
      createdAt: parseWhen(cell(idx.created)),
      favorite: truthy(cell(idx.favorite)) || undefined,
      archived:
        status === "archive" || status === "archived" || truthy(status) || undefined,
      unread: status === "unread" || undefined,
    });
  }
  return { app, items };
}

// ---------------------------------------------------------------------------
// JSON (wallabag, Pinboard, Karakeep, Omnivore, and generic exports)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

/** Tags come as an array of strings, an array of objects, or one string. */
function jsonTags(v: unknown, separator: "auto" | "space" = "auto"): string[] {
  if (Array.isArray(v)) {
    return v
      .map((t) => {
        if (typeof t === "string") return t;
        if (t && typeof t === "object") {
          const o = t as Json;
          return str(o.label ?? o.name ?? o.title ?? o.slug);
        }
        return "";
      })
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (typeof v === "string") {
    return separator === "space"
      ? v.split(/\s+/).map((t) => t.trim()).filter(Boolean)
      : splitTags(v);
  }
  return [];
}

export function parseJsonExport(text: string): { app: string; items: FlatItem[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { app: "JSON", items: [] };
  }

  // Karakeep: one object with `bookmarks`, and `lists` that give them folders.
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Json;
    if (Array.isArray(obj.bookmarks)) return karakeep(obj);
    // A wrapper around the real array: wallabag's API pages, and several
    // exports that put everything under one key.
    const inner =
      (obj._embedded as Json | undefined)?.items ??
      obj.items ??
      obj.entries ??
      obj.data ??
      obj.articles;
    if (Array.isArray(inner)) data = inner;
  }

  if (!Array.isArray(data)) return { app: "JSON", items: [] };
  const rows = data.filter((r): r is Json => !!r && typeof r === "object");
  const first = rows[0] ?? {};

  if ("href" in first) return pinboard(rows);
  if ("is_archived" in first || "is_starred" in first) return wallabag(rows);
  if ("slug" in first && "labels" in first) return omnivore(rows);
  return generic(rows);
}

function pinboard(rows: Json[]): { app: string; items: FlatItem[] } {
  return {
    app: "Pinboard",
    items: rows.flatMap((r) => {
      const url = str(r.href).trim();
      if (!isHttpUrl(url)) return [];
      return [
        {
          url,
          // Pinboard's `description` is the title and its `extended` is the
          // note, which is the opposite of what both words suggest.
          title: str(r.description).trim() || url,
          description: str(r.extended).trim() || undefined,
          tags: jsonTags(r.tags, "space"),
          path: [],
          createdAt: parseWhen(str(r.time)),
          unread: truthy(str(r.toread)) || undefined,
        },
      ];
    }),
  };
}

function wallabag(rows: Json[]): { app: string; items: FlatItem[] } {
  return {
    app: "wallabag",
    items: rows.flatMap((r) => {
      const url = (str(r.url) || str(r.given_url) || str(r.origin_url)).trim();
      if (!isHttpUrl(url)) return [];
      return [
        {
          url,
          title: str(r.title).trim() || url,
          // The saved article body is in `content`, sometimes megabytes of it.
          // What goes in the description is the summary if there is one, never
          // the article: importing wallabag should not paste whole web pages
          // into every note.
          description: firstText(r.excerpt, r.description, r.summary),
          tags: jsonTags(r.tags),
          path: [],
          createdAt: parseWhen(str(r.created_at)),
          favorite: truthy(r.is_starred) || undefined,
          archived: truthy(r.is_archived) || undefined,
        },
      ];
    }),
  };
}

function omnivore(rows: Json[]): { app: string; items: FlatItem[] } {
  return {
    app: "Omnivore",
    items: rows.flatMap((r) => {
      const url = str(r.url).trim();
      if (!isHttpUrl(url)) return [];
      const state = str(r.state).toLowerCase();
      return [
        {
          url,
          title: str(r.title).trim() || url,
          description: firstText(r.description),
          tags: jsonTags(r.labels),
          path: [],
          createdAt: parseWhen(str(r.savedAt) || str(r.updatedAt)),
          archived: state === "archived" || undefined,
        },
      ];
    }),
  };
}

/**
 * Karakeep, which is the one format here with a folder tree of its own.
 *
 * Its `lists` are nested through `parentId`, and each bookmark names the lists
 * it belongs to. A bookmark in two lists has to go somewhere, so it goes in
 * the first one and the rest are kept as tags — the alternative is importing
 * the same link several times.
 */
function karakeep(obj: Json): { app: string; items: FlatItem[] } {
  const lists = (Array.isArray(obj.lists) ? obj.lists : []).filter(
    (l): l is Json => !!l && typeof l === "object",
  );
  const byId = new Map(lists.map((l) => [str(l.id), l]));
  const pathOf = (id: string): string[] => {
    const out: string[] = [];
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(str(cur.id))) {
      seen.add(str(cur.id));
      const name = str(cur.name).trim();
      if (name) out.unshift(name);
      const parent = str(cur.parentId);
      cur = parent ? byId.get(parent) : undefined;
    }
    return out;
  };

  const rows = (obj.bookmarks as unknown[]).filter(
    (b): b is Json => !!b && typeof b === "object",
  );
  return {
    app: "Karakeep",
    items: rows.flatMap((r) => {
      const content = (r.content ?? {}) as Json;
      const url = (str(content.url) || str(r.url)).trim();
      if (!isHttpUrl(url)) return [];
      const listIds = Array.isArray(r.lists)
        ? r.lists.map((l) => (typeof l === "string" ? l : str((l as Json).id)))
        : [];
      const path = listIds.length > 0 ? pathOf(listIds[0] ?? "") : [];
      const extraLists = listIds
        .slice(1)
        .map((id) => pathOf(id).at(-1) ?? "")
        .filter(Boolean);
      return [
        {
          url,
          title: (str(r.title) || str(content.title)).trim() || url,
          description: firstText(r.note, content.description),
          tags: [...jsonTags(r.tags), ...extraLists],
          path,
          createdAt: parseWhen(str(r.createdAt)),
          favorite: truthy(r.favourited ?? r.favorited) || undefined,
          archived: truthy(r.archived) || undefined,
        },
      ];
    }),
  };
}

/** Anything else shaped like a list of links. */
function generic(rows: Json[]): { app: string; items: FlatItem[] } {
  const pick = (r: Json, names: readonly string[]): string => {
    for (const n of names) {
      const hit = Object.keys(r).find((k) => k.toLowerCase() === n);
      if (hit !== undefined) {
        const v = str(r[hit]).trim();
        if (v) return v;
      }
    }
    return "";
  };
  return {
    app: "JSON",
    items: rows.flatMap((r) => {
      const url = pick(r, CSV_FIELDS.url);
      if (!isHttpUrl(url)) return [];
      const tagsKey = Object.keys(r).find((k) =>
        (CSV_FIELDS.tags as readonly string[]).includes(k.toLowerCase()),
      );
      return [
        {
          url,
          title: pick(r, CSV_FIELDS.title) || url,
          description: pick(r, CSV_FIELDS.note) || undefined,
          tags: tagsKey ? jsonTags(r[tagsKey]) : [],
          path: splitFolderPath(pick(r, CSV_FIELDS.folder)),
          createdAt: parseWhen(pick(r, CSV_FIELDS.created)),
          favorite: truthy(pick(r, CSV_FIELDS.favorite)) || undefined,
        },
      ];
    }),
  };
}

// ---------------------------------------------------------------------------
// Detection and normalisation
// ---------------------------------------------------------------------------

/**
 * What the file is, decided by its content and not by its extension.
 *
 * **Order matters, and getting it wrong is silent.** The HTML test is a sniff
 * — "does this look like it has links in it" — and half of these exports carry
 * a saved copy of every article, HTML and all, inside a JSON string or a CSV
 * cell. A wallabag export whose first article contains an `<a href=` was read
 * as a bookmarks page and yielded nothing at all.
 *
 * So the two formats that can be recognised by *structure* go first, and each
 * only claims the file if it really parses. The HTML sniff, which cannot fail,
 * goes last of the three.
 */
export function detectAndParse(bytes: Buffer): ParsedImport {
  const text = bytes.toString("utf8");
  const head = text.slice(0, 4096).trimStart();

  if (head.startsWith("{") || head.startsWith("[")) {
    const { app, items } = parseJsonExport(text);
    // Only JSON that yielded something counts; a `[` that turns out not to
    // parse falls through to the other readers rather than importing nothing.
    if (items.length > 0) return { app, tree: itemsToTree(items) };
  }

  if (/^<!DOCTYPE\s+NETSCAPE-Bookmark/i.test(head)) {
    return { app: netscapeApp(head), tree: parseNetscapeHtml(text) };
  }

  // A CSV is decided by its header line, not by looking for commas: the header
  // is on the first line, before any cell has had a chance to contain a whole
  // web page.
  const csv = parseCsvExport(text);
  if (csv.items.length > 0) return { app: csv.app, tree: itemsToTree(csv.items) };

  if (/<dl\b|<a\s[^>]*href=/i.test(head)) {
    return { app: netscapeApp(head), tree: parseNetscapeHtml(text) };
  }
  return { app: csv.app, tree: [] };
}

/** Is this a zip? Pocket and Omnivore both hand out one. */
export function looksLikeZip(bytes: Buffer): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * One import out of the several files a zip holds.
 *
 * Pocket splits its export into `part_000000.csv`, `part_000001.csv`… of ten
 * thousand saves each, and Omnivore into `metadata_*.json` of twenty. Making
 * somebody unzip and import each one by hand, in order, is not an import.
 */
export function mergeParsed(parts: ParsedImport[]): ParsedImport {
  const named = parts.find((p) => p.tree.length > 0 && !GENERIC.has(p.app));
  const app = named?.app ?? parts.find((p) => p.tree.length > 0)?.app ?? "HTML";
  return { app, tree: parts.flatMap((p) => p.tree) };
}

const GENERIC = new Set(["HTML", "CSV", "JSON"]);

/** The HTML exports all look alike; the header comment is the only tell. */
function netscapeApp(head: string): string {
  if (/linkding/i.test(head)) return "linkding";
  if (/shaarli/i.test(head)) return "Shaarli";
  if (/shiori/i.test(head)) return "Shiori";
  if (/pocket/i.test(head) || /ril_export/i.test(head)) return "Pocket";
  return "HTML";
}

/**
 * Flat items into the folder tree, creating each folder the first time a path
 * mentions it. Order is the file's order, which for an export is usually the
 * order the user saw in the app.
 */
export function itemsToTree(items: FlatItem[]): ImportNode[] {
  const root: ImportNode[] = [];
  const folders = new Map<string, ImportNode>();

  const folderFor = (path: string[]): ImportNode[] => {
    let level = root;
    let key = "";
    for (const name of path) {
      key = key ? `${key} ${name}` : name;
      let node = folders.get(key);
      if (!node) {
        node = { type: "folder", name, children: [] };
        folders.set(key, node);
        level.push(node);
      }
      level = node.children ?? (node.children = []);
    }
    return level;
  };

  for (const item of items) {
    folderFor(item.path).push({
      type: "bookmark",
      name: item.title,
      url: item.url,
      description: item.description,
      tags: item.tags.length > 0 ? item.tags : undefined,
      createdAt: item.createdAt,
      favorite: item.favorite,
      archived: item.archived,
      unread: item.unread,
    });
  }
  return root;
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/**
 * A location, not a script.
 *
 * The CSV and JSON readers only take `http`, `https` and `ftp`, because these
 * are exports from read-later apps and every row in them is a web page. It
 * also means a file somebody sends you cannot smuggle in a `javascript:` URL
 * that later gets rendered as a link and clicked.
 *
 * The HTML reader deliberately does **not** apply this: a browser's own export
 * legitimately contains bookmarklets, and dropping them would be losing the
 * user's own data on the way in.
 */
function isHttpUrl(s: string): boolean {
  return /^(https?|ftps?):\/\/\S+$/i.test(s.trim());
}

/**
 * Tags in one string, with a separator that depends on who wrote it: Pocket
 * uses `|`, most CSVs use `,`, Pinboard uses spaces (handled at the call
 * site, since a space is also what multi-word tags are made of).
 */
export function splitTags(raw: string | undefined): string[] {
  if (!raw) return [];
  const sep = raw.includes("|") ? "|" : ",";
  return raw
    .split(sep)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 128);
}

/** Raindrop writes a collection path as `Padre/Hija`. */
function splitFolderPath(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[/>]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function firstText(...values: unknown[]): string | undefined {
  for (const v of values) {
    const s = str(v).trim();
    if (s) return s.slice(0, 4000);
  }
  return undefined;
}

function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  const s = str(v).trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "archive" || s === "archived";
}

/** Seconds, milliseconds, an ISO date, or `31/12/2024`: all four turn up. */
function parseWhen(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return normalizeEpoch(Number(s));

  /**
   * Day first, before `Date.parse` gets a say.
   *
   * wallabag's CSV writes `d/m/Y h:i:s`. Left to `Date.parse`, `05/04/2024` is
   * read as the American 4 May and `27/08/2024` is not a date at all, so the
   * whole column would be lost or wrong. When both numbers are 12 or less the
   * two readings are genuinely indistinguishable and this takes the European
   * one, which is what the apps that use slashes here write.
   *
   * The hour is taken as written. wallabag formats it with PHP's `h`, which is
   * 12-hour and carries no am/pm, so half of them are unrecoverable by
   * anybody; the day, which is what a date on a bookmark is for, survives.
   */
  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (slash) {
    const [, a, b, y, hh, mm, ss] = slash;
    const first = Number(a);
    const second = Number(b);
    const dayFirst = first > 12 || second <= 12;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    const ms = Date.UTC(
      Number(y),
      month - 1,
      day,
      Number(hh ?? 0),
      Number(mm ?? 0),
      Number(ss ?? 0),
    );
    return Number.isFinite(ms) ? normalizeEpoch(Math.floor(ms / 1000)) : undefined;
  }

  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  return undefined;
}

/**
 * Milliseconds are told from seconds by size: anything past the year 33658 in
 * seconds is milliseconds, and no bookmark is from the year 33658.
 */
function normalizeEpoch(n: number): number | undefined {
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const secs = n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  // Before 1990 or more than a year ahead: a placeholder, not a date.
  const now = Math.floor(Date.now() / 1000);
  if (secs < 631_152_000 || secs > now + 31_536_000) return undefined;
  return secs;
}

function cleanText(raw: string): string {
  const noTags = raw.replace(/<[^>]*>/g, "");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => safeFromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => safeFromCodePoint(parseInt(n, 16)))
    // Last, or `&amp;lt;` would decode twice and turn into a real `<`.
    .replace(/&amp;/g, "&");
}

function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/** Diagnostic counts — useful when investigating parse misses. */
export function countNodes(nodes: ImportNode[]): {
  folders: number;
  bookmarks: number;
} {
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
