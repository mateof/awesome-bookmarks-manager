import type {
  PanelBookmark,
  PanelFolder,
  TemplateConfig,
} from "@awesome-bookmarks/shared";
import DOMPurify from "dompurify";
import {
  ChevronRight,
  CornerDownLeft,
  ExternalLink,
  Filter,
  Folder as FolderIcon,
  Home,
  Info,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fuzzyScoreAny } from "../fuzzy.js";

/**
 * Renders a panel (a folder subtree) in the shape defined by the template.
 * Navigation (current folder) and the tag filter live in the URL query
 * (`?p=`, `?tags=`, `?m=`) so a shared link restores the exact view. The tag
 * filter is scoped to the current folder and its subfolders.
 */
export function PanelRenderer({
  root,
  template,
}: {
  root: PanelFolder;
  template: TemplateConfig;
}) {
  const [sp, setSp] = useSearchParams();
  const [descBookmark, setDescBookmark] = useState<PanelBookmark | null>(null);
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

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: template.font, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>
        {template.header !== "hidden" && (
          <Header
            title={filtering ? "Resultados" : path.length === 0 ? root.name : current.name}
            template={template}
            banner={template.header === "banner"}
          />
        )}

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
        </button>

        <Breadcrumb
          root={root}
          path={path}
          template={template}
          onGo={(i) => setPath(path.slice(0, i))}
        />

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
            <BookmarksView bookmarks={filtered} template={template} selected={selected} onTagClick={toggleTag} onDesc={setDescBookmark} />
          </Section>
        ) : (
          <>
            {current.subfolders.length > 0 && (
              <Section title="Carpetas" template={template}>
                <div style={gridStyle(template, "folders")}>
                  {current.subfolders.map((f) => (
                    <FolderCard key={f.id} folder={f} template={template} onOpen={() => setPath([...path, f.id])} />
                  ))}
                </div>
              </Section>
            )}
            {current.bookmarks.length > 0 ? (
              <Section title="Enlaces" template={template}>
                <BookmarksView bookmarks={current.bookmarks} template={template} selected={selected} onTagClick={toggleTag} onDesc={setDescBookmark} />
              </Section>
            ) : current.subfolders.length === 0 ? (
              <p style={{ color: t.muted, marginTop: "2rem" }}>Sin enlaces.</p>
            ) : null}
          </>
        )}
      </div>

      {descBookmark && (
        <DescriptionModal b={descBookmark} template={template} onClose={() => setDescBookmark(null)} />
      )}
      {searchOpen && (
        <PanelSearch root={root} template={template} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  );
}

function PanelSearch({
  root,
  template,
  onClose,
}: {
  root: PanelFolder;
  template: TemplateConfig;
  onClose: () => void;
}) {
  const t = template.theme;
  const all = useMemo(() => flatten(root), [root]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const query = q.trim();
    if (!query) return all.slice(0, 30);
    const scored: Array<{ b: PanelBookmark; s: number }> = [];
    for (const b of all) {
      const s = fuzzyScoreAny(
        query,
        b.title,
        b.url,
        b.description ? stripHtml(b.description) : "",
      );
      if (s !== null) scored.push({ b, s });
    }
    scored.sort((a, b) => a.s - b.s);
    return scored.slice(0, 40).map((x) => x.b);
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
        if (r) {
          window.open(r.url, "_blank", "noopener,noreferrer");
          onClose();
        }
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
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center p-3 backdrop-blur-sm motion-safe:animate-[spotFade_.12s_ease-out] sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[8vh] w-full max-w-xl overflow-hidden motion-safe:animate-[spotPop_.14s_ease-out] sm:rounded-2xl"
        style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}` }}
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
            results.map((b, i) => (
              <button
                key={b.id}
                data-idx={i}
                onMouseMove={() => setSel(i)}
                onClick={() => {
                  window.open(b.url, "_blank", "noopener,noreferrer");
                  onClose();
                }}
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
                <Favicon url={b.url} accent={t.accent} size={20} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                  <span style={{ display: "block", fontSize: 12, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.url}</span>
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

function stripHtml(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/* ---------------------------------------------------------------- */
/* Layout helpers                                                   */
/* ---------------------------------------------------------------- */

function gridStyle(template: TemplateConfig, kind: "folders" | "bookmarks"): React.CSSProperties {
  if (template.layout === "bento") {
    // `min(100%, …)` collapses to a single full-width column on narrow
    // screens; no forced row height so cards hug their content (no giant
    // empty boxes on mobile). The column spans still add visual variety.
    return {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))",
      gridAutoFlow: "dense",
      gap: 12,
    };
  }
  const cols = kind === "folders" ? Math.min(template.columns ?? 4, 6) : template.columns ?? 4;
  const base = Math.floor(1040 / cols);
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${base}px), 1fr))`,
    gap: 12,
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
  onDesc: (b: PanelBookmark) => void;
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
  const entries = [...allTags.entries()].sort((a, b) => b[1].count - a[1].count);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        marginBottom: "1.25rem",
        padding: "0.6rem 0.75rem",
        borderRadius: "0.75rem",
        background: t.surface,
        border: `1px solid ${t.border}`,
      }}
    >
      <Filter size={15} style={{ color: t.muted }} />
      {entries.map(([name, info]) => {
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
      })}
      {selected.size > 1 && (
        <button
          type="button"
          onClick={onMatchAll}
          style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, cursor: "pointer", background: "transparent", color: t.muted, border: `1px dashed ${t.border}`, fontFamily: "inherit" }}
        >
          {matchAll ? "coincidir todas" : "coincidir alguna"}
        </button>
      )}
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, cursor: "pointer", background: "transparent", color: t.muted, border: "none", fontFamily: "inherit" }}
        >
          <X size={13} /> limpiar
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
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: t.muted, marginBottom: 10, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

function FolderCard({ folder, template, onOpen }: { folder: PanelFolder; template: TemplateConfig; onOpen: () => void }) {
  const t = template.theme;
  const count = folder.bookmarks.length + folder.subfolders.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", padding: "0.85rem 1rem", borderRadius: template.card.radius, background: t.surface, border: `1px solid ${t.border}`, color: t.text, boxShadow: template.card.shadow ? "0 6px 20px rgba(0,0,0,0.12)" : "none", fontFamily: "inherit" }}
    >
      <FolderIcon size={20} style={{ color: t.accent, flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
        <span style={{ fontSize: 12, color: t.muted }}>{count} elementos</span>
      </span>
    </button>
  );
}

function Favicon({ url, accent, size = 22 }: { url: string; accent: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  let origin = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    origin = u.origin;
  } catch {
    // ignore
  }
  const letter = (host || url || "?").replace(/^www\./, "").charAt(0).toUpperCase();
  if (failed || !origin) {
    return (
      <span style={{ width: size, height: size, borderRadius: 6, background: accent, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, fontWeight: 700, flexShrink: 0 }}>{letter}</span>
    );
  }
  return <img src={`${origin}/favicon.ico`} alt="" width={size} height={size} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />;
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

function InfoButton({ b, template, onDesc }: { b: PanelBookmark; template: TemplateConfig; onDesc: (b: PanelBookmark) => void }) {
  if (!b.description || stripHtml(b.description).length === 0) return null;
  return (
    <button
      type="button"
      title="Ver detalles"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDesc(b);
      }}
      style={{ flexShrink: 0, display: "inline-flex", background: "transparent", border: "none", cursor: "pointer", color: template.theme.muted, padding: 2, fontFamily: "inherit" }}
    >
      <Info size={16} />
    </button>
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
  onDesc: (b: PanelBookmark) => void;
}) {
  const t = template.theme;
  const desc = b.description ? stripHtml(b.description) : "";
  return (
    <a
      href={b.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8, padding: "1rem", borderRadius: template.card.radius, background: t.surface, border: `1px solid ${t.border}`, color: t.text, textDecoration: "none", boxShadow: template.card.shadow ? "0 6px 20px rgba(0,0,0,0.12)" : "none" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {template.card.showIcon && <Favicon url={b.url} accent={t.accent} />}
        <span style={{ fontWeight: 600, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
        <InfoButton b={b} template={template} onDesc={onDesc} />
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
  onDesc: (b: PanelBookmark) => void;
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
      {template.card.showIcon && !terminal && <Favicon url={b.url} accent={t.accent} size={20} />}
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
      <InfoButton b={b} template={template} onDesc={onDesc} />
    </a>
  );
}

function DescriptionModal({ b, template, onClose }: { b: PanelBookmark; template: TemplateConfig; onClose: () => void }) {
  const t = template.theme;
  const safe = useMemo(
    () => DOMPurify.sanitize(b.description ?? "", { ADD_ATTR: ["target", "rel"] }),
    [b.description],
  );
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
      onClick={onClose}
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
        className="flex w-full flex-col overflow-y-auto overscroll-contain rounded-t-2xl sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl"
        style={{
          background: t.surface,
          color: t.text,
          border: `1px solid ${t.border}`,
          padding: "1.25rem",
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform .25s ease",
        }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full sm:hidden" style={{ background: t.border }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, flex: 1, minWidth: 0 }}>{b.title}</h3>
          <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ color: t.accent, display: "inline-flex" }} title="Abrir">
            <ExternalLink size={18} />
          </a>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.muted, display: "inline-flex" }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: t.muted, marginBottom: 12, wordBreak: "break-all" }}>{b.url}</div>
        <div
          style={{ fontSize: 14, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: safe }}
        />
      </div>
    </div>
  );
}
