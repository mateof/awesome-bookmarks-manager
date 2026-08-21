import type { RefType } from "@awesome-bookmarks/shared";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Folder, Paperclip, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { Modal } from "./Modal.js";

export interface PickedRef {
  refType: RefType;
  refId?: string | null;
  refSlug?: string | null;
  label: string;
}

/**
 * Choose what a reference points at.
 *
 * Two modes, because the two things are found in different ways. Folders and
 * bookmarks are searched on the server, where the whole tree lives. Files are
 * searched *in the browser*: their slugs are stored hashed, so the server
 * cannot do prefix matching over them without keeping them in the clear, and
 * for the number of files one account attaches, fetching the list and filtering
 * locally is instant anyway.
 */
export function RefPicker({
  mode,
  onPick,
  onClose,
}: {
  /** "entity" for folders and bookmarks, "asset" for attached files. */
  mode: "entity" | "asset";
  onPick: (ref: PickedRef) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const entities = useQuery({
    queryKey: ["refs", "search", q],
    queryFn: () => api.searchRefs(q),
    enabled: mode === "entity",
  });
  const assets = useQuery({
    queryKey: ["attachments", "all"],
    queryFn: () => api.allAttachments(),
    enabled: mode === "asset",
  });

  const rows: PickedRef[] = useMemo(() => {
    if (mode === "entity") {
      return (entities.data ?? []).map((c) => ({
        refType: c.type,
        refId: c.id,
        refSlug: null,
        label: c.title,
        // Carried for display only.
        ...{ hint: c.hint, url: c.url },
      })) as PickedRef[];
    }
    const needle = q.trim().toLowerCase();
    return (assets.data ?? [])
      // A file uploaded before slugs existed has none, so it cannot be
      // referenced yet. Showing it would offer a chip that resolves to
      // nothing; the attachment list is where you give it a slug.
      .filter((a) => a.slug)
      .filter(
        (a) =>
          !needle ||
          a.slug.toLowerCase().includes(needle) ||
          a.name.toLowerCase().includes(needle),
      )
      .map((a) => ({
        refType: "asset" as const,
        refId: null,
        refSlug: a.slug,
        label: a.name,
        ...{ hint: a.slug, url: null },
      })) as PickedRef[];
  }, [mode, entities.data, assets.data, q]);

  useEffect(() => setCursor(0), [q, mode]);

  // Only reports the choice. Closing, and putting the caret back where it
  // was, is the caller's job: it has to happen before the insertion or the
  // dialog's own focus restoration lands after it and steals the caret.
  const choose = (r: PickedRef | undefined) => {
    if (!r) return;
    onPick(r);
  };

  return (
    <Modal
      title={t(mode === "asset" ? "refs.pickAsset" : "refs.pickEntity")}
      onClose={onClose}
      size="md"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded border border-slate-300 px-2 dark:border-slate-700">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t(
              mode === "asset" ? "refs.searchAsset" : "refs.searchEntity",
            )}
            className="w-full bg-transparent py-2 text-sm outline-none"
            onKeyDown={(e) => {
              // Arrow keys and Enter, so the whole thing is usable without
              // leaving the keyboard you were already typing in.
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(rows[cursor]);
              }
            }}
          />
        </div>

        <ul className="max-h-80 divide-y divide-slate-200 overflow-y-auto rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {rows.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-400">
              {t("refs.noResults")}
            </li>
          )}
          {rows.map((r, i) => {
            const extra = r as PickedRef & {
              hint?: string | null;
              url?: string | null;
            };
            return (
              <li key={`${r.refType}:${r.refId ?? r.refSlug}`}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(r)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                    i === cursor
                      ? "bg-slate-100 dark:bg-slate-800"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  {r.refType === "folder" ? (
                    <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                  ) : r.refType === "bookmark" ? (
                    <Bookmark className="h-4 w-4 shrink-0 text-sky-500" />
                  ) : (
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.label}</span>
                    {(extra.url || extra.hint) && (
                      <span className="block truncate text-xs text-slate-400">
                        {extra.url ?? extra.hint}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
