import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, ExternalLink, FolderClosed, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { fuzzyScore, fuzzyScoreAny } from "../fuzzy.js";
import { LetterIcon } from "./LetterIcon.js";
import { useActiveFolderId } from "../hooks.js";
import { useBackdropDismiss } from "../lib/overlay.js";

type Result = { near: boolean; iconUrl: string | null } & (
  | { kind: "folder"; id: string; title: string; sub: string }
  | { kind: "bookmark"; id: string; title: string; url: string; sub: string }
);

/**
 * Spotlight-style global search: a modal bar near the top with live results
 * below. Searches the already-loaded folders + bookmarks client-side (instant,
 * no round-trip). Arrow keys move, Enter opens, Esc closes.
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
    for (const b of bookmarks.data ?? []) {
      const s = fuzzyScoreAny(query, b.title, b.url);
      if (s !== null)
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
          _s: s,
          _near: inScope(b.folderId) ? 0 : 1,
        });
    }
    scored.sort(
      (a, b) =>
        a._near - b._near || a._s - b._s || (a.kind === "folder" ? -1 : 1),
    );
    return scored.slice(0, 25).map(({ _s, _near, ...r }) => r);
  }, [q, folders.data, bookmarks.data, t, activeFolderId]);

  useEffect(() => setSel(0), [q]);

  const activate = (r: Result) => {
    if (r.kind === "folder") nav(`/folder/${r.id}`);
    else window.open(r.url, "_blank", "noopener,noreferrer");
    onClose();
  };

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

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-3 backdrop-blur-sm motion-safe:animate-[spotFade_.12s_ease-out]"
      {...backdrop}
    >
      <div
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
          {q.trim() === "" ? (
            <div className="px-3 py-8 text-center text-sm text-slate-400">
              {t("spotlight.hint")}
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-slate-400">
              {t("spotlight.noResults")}
            </div>
          ) : (
            results.map((r, i) => (
              <div key={`${r.kind}:${r.id}`}>
                {/* Headers split "what's here" from the rest, so the boost is
                    visible rather than just implied by the order. */}
                {i === 0 && r.near && (
                  <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    {t("spotlight.inCurrentFolder")}
                  </div>
                )}
                {!r.near && results[i - 1]?.near && (
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
                  {r.iconUrl ? (
                    <img
                      src={r.iconUrl}
                      alt=""
                      className="h-5 w-5 shrink-0 rounded object-cover"
                    />
                  ) : r.kind === "folder" ? (
                    <FolderClosed className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <LetterIcon
                      label={r.title || r.url}
                      seed={r.url || r.title}
                      size="h-5 w-5"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-slate-400">{r.sub}</span>
                  </span>
                  {i === sel && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
