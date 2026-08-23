import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  CornerDownLeft,
  FileText,
  Filter,
  FolderClosed,
  FolderPlus,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Share2,
  Tag,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { fuzzyScore, fuzzyScoreAny } from "../fuzzy.js";
import { LetterIcon } from "./LetterIcon.js";
import { useActiveFolderId } from "../hooks.js";
import { runAppCommand, type AppCommand } from "../lib/commands.js";
import { useBackdropDismiss } from "../lib/overlay.js";

type Result = { near: boolean; iconUrl: string | null; snippet?: string } & (
  | { kind: "folder"; id: string; title: string; sub: string }
  | { kind: "bookmark"; id: string; title: string; url: string; sub: string }
  | { kind: "action"; id: string; title: string; sub: string; run: () => void }
);

interface ActionDef {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Extra words the fuzzy matcher accepts for this action. */
  keywords: string;
  to?: string;
  command?: AppCommand;
}

const ACTION_ICONS: Record<string, LucideIcon> = {
  "new-bookmark": Plus,
  "new-folder": FolderPlus,
  filter: Filter,
  panels: LayoutDashboard,
  tags: Tag,
  duplicates: Copy,
  trash: Trash2,
  groups: Users,
  shared: Share2,
  "import-export": Settings,
};


/**
 * Render an FTS5 snippet safely. SQLite wraps matches in literal `<mark>` tags
 * and escapes nothing else, so the string is split on those markers and the
 * pieces go in as text nodes — never as HTML.
 */
function renderSnippet(snippet: string) {
  return snippet.split(/(<mark>|<\/mark>)/).reduce<{
    nodes: React.ReactNode[];
    on: boolean;
  }>(
    (acc, piece, i) => {
      if (piece === "<mark>") return { ...acc, on: true };
      if (piece === "</mark>") return { ...acc, on: false };
      if (!piece) return acc;
      acc.nodes.push(
        acc.on ? (
          <mark
            key={i}
            className="rounded bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40"
          >
            {piece}
          </mark>
        ) : (
          <span key={i}>{piece}</span>
        ),
      );
      return acc;
    },
    { nodes: [], on: false },
  ).nodes;
}

/**
 * Spotlight-style palette: a modal bar near the top with live results below.
 *
 * Titles and URLs are matched client-side against the already-loaded lists, so
 * typing feels instant. In parallel a debounced call hits `/search`, which runs
 * the FTS5 index over saved snapshots — that is what finds a page by something
 * written *inside* it, with the matching phrase shown underneath.
 *
 * Actions share the list with content: the palette is the fastest route to
 * "new bookmark" or "go to panels", not only to things you already saved.
 */
export function Spotlight({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const backdrop = useBackdropDismiss(onClose);
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
  const bookmarks = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
  });
  const activeFolderId = useActiveFolderId();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounced so a round-trip does not fire on every keystroke; the local
  // results carry the interaction while this catches up.
  const [deferred, setDeferred] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setDeferred(q.trim()), 200);
    return () => window.clearTimeout(id);
  }, [q]);

  // Deliberately unscoped: the palette ranks "in this folder" first on its own
  // (see `near` below), so asking the server to pre-filter by folder would
  // silently drop every match living elsewhere.
  const content = useQuery({
    queryKey: ["search-content", deferred],
    queryFn: () => api.search(deferred),
    enabled: deferred.length >= 2,
    staleTime: 30_000,
  });

  /** Snippets keyed by bookmark id, for the hits that matched page text. */
  const snippets = useMemo(() => {
    const map = new Map<string, string>();
    for (const hit of content.data ?? []) {
      if (hit.snippet) map.set(hit.bookmark.id, hit.snippet);
    }
    return map;
  }, [content.data]);

  /**
   * Keys are spelled out literally so the typed i18n resources keep checking
   * them; a lookup table indexed by a variable would silently accept a typo.
   */
  const definitions = useMemo<ActionDef[]>(() => {
    const go = t("commands.hintGo");
    const create = t("commands.hintCreate");
    return [
      {
        id: "new-bookmark",
        label: t("commands.newBookmark"),
        hint: create,
        keywords: t("commands.kwNewBookmark"),
        icon: Plus,
        command: "new-bookmark",
      },
      {
        id: "new-folder",
        label: t("commands.newFolder"),
        hint: create,
        keywords: t("commands.kwNewFolder"),
        icon: FolderPlus,
        command: "new-folder",
      },
      {
        id: "filter",
        label: t("commands.filter"),
        hint: go,
        keywords: t("commands.kwFilter"),
        icon: Filter,
        to: "/filter",
      },
      {
        id: "panels",
        label: t("commands.panels"),
        hint: go,
        keywords: t("commands.kwPanels"),
        icon: LayoutDashboard,
        to: "/panels",
      },
      {
        id: "tags",
        label: t("commands.tags"),
        hint: go,
        keywords: t("commands.kwTags"),
        icon: Tag,
        to: "/tags",
      },
      {
        id: "duplicates",
        label: t("commands.duplicates"),
        hint: go,
        keywords: t("commands.kwDuplicates"),
        icon: Copy,
        to: "/duplicates",
      },
      {
        id: "trash",
        label: t("commands.trash"),
        hint: go,
        keywords: t("commands.kwTrash"),
        icon: Trash2,
        to: "/trash",
      },
      {
        id: "groups",
        label: t("commands.groups"),
        hint: go,
        keywords: t("commands.kwGroups"),
        icon: Users,
        to: "/groups",
      },
      {
        id: "shared",
        label: t("commands.shared"),
        hint: go,
        keywords: t("commands.kwShared"),
        icon: Share2,
        to: "/shared",
      },
      {
        id: "import-export",
        label: t("commands.importExport"),
        hint: go,
        keywords: t("commands.kwImportExport"),
        icon: Settings,
        to: "/settings/import-export",
      },
    ];
  }, [t]);

  const toResult = (a: ActionDef): Result => ({
    kind: "action",
    id: a.id,
    title: a.label,
    sub: a.hint,
    near: false,
    iconUrl: null,
    run: () => {
      if (a.to) {
        nav(a.to);
        return;
      }
      if (!a.command) return;
      // The dialogs these commands open belong to the folder page. Run from
      // anywhere else (panels, settings, groups) there is nothing listening,
      // so go home first and fire once that page has mounted.
      const onFolderPage =
        window.location.pathname === "/" ||
        window.location.pathname.startsWith("/folder/");
      if (onFolderPage) {
        runAppCommand(a.command);
      } else {
        nav("/");
        const command = a.command;
        window.setTimeout(() => runAppCommand(command), 0);
      }
    },
  });

  const matchingActions = useMemo<Result[]>(() => {
    const query = q.trim();
    // With an empty box the palette is a launcher, so offer the shortcuts
    // people reach for most instead of an empty pane.
    if (!query) return definitions.slice(0, 4).map(toResult);
    return definitions
      .map((a) => ({ a, s: fuzzyScoreAny(query, a.label, a.keywords) }))
      .filter((x): x is { a: ActionDef; s: number } => x.s !== null)
      .sort((x, y) => x.s - y.s)
      .slice(0, 4)
      .map((x) => toResult(x.a));
  }, [q, definitions, nav]);

  const results = useMemo<Result[]>(() => {
    const query = q.trim();
    if (!query) return [];
    const fs = folders.data ?? [];
    const byId = new Map(fs.map((f) => [f.id, f]));
    const pathOf = (fid: string | null): string => {
      const parts: string[] = [];
      let cur = fid;
      let guard = 0;
      while (cur && guard++ < 30) {
        const f = byId.get(cur);
        if (!f) break;
        parts.unshift(f.name);
        cur = f.parentId;
      }
      return parts.join(" / ") || t("sidebar.home");
    };
    // Searching from inside a folder, its own contents come first: that is
    // almost always what you meant. Everything else still shows, just below.
    const scope = new Set<string>();
    if (activeFolderId) {
      const stack = [activeFolderId];
      let guard = 0;
      while (stack.length && guard++ < 5000) {
        const cur = stack.pop()!;
        if (scope.has(cur)) continue;
        scope.add(cur);
        for (const f of fs) if (f.parentId === cur) stack.push(f.id);
      }
    }
    const inScope = (folderId: string | null, ownId?: string) =>
      scope.size > 0 &&
      ((folderId !== null && scope.has(folderId)) || (!!ownId && scope.has(ownId)));

    // Levenshtein-tolerant scoring: exact substring first, typos after.
    const scored: Array<Result & { _s: number; _near: number }> = [];
    for (const f of fs) {
      const s = fuzzyScore(query, f.name);
      if (s !== null)
        scored.push({
          kind: "folder",
          id: f.id,
          title: f.name,
          sub: pathOf(f.parentId),
          near: inScope(f.parentId, f.id),
          iconUrl: f.iconBlobPath
            ? api.folderIconUrl(f.aliasOf ?? f.id, f.updatedAt)
            : null,
          _s: s,
          _near: inScope(f.parentId, f.id) ? 0 : 1,
        });
    }
    const seen = new Set<string>();
    for (const b of bookmarks.data ?? []) {
      const s = fuzzyScoreAny(query, b.title, b.url);
      if (s === null) continue;
      seen.add(b.id);
      scored.push({
        kind: "bookmark",
        id: b.id,
        title: b.title,
        url: b.url,
        sub: pathOf(b.folderId),
        near: inScope(b.folderId),
        iconUrl: b.iconBlobPath
          ? api.bookmarkIconUrl(b.aliasOf ?? b.id, b.updatedAt)
          : null,
        snippet: snippets.get(b.id),
        _s: s,
        _near: inScope(b.folderId) ? 0 : 1,
      });
    }

    // Bookmarks the server matched on something the client cannot see: the
    // description, or the text of the saved snapshot via the FTS index. These
    // are the ones the palette could never find before, so they earn a place
    // even though they rank below every title match. A snippet-bearing hit
    // (page text) goes above a plain one (description).
    for (const hit of content.data ?? []) {
      const b = hit.bookmark;
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      scored.push({
        kind: "bookmark",
        id: b.id,
        title: b.title,
        url: b.url,
        sub: pathOf(b.folderId),
        near: inScope(b.folderId),
        iconUrl: b.iconBlobPath
          ? api.bookmarkIconUrl(b.aliasOf ?? b.id, b.updatedAt)
          : null,
        snippet: hit.snippet,
        _s: hit.snippet ? 900 : 901,
        _near: inScope(b.folderId) ? 0 : 1,
      });
    }

    scored.sort(
      (a, b) =>
        a._near - b._near || a._s - b._s || (a.kind === "folder" ? -1 : 1),
    );
    return scored.slice(0, 25).map(({ _s, _near, ...r }) => r);
  }, [
    q,
    folders.data,
    bookmarks.data,
    t,
    activeFolderId,
    content.data,
    snippets,
  ]);

  // One flat list so the arrow keys walk actions and results uniformly.
  const rows = useMemo(
    () => [...matchingActions, ...results],
    [matchingActions, results],
  );

  useEffect(() => setSel(0), [q]);

  const activate = (r: Result) => {
    if (r.kind === "action") r.run();
    else if (r.kind === "folder") nav(`/folder/${r.id}`);
    else window.open(r.url, "_blank", "noopener,noreferrer");
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, Math.max(rows.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        const r = rows[sel];
        if (r) activate(r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, sel]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const firstResultIdx = matchingActions.length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-3 backdrop-blur-sm motion-safe:animate-[spotFade_.12s_ease-out]"
      {...backdrop}
    >
      <div
        data-testid="spotlight"
        className="mt-[12vh] w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl motion-safe:animate-[spotPop_.14s_ease-out] dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("spotlight.placeholder")}
            className="w-full bg-transparent py-3.5 text-base outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-slate-300 px-1.5 text-[10px] text-slate-400 dark:border-slate-700 sm:block">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto overscroll-contain p-2">
          {rows.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-slate-400">
              {q.trim() === "" ? t("spotlight.hint") : t("spotlight.noResults")}
            </div>
          ) : (
            rows.map((r, i) => {
              const ActionIcon =
                r.kind === "action" ? ACTION_ICONS[r.id] : undefined;
              return (
                <div key={`${r.kind}:${r.id}`}>
                  {/* Headers split actions from content, and "what's here" from
                      the rest, so the ordering is visible rather than implied. */}
                  {i === 0 && r.kind === "action" && (
                    <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {t("commands.sectionTitle")}
                    </div>
                  )}
                  {i === firstResultIdx && r.near && (
                    <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
                      {t("spotlight.inCurrentFolder")}
                    </div>
                  )}
                  {i === firstResultIdx && !r.near && matchingActions.length > 0 && (
                    <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {t("spotlight.results")}
                    </div>
                  )}
                  {i > firstResultIdx && !r.near && rows[i - 1]?.near && (
                    <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {t("spotlight.elsewhere")}
                    </div>
                  )}
                  <button
                    data-idx={i}
                    onMouseMove={() => setSel(i)}
                    onClick={() => activate(r)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                      r.near ? "border-l-2 border-blue-500 bg-blue-50/40 dark:bg-blue-500/10" : ""
                    } ${i === sel ? "bg-slate-100 dark:bg-slate-800" : ""}`}
                  >
                    {ActionIcon ? (
                      <ActionIcon className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : r.iconUrl ? (
                      <img
                        src={r.iconUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-5 w-5 shrink-0 rounded object-cover"
                      />
                    ) : r.kind === "folder" ? (
                      <FolderClosed className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <LetterIcon
                        label={r.title || (r.kind === "bookmark" ? r.url : "")}
                        seed={r.kind === "bookmark" ? r.url || r.title : r.title}
                        size="h-5 w-5"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="block truncate text-xs text-slate-400">{r.sub}</span>
                      {r.snippet && (
                        <span className="mt-0.5 flex items-start gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <FileText className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="line-clamp-2">
                            {renderSnippet(r.snippet)}
                          </span>
                        </span>
                      )}
                    </span>
                    {i === sel && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
