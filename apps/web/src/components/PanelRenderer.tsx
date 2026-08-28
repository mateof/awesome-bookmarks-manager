import {
  PANEL_LAYOUT_DEFAULTS,
  TREE_LAYOUTS,
  type PanelBgKind,
  type PanelBookmark,
  type PanelFolder,
  type TemplateConfig,
} from "@awesome-bookmarks/shared";
import DOMPurify from "dompurify";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CornerDownLeft,
  ExternalLink,
  Filter,
  Folder as FolderIcon,
  Home,
  Info,
  Download,
  Maximize2,
  Minimize2,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type { PanelScheme } from "../lib/panelScheme.js";
import { PanelSchemeToggle } from "./PanelSchemeToggle.js";
import { fuzzyScoreAny } from "../fuzzy.js";
import { foldText } from "../lib/emojiCatalog.js";
import { bindInteractiveMarks } from "../lib/interactiveMarks.js";
import { sanitizeNote } from "../lib/purify.js";
import {
  bindCodeCopy,
  renderCode,
  renderDiagrams,
  renderMath,
  wrapTables,
} from "../lib/richRender.js";
import { opaqueSurface } from "../lib/contrast.js";
import { useBackdropDismiss } from "../lib/overlay.js";
import {
  COPYABLE_ATTR,
  HIGHLIGHT_ATTR,
  SPOILER_ATTR,
  UNDERLINE_ATTR,
} from "../lib/richMarks.js";
import { downloadPanelBookmarks } from "../lib/panelExport.js";
import { PanelBackground } from "./PanelBackground.js";
import { ReadFindBar } from "./ReadFindBar.js";
import {
  InfoButton,
  stripHtml,
  type PanelDesc,
} from "./PanelDescription.js";
import { Favicon } from "./PanelFavicon.js";
import {
  MindmapLayout,
  OrbitLayout,
  TreeLayout,
} from "./PanelTreeLayouts.js";

/**
 * Renders a panel (a folder subtree) in the shape defined by the template.
 * Navigation (current folder) and the tag filter live in the URL query
 * (`?p=`, `?tags=`, `?m=`) so a shared link restores the exact view. The tag
 * filter is scoped to the current folder and its subfolders.
 */
export function PanelRenderer({
  root,
  template,
  displayTitle,
  bgAssetUrl,
  bgAssetKind,
  scheme,
}: {
  root: PanelFolder;
  template: TemplateConfig;
  /** Overrides the panel's root heading (falls back to the folder name). */
  displayTitle?: string | null;
  /** Custom uploaded background; takes precedence over the template scene. */
  bgAssetUrl?: string | null;
  bgAssetKind?: PanelBgKind | null;
  /**
   * Lets the reader pick light, dark or the panel's own colours. Omitted where
   * a panel is shown as a preview of something being edited, since a reading
   * preference has nothing to say about how the thing is being designed.
   */
  scheme?: { value: PanelScheme; onChange: (next: PanelScheme) => void };
}) {
  const [sp, setSp] = useSearchParams();
  const [desc, setDesc] = useState<PanelDesc | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const path = useMemo(
    () => (sp.get("p") ?? "").split("/").filter(Boolean),
    [sp],
  );
  const selected = useMemo(
    () => new Set((sp.get("tags") ?? "").split(",").filter(Boolean)),
    [sp],
  );
  const matchAll = sp.get("m") === "all";
  const t = template.theme;

  const current = useMemo(() => folderAt(root, path), [root, path]);
  // Tags + filtering are scoped to the current folder's subtree.
  const allTags = useMemo(() => collectTags(current), [current]);
  const filtering = selected.size > 0;
  const filtered = useMemo(
    () =>
      filtering ? flatten(current).filter((b) => matches(b, selected, matchAll)) : [],
    [current, selected, matchAll, filtering],
  );

  const setPath = (next: string[]) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (next.length) n.set("p", next.join("/"));
        else n.delete("p");
        // Changing folders resets the tag filter scope.
        n.delete("tags");
        return n;
      },
      { replace: false },
    );

  const toggleTag = (name: string) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        const cur = new Set((prev.get("tags") ?? "").split(",").filter(Boolean));
        if (cur.has(name)) cur.delete(name);
        else cur.add(name);
        if (cur.size) n.set("tags", [...cur].join(","));
        else n.delete("tags");
        return n;
      },
      { replace: true },
    );

  const setMatchAll = () =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (prev.get("m") === "all") n.delete("m");
        else n.set("m", "all");
        return n;
      },
      { replace: true },
    );

  const clearTags = () =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("tags");
        return n;
      },
      { replace: true },
    );

  const showFilterBar = template.tagFilter !== false && allTags.size > 0;

  // Cmd/Ctrl+K opens the panel search, matching the app's shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rootTitle = displayTitle?.trim() || root.name;
  const isTreeLayout = (TREE_LAYOUTS as readonly string[]).includes(template.layout);

  // Built up front so the template can swap their order.
  const foldersSection =
    current.subfolders.length > 0 ? (
      <Section key="folders" title="Carpetas" template={template}>
        <div style={gridStyle(template, "folders")}>
          {current.subfolders.map((f) =>
            template.folderPreview ? (
              <FolderPreviewCard
                key={f.id}
                folder={f}
                template={template}
                onDesc={setDesc}
                onOpen={() => setPath([...path, f.id])}
                onOpenChild={(childId) => setPath([...path, f.id, childId])}
              />
            ) : (
              <FolderCard key={f.id} folder={f} template={template} onDesc={setDesc} onOpen={() => setPath([...path, f.id])} />
            ),
          )}
        </div>
      </Section>
    ) : null;
  const linksSection =
    current.bookmarks.length > 0 ? (
      <Section key="links" title="Enlaces" template={template}>
        <BookmarksView bookmarks={current.bookmarks} template={template} selected={selected} onTagClick={toggleTag} onDesc={setDesc} />
      </Section>
    ) : null;

  return (
    <div
      style={{
        position: "relative",
        background: t.bg,
        color: t.text,
        fontFamily: template.font,
        minHeight: "100vh",
      }}
    >
      {bgAssetUrl ? (
        <AssetBackground url={bgAssetUrl} kind={bgAssetKind} />
      ) : (
        <PanelBackground scene={template.scene} />
      )}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: template.maxWidth ?? PANEL_LAYOUT_DEFAULTS.maxWidth,
          margin: "0 auto",
          padding: "2rem 1.25rem 4rem",
        }}
      >
        {scheme && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "0.75rem",
            }}
          >
            <PanelSchemeToggle
              value={scheme.value}
              onChange={scheme.onChange}
              theme={t}
            />
          </div>
        )}

        {template.header !== "hidden" && (
          <Header
            title={filtering ? "Resultados" : path.length === 0 ? rootTitle : current.name}
            template={template}
            banner={template.header === "banner"}
          />
        )}

        {template.showSearch !== false && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "0.6rem 0.9rem",
            marginBottom: "1rem",
            borderRadius: "0.75rem",
            background: t.surface,
            border: `1px solid ${t.border}`,
            color: t.muted,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
          }}
        >
          <Search size={16} /> Buscar en el panel…
          <kbd
            style={{
              marginLeft: "auto",
              border: `1px solid ${t.border}`,
              borderRadius: 4,
              padding: "0 5px",
              fontSize: 11,
            }}
          >
            ⌘K
          </kbd>
        </button>
        )}

        {template.showDownload !== false && (
          <button
            type="button"
            onClick={() => downloadPanelBookmarks(root, rootTitle)}
            title="Descarga un fichero que puedes importar en los marcadores del navegador"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "0.35rem 0.7rem",
              marginBottom: "1rem",
              borderRadius: "0.6rem",
              background: "transparent",
              border: `1px solid ${t.border}`,
              color: t.muted,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
            }}
          >
            <Download size={14} /> Descargar marcadores
          </button>
        )}

        {template.showBreadcrumb !== false && !isTreeLayout && (
          <Breadcrumb
            root={root}
            path={path}
            template={template}
            onGo={(i) => setPath(path.slice(0, i))}
          />
        )}

        {showFilterBar && (
          <TagFilterBar
            allTags={allTags}
            selected={selected}
            matchAll={matchAll}
            template={template}
            onToggle={toggleTag}
            onMatchAll={setMatchAll}
            onClear={clearTags}
          />
        )}

        {filtering ? (
          <Section title={`${filtered.length} enlace(s)`} template={template}>
            <BookmarksView bookmarks={filtered} template={template} selected={selected} onTagClick={toggleTag} onDesc={setDesc} />
          </Section>
        ) : isTreeLayout ? (
          // These draw the hierarchy themselves, from the root rather than
          // from `current`: their whole point is that you never leave the page
          // to see what is inside a folder.
          template.layout === "tree" ? (
            <TreeLayout root={root} template={template} onDesc={setDesc} />
          ) : template.layout === "mindmap" ? (
            <MindmapLayout root={root} template={template} onDesc={setDesc} />
          ) : (
            <OrbitLayout root={root} template={template} onDesc={setDesc} />
          )
        ) : (
          <>
            {(template.sectionOrder ?? PANEL_LAYOUT_DEFAULTS.sectionOrder) === "links"
              ? [linksSection, foldersSection]
              : [foldersSection, linksSection]}
            {current.subfolders.length === 0 && current.bookmarks.length === 0 && (
              <p style={{ color: t.muted, marginTop: "2rem" }}>Sin enlaces.</p>
            )}
          </>
        )}
      </div>

      {desc && (
        <DescriptionModal desc={desc} template={template} onClose={() => setDesc(null)} />
      )}
      {searchOpen && (
        <PanelSearch
          root={root}
          template={template}
          onClose={() => setSearchOpen(false)}
          onOpenFolder={(next) => setPath(next)}
        />
      )}
    </div>
  );
}

function PanelSearch({
  root,
  template,
  onClose,
  onOpenFolder,
}: {
  root: PanelFolder;
  template: TemplateConfig;
  onClose: () => void;
  /** Navigate to a folder by its path of ids (as used by `?p=`). */
  onOpenFolder: (path: string[]) => void;
}) {
  const t = template.theme;
  const all = useMemo(() => flatten(root), [root]);
  const allFolders = useMemo(() => flattenFolders(root), [root]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const backdrop = useBackdropDismiss(onClose);

  const activate = (hit: SearchHit) => {
    if (hit.kind === "folder") onOpenFolder(hit.path);
    else window.open(hit.b.url, "_blank", "noopener,noreferrer");
    onClose();
  };

  const results = useMemo<SearchHit[]>(() => {
    const query = q.trim();
    if (!query) {
      return [
        ...allFolders.slice(0, 8).map((f) => ({ kind: "folder" as const, ...f })),
        ...all.slice(0, 30).map((b) => ({ kind: "bookmark" as const, b })),
      ];
    }
    const scored: Array<{ hit: SearchHit; s: number }> = [];
    for (const f of allFolders) {
      const s = fuzzyScoreAny(query, f.folder.name);
      if (s !== null) scored.push({ hit: { kind: "folder", ...f }, s });
    }
    for (const b of all) {
      const s = fuzzyScoreAny(
        query,
        b.title,
        b.url,
        b.description ? stripHtml(b.description) : "",
      );
      if (s !== null) scored.push({ hit: { kind: "bookmark", b }, s });
    }
    // Folders win ties so that "open the folder" beats "open one link in it".
    scored.sort((a, b) => a.s - b.s || (a.hit.kind === "folder" ? -1 : 1));
    return scored.slice(0, 40).map((x) => x.hit);
  }, [q, all]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        const r = results[sel];
        if (r) activate(r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results, sel]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return (
    <div
      {...backdrop}
      className="fixed inset-0 z-50 flex items-start justify-center p-3 backdrop-blur-sm motion-safe:animate-[spotFade_.12s_ease-out] sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[8vh] w-full max-w-xl overflow-hidden motion-safe:animate-[spotPop_.14s_ease-out] sm:rounded-2xl"
        style={{
          background: opaqueSurface(t.surface, t.bg, t.text),
          color: t.text,
          border: `1px solid ${t.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 1rem", borderBottom: `1px solid ${t.border}` }}>
          <Search size={18} style={{ color: t.muted, flexShrink: 0 }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en el panel…"
            style={{ width: "100%", background: "transparent", color: t.text, border: "none", outline: "none", padding: "0.9rem 0", fontSize: 16, fontFamily: "inherit" }}
          />
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.muted, display: "inline-flex" }}>
            <X size={18} />
          </button>
        </div>
        <div ref={listRef} className="overscroll-contain" style={{ maxHeight: "60vh", overflowY: "auto", padding: 8 }}>
          {results.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: t.muted, fontSize: 14 }}>Sin resultados.</div>
          ) : (
            results.map((hit, i) => (
              <button
                key={hit.kind === "folder" ? `f:${hit.folder.id}` : `b:${hit.b.id}`}
                data-idx={i}
                onMouseMove={() => setSel(i)}
                onClick={() => activate(hit)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "0.55rem 0.7rem",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: t.text,
                  background: i === sel ? `${t.accent}22` : "transparent",
                }}
              >
                {hit.kind === "folder" ? (
                  <FolderIcon size={20} style={{ color: t.accent, flexShrink: 0 }} />
                ) : (
                  <Favicon url={hit.b.url} title={hit.b.title} accent={t.accent} size={20} />
                )}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {hit.kind === "folder" ? hit.folder.name : hit.b.title}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {hit.kind === "folder" ? hit.where : hit.b.url}
                  </span>
                </span>
                {i === sel && <CornerDownLeft size={14} style={{ color: t.muted, flexShrink: 0 }} />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Data helpers                                                     */
/* ---------------------------------------------------------------- */

function folderAt(root: PanelFolder, path: string[]): PanelFolder {
  let cur = root;
  for (const id of path) {
    const next = cur.subfolders.find((f) => f.id === id);
    if (!next) break;
    cur = next;
  }
  return cur;
}

/** A search hit: either a bookmark or a folder with the path that opens it. */
type SearchHit =
  | { kind: "bookmark"; b: PanelBookmark }
  | { kind: "folder"; folder: PanelFolder; path: string[]; where: string };

/** Every descendant folder with the `?p=` path that navigates to it. */
function flattenFolders(
  root: PanelFolder,
): { folder: PanelFolder; path: string[]; where: string }[] {
  const out: { folder: PanelFolder; path: string[]; where: string }[] = [];
  const walk = (f: PanelFolder, path: string[], trail: string[]) => {
    for (const sub of f.subfolders) {
      const p = [...path, sub.id];
      out.push({ folder: sub, path: p, where: trail.join(" / ") || root.name });
      walk(sub, p, [...trail, sub.name]);
    }
  };
  walk(root, [], []);
  return out;
}

function flatten(folder: PanelFolder): PanelBookmark[] {
  return [...folder.bookmarks, ...folder.subfolders.flatMap(flatten)];
}

function collectTags(folder: PanelFolder): Map<string, { color: string; count: number }> {
  const map = new Map<string, { color: string; count: number }>();
  for (const b of flatten(folder)) {
    for (const tag of b.tags) {
      const cur = map.get(tag.name);
      if (cur) cur.count += 1;
      else map.set(tag.name, { color: tag.color, count: 1 });
    }
  }
  return map;
}

function matches(b: PanelBookmark, selected: Set<string>, matchAll: boolean): boolean {
  const names = new Set(b.tags.map((t) => t.name));
  return matchAll ? [...selected].every((s) => names.has(s)) : [...selected].some((s) => names.has(s));
}

function gridStyle(template: TemplateConfig, kind: "folders" | "bookmarks"): React.CSSProperties {
  if (template.layout === "bento") {
    // `min(100%, …)` collapses to a single full-width column on narrow
    // screens; no forced row height so cards hug their content (no giant
    // empty boxes on mobile). The column spans still add visual variety.
    return {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))",
      gridAutoFlow: "dense",
      gap: template.gap ?? PANEL_LAYOUT_DEFAULTS.gap,
    };
  }
  const cols = kind === "folders" ? Math.min(template.columns ?? 4, 6) : template.columns ?? 4;
  const base = Math.floor(1040 / cols);
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${base}px), 1fr))`,
    gap: template.gap ?? PANEL_LAYOUT_DEFAULTS.gap,
  };
}

function BookmarksView({
  bookmarks,
  template,
  selected,
  onTagClick,
  onDesc,
}: {
  bookmarks: PanelBookmark[];
  template: TemplateConfig;
  selected: Set<string>;
  onTagClick: (name: string) => void;
  onDesc: (d: PanelDesc) => void;
}) {
  const rows = template.layout === "list" || template.layout === "terminal";
  if (rows) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {bookmarks.map((b) => (
          <BookmarkRow key={b.id} b={b} template={template} selected={selected} onTagClick={onTagClick} onDesc={onDesc} />
        ))}
      </div>
    );
  }
  return (
    <div style={gridStyle(template, "bookmarks")}>
      {bookmarks.map((b, i) => (
        <BookmarkCard key={b.id} b={b} template={template} index={i} selected={selected} onTagClick={onTagClick} onDesc={onDesc} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Pieces                                                           */
/* ---------------------------------------------------------------- */

function Header({ title, template, banner }: { title: string; template: TemplateConfig; banner: boolean }) {
  const t = template.theme;
  return (
    <div
      style={{
        marginBottom: "1.25rem",
        padding: banner ? "1.75rem 1.5rem" : "0.5rem 0",
        borderRadius: banner ? "1rem" : 0,
        background: banner ? t.surface : "transparent",
        border: banner ? `1px solid ${t.border}` : "none",
        backdropFilter: banner ? "blur(6px)" : undefined,
      }}
    >
      <h1 style={{ margin: 0, fontSize: banner ? "1.9rem" : "1.4rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
        {template.layout === "terminal" ? `~/${title}` : title}
      </h1>
    </div>
  );
}

function TagFilterBar({
  allTags,
  selected,
  matchAll,
  template,
  onToggle,
  onMatchAll,
  onClear,
}: {
  allTags: Map<string, { color: string; count: number }>;
  selected: Set<string>;
  matchAll: boolean;
  template: TemplateConfig;
  onToggle: (name: string) => void;
  onMatchAll: () => void;
  onClear: () => void;
}) {
  const t = template.theme;
  const entries = useMemo(
    () => [...allTags.entries()].sort((a, b) => b[1].count - a[1].count),
    [allTags],
  );

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);

  const shown = useMemo(() => {
    const needle = foldText(query.trim());
    if (!needle) return entries;
    // Whatever is switched on stays on the list even when it does not match
    // the search, or filtering would hide the only control that turns it off.
    return entries.filter(
      ([name]) => foldText(name).includes(needle) || selected.has(name),
    );
  }, [entries, query, selected]);

  /**
   * Whether there is more than fits, which is what decides if the control to
   * see the rest is worth showing.
   *
   * Measured rather than counted: whether forty tags need one row or six
   * depends on how long their names are and how wide the panel is, and a
   * "more than N tags" rule gets both of those wrong.
   */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown.length, expanded]);

  const chip = (name: string, info: { color: string; count: number }) => {
    const on = selected.has(name);
    return (
      <button
        key={name}
        type="button"
        onClick={() => onToggle(name)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          padding: "3px 10px",
          borderRadius: 999,
          cursor: "pointer",
          fontFamily: "inherit",
          background: on ? info.color : `${info.color}22`,
          color: on ? "#fff" : info.color,
          border: `1px solid ${info.color}${on ? "" : "55"}`,
        }}
      >
        {name}
        <span style={{ opacity: 0.7 }}>{info.count}</span>
      </button>
    );
  };

  return (
    <div
      data-testid="panel-tag-filter"
      style={{
        marginBottom: "1.25rem",
        padding: "0.6rem 0.75rem",
        borderRadius: "0.75rem",
        background: t.surface,
        border: `1px solid ${t.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Filter size={15} style={{ color: t.muted, flexShrink: 0 }} />
        {/* A panel of a few hundred links can carry more tags than fit on a
            screen, and then the filter is the thing you have to search. */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar un tag…"
          aria-label="Buscar un tag"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            fontFamily: "inherit",
            padding: "3px 8px",
            borderRadius: 999,
            background: "transparent",
            color: t.text,
            border: `1px solid ${t.border}`,
            outline: "none",
          }}
        />
        {selected.size > 1 && (
          <button
            type="button"
            onClick={onMatchAll}
            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, cursor: "pointer", background: "transparent", color: t.muted, border: `1px dashed ${t.border}`, fontFamily: "inherit", flexShrink: 0 }}
          >
            {matchAll ? "coincidir todas" : "coincidir alguna"}
          </button>
        )}
        {selected.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, cursor: "pointer", background: "transparent", color: t.muted, border: "none", fontFamily: "inherit", flexShrink: 0 }}
          >
            <X size={13} /> limpiar
          </button>
        )}
      </div>

      <div
        ref={listRef}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 8,
          // Capped, with its own scrollbar: the tag list is the way into the
          // panel, not the panel, and a hundred tags used to push the links
          // themselves off the first screen.
          maxHeight: expanded ? 260 : 76,
          overflowY: "auto",
        }}
      >
        {shown.map(([name, info]) => chip(name, info))}
        {shown.length === 0 && (
          <span style={{ fontSize: 12, color: t.muted }}>
            Ningún tag coincide.
          </span>
        )}
      </div>

      {(clipped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            cursor: "pointer",
            background: "transparent",
            color: t.muted,
            border: "none",
            fontFamily: "inherit",
            padding: 0,
          }}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? "ver menos" : `ver todos (${shown.length})`}
        </button>
      )}
    </div>
  );
}

function Breadcrumb({
  root,
  path,
  template,
  onGo,
}: {
  root: PanelFolder;
  path: string[];
  template: TemplateConfig;
  onGo: (index: number) => void;
}) {
  const t = template.theme;
  const names: string[] = [root.name];
  let cur = root;
  for (const id of path) {
    const next = cur.subfolders.find((f) => f.id === id);
    if (!next) break;
    cur = next;
    names.push(next.name);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, color: t.muted, fontSize: 13, marginBottom: "1rem" }}>
      {path.length > 0 && (
        <button
          type="button"
          onClick={() => onGo(path.length - 1)}
          title="Subir de nivel"
          aria-label="Subir de nivel"
          style={{ background: "none", border: `1px solid ${t.border}`, borderRadius: 6, cursor: "pointer", color: t.muted, padding: "3px 6px", display: "inline-flex", alignItems: "center", fontFamily: "inherit", marginRight: 4 }}
        >
          <ArrowUp size={14} />
        </button>
      )}
      {names.map((name, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {i > 0 && <ChevronRight size={13} />}
          <button
            type="button"
            onClick={() => onGo(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: i === names.length - 1 ? t.text : t.muted, fontWeight: i === names.length - 1 ? 600 : 400, padding: 0, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit", fontSize: 13 }}
          >
            {i === 0 && <Home size={13} />}
            {name}
          </button>
        </span>
      ))}
    </div>
  );
}

function Section({ title, template, children }: { title: string; template: TemplateConfig; children: React.ReactNode }) {
  const t = template.theme;
  return (
    <div style={{ marginTop: "1.5rem" }}>
      {template.showSectionTitles !== false && (
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: t.muted, marginBottom: 10, fontWeight: 600 }}>{title}</div>
      )}
      {children}
    </div>
  );
}

function FolderCard({ folder, template, onDesc, onOpen }: { folder: PanelFolder; template: TemplateConfig; onDesc: (d: PanelDesc) => void; onOpen: () => void }) {
  const t = template.theme;
  const count = folder.bookmarks.length + folder.subfolders.length;
  // A div rather than a button: the card is clickable *and* carries the "see
  // the text" button, and a button inside a button is not valid HTML (nor does
  // it get its own click in every browser).
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", padding: "0.85rem 1rem", borderRadius: template.card.radius, background: t.surface, border: `1px solid ${t.border}`, color: t.text, boxShadow: template.card.shadow ? "0 6px 20px rgba(0,0,0,0.12)" : "none", fontFamily: "inherit", minHeight: template.cardMinHeight || undefined }}
    >
      <FolderIcon size={20} style={{ color: t.accent, flexShrink: 0 }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
        <span style={{ fontSize: 12, color: t.muted }}>{count} elementos</span>
      </span>
      <InfoButton
        title={folder.name}
        html={folder.description}
        template={template}
        onDesc={onDesc}
      />
    </div>
  );
}

/** Full-bleed custom background (uploaded image/gif/video) behind the panel. */
function AssetBackground({ url, kind }: { url: string; kind?: PanelBgKind | null }) {
  const style: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    pointerEvents: "none",
  };
  if (kind === "video") {
    return <video style={style} src={url} autoPlay muted loop playsInline aria-hidden />;
  }
  return <img style={style} src={url} alt="" aria-hidden />;
}

/**
 * A folder shown together with its immediate subfolders as a browsable list
 * (enabled by `template.folderPreview`). Clicking the header opens the folder
 * itself; clicking a child opens just that child.
 */
function FolderPreviewCard({
  folder,
  template,
  onDesc,
  onOpen,
  onOpenChild,
}: {
  folder: PanelFolder;
  template: TemplateConfig;
  onDesc: (d: PanelDesc) => void;
  onOpen: () => void;
  onOpenChild: (childId: string) => void;
}) {
  const t = template.theme;
  const count = folder.bookmarks.length + folder.subfolders.length;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: template.card.radius,
        background: t.surface,
        border: `1px solid ${t.border}`,
        color: t.text,
        boxShadow: template.card.shadow ? "0 6px 20px rgba(0,0,0,0.12)" : "none",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textAlign: "left",
          cursor: "pointer",
          padding: "0.85rem 1rem",
          background: "transparent",
          border: "none",
          color: "inherit",
          fontFamily: "inherit",
        }}
      >
        <FolderIcon size={20} style={{ color: t.accent, flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
          <span style={{ fontSize: 12, color: t.muted }}>{count} elementos</span>
        </span>
      </button>
      <span style={{ position: "absolute", right: 10, top: 12 }}>
        <InfoButton
          title={folder.name}
          html={folder.description}
          template={template}
          onDesc={onDesc}
        />
      </span>
      {folder.subfolders.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${t.border}` }}>
          {folder.subfolders.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => onOpenChild(child.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                textAlign: "left",
                cursor: "pointer",
                padding: "0.5rem 1rem 0.5rem 1.4rem",
                background: "transparent",
                border: "none",
                borderTop: `1px solid ${t.border}55`,
                color: t.muted,
                fontFamily: "inherit",
                fontSize: 13,
              }}
            >
              <ChevronRight size={13} style={{ flexShrink: 0, color: t.accent }} />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Tags({
  b,
  template,
  selected,
  onTagClick,
  scroll,
}: {
  b: PanelBookmark;
  template: TemplateConfig;
  selected: Set<string>;
  onTagClick: (name: string) => void;
  scroll?: boolean;
}) {
  if (!template.card.showTags || b.tags.length === 0) return null;
  const shown = b.tags.slice(0, 12);
  return (
    <div
      className={scroll ? "no-scrollbar" : undefined}
      style={
        scroll
          ? { display: "flex", flexWrap: "nowrap", gap: 4, marginTop: 6, overflowX: "auto", maxWidth: "100%" }
          : { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }
      }
    >
      {shown.map((tag, i) => {
        const on = selected.has(tag.name);
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTagClick(tag.name);
            }}
            style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 10, padding: "1px 7px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", background: on ? tag.color : `${tag.color}22`, color: on ? "#fff" : tag.color, border: `1px solid ${tag.color}${on ? "" : "55"}` }}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}

function BookmarkCard({
  b,
  template,
  index,
  selected,
  onTagClick,
  onDesc,
}: {
  b: PanelBookmark;
  template: TemplateConfig;
  index: number;
  selected: Set<string>;
  onTagClick: (name: string) => void;
  onDesc: (d: PanelDesc) => void;
}) {
  const t = template.theme;
  const desc = b.description ? stripHtml(b.description) : "";
  return (
    <a
      href={b.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8, padding: "1rem", borderRadius: template.card.radius, background: t.surface, border: `1px solid ${t.border}`, color: t.text, textDecoration: "none", boxShadow: template.card.shadow ? "0 6px 20px rgba(0,0,0,0.12)" : "none", minHeight: template.cardMinHeight || undefined }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {template.card.showIcon && <Favicon url={b.url} title={b.title} accent={t.accent} />}
        <span style={{ fontWeight: 600, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
        <InfoButton title={b.title} html={b.description} url={b.url} template={template} onDesc={onDesc} />
      </div>
      {template.card.showUrl && (
        <span style={{ fontSize: 12, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.url}</span>
      )}
      {template.card.showDescription && desc && (
        <span style={{ fontSize: 13, color: t.muted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{desc}</span>
      )}
      <Tags b={b} template={template} selected={selected} onTagClick={onTagClick} scroll />
    </a>
  );
}

function BookmarkRow({
  b,
  template,
  selected,
  onTagClick,
  onDesc,
}: {
  b: PanelBookmark;
  template: TemplateConfig;
  selected: Set<string>;
  onTagClick: (name: string) => void;
  onDesc: (d: PanelDesc) => void;
}) {
  const t = template.theme;
  const terminal = template.layout === "terminal";
  const desc = b.description ? stripHtml(b.description) : "";
  return (
    <a
      href={b.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: terminal ? "0.4rem 0.5rem" : "0.7rem 0.9rem", borderRadius: template.card.radius, background: terminal ? "transparent" : t.surface, border: terminal ? "none" : `1px solid ${t.border}`, color: t.text, textDecoration: "none" }}
    >
      {terminal && <span style={{ color: t.accent, lineHeight: "1.4" }}>$</span>}
      {template.card.showIcon && !terminal && <Favicon url={b.url} title={b.title} accent={t.accent} size={20} />}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: terminal ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{terminal ? `open ${b.title}` : b.title}</span>
        {template.card.showUrl && (
          <span style={{ fontSize: 12, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{b.url}</span>
        )}
        {template.card.showDescription && desc && !terminal && (
          <span style={{ fontSize: 13, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{desc}</span>
        )}
        <Tags b={b} template={template} selected={selected} onTagClick={onTagClick} scroll />
      </span>
      <InfoButton title={b.title} html={b.description} url={b.url} template={template} onDesc={onDesc} />
    </a>
  );
}

function DescriptionModal({ desc, template, onClose }: { desc: PanelDesc; template: TemplateConfig; onClose: () => void }) {
  const t = template.theme;
  const { t: tr } = useTranslation();
  const backdrop = useBackdropDismiss(onClose);
  const bodyRef = useRef<HTMLDivElement>(null);
  // The copyable/spoiler markers are data attributes. DOMPurify keeps `data-*`
  // by default, so listing them is belt and braces rather than a fix: it says
  // they are load-bearing, so a future `USE_PROFILES` here (which flips that
  // default off) does not silently strip the marks.
  const safe = useMemo(() => sanitizeNote(desc.html), [desc.html]);

  // Same behaviour as the app: click to copy, click to reveal and click again
  // to copy. Shared implementation, so the two cannot drift.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return bindInteractiveMarks(el, {
      copy: tr("richText.clickToCopy"),
      reveal: tr("richText.clickToReveal"),
      copied: tr("richText.copied"),
    });
  }, [tr, safe]);

  /**
   * Formulas, diagrams and highlighted code, here too.
   *
   * A panel is where a note is read by people who are not the author, and a
   * note whose formulas render for its owner and show raw LaTeX to everybody
   * else is the kind of split nobody notices until somebody publishes.
   */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    wrapTables(el);
    void renderMath(el);
    void renderCode(el);
    void renderDiagrams(el);
  }, [safe]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return bindCodeCopy(el, tr("richText.copyCode"), tr("richText.copiedCode"));
  }, [tr, safe]);
  // Lock the page behind the modal so a drag on mobile doesn't scroll it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Swipe-down-to-dismiss: only starts a drag when the sheet is scrolled to
  // the top and the gesture is downward, so inner scrolling still works.
  const [wide, setWide] = useState(false);
  const [finding, setFinding] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ y: number; x: number; scroll: number; axis: "none" | "v" | "h" } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const tp = e.touches[0];
    if (!tp) return;
    touch.current = { y: tp.clientY, x: tp.clientX, scroll: scrollRef.current?.scrollTop ?? 0, axis: "none" };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current;
    const tp = e.touches[0];
    if (!s || !tp) return;
    const dy = tp.clientY - s.y;
    const dx = tp.clientX - s.x;
    if (s.axis === "none") {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      s.axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
    }
    if (s.axis === "v" && dy > 0 && s.scroll <= 0) {
      if (!dragging) setDragging(true);
      setDragY(dy);
    }
  };
  const onTouchEnd = () => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    setDragging(false);
    if (dragY > 110) {
      setDragY(window.innerHeight); // slide out, then unmount
      window.setTimeout(onClose, 200);
    } else {
      setDragY(0);
    }
  };

  return (
    <div
      {...backdrop}
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-4"
      style={{ background: `rgba(0,0,0,${dragging ? Math.max(0.2, 0.55 - dragY / 800) : 0.55})` }}
    >
      <div
        ref={scrollRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        data-testid="panel-modal"
        className={`flex w-full flex-col overflow-y-auto overscroll-contain ${
          wide
            ? // Full screen: a note with a twelve-column table in it is the
              // reason somebody opened this, and a 2xl sheet is still a sheet.
              "h-full sm:h-full sm:max-h-none sm:max-w-none sm:rounded-none"
            : "rounded-t-2xl sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl"
        }`}
        style={{
          // Opaque on purpose: several templates make the surface translucent,
          // which reads well on a card over the background and makes a modal's
          // text unreadable. See opaqueSurface.
          background: opaqueSurface(t.surface, t.bg, t.text),
          color: t.text,
          border: `1px solid ${t.border}`,
          padding: "1.25rem",
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform .25s ease",
        }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full sm:hidden" style={{ background: t.border }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, flex: 1, minWidth: 0 }}>{desc.title}</h3>
          {desc.url && (
            <a href={desc.url} target="_blank" rel="noopener noreferrer" style={{ color: t.accent, display: "inline-flex" }} title="Abrir">
              <ExternalLink size={18} />
            </a>
          )}
          <button
            type="button"
            onClick={() => setFinding((v) => !v)}
            title={tr("richText.find")}
            aria-label={tr("richText.find")}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: t.muted, display: "inline-flex" }}
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            onClick={() => setWide((v) => !v)}
            title={wide ? tr("richText.restore") : tr("richText.maximise")}
            aria-label={wide ? tr("richText.restore") : tr("richText.maximise")}
            aria-pressed={wide}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: t.muted, display: "inline-flex" }}
          >
            {wide ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: t.muted, display: "inline-flex" }}
          >
            <X size={18} />
          </button>
        </div>
        {desc.url && (
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 12, wordBreak: "break-all" }}>{desc.url}</div>
        )}
        {finding && (
          <div style={{ marginBottom: 10 }}>
            <ReadFindBar container={bodyRef} onClose={() => setFinding(false)} />
          </div>
        )}
        <div
          ref={bodyRef}
          className="ab-marks-themed ab-rich"
          // The mark styles are written against the app's own light/dark
          // palette, which says nothing about a panel: a template can be dark
          // while the app is light. These two hand the panel's own colours to
          // the stylesheet so a copyable chip stays readable either way.
          style={
            {
              fontSize: 14,
              lineHeight: 1.6,
              "--ab-mark-bg": `${t.accent}2b`,
              "--ab-mark-line": t.muted,
              // The note's own furniture — table rules, quote bars, the tint
              // behind inline code — drawn from the panel's palette rather
              // than from the app's, which says nothing here.
              "--ab-rich-border": t.border,
              "--ab-rich-head": `${t.muted}22`,
            } as React.CSSProperties
          }
          dangerouslySetInnerHTML={{ __html: safe }}
        />
      </div>
    </div>
  );
}
