import type { Tag } from "@awesome-bookmarks/shared";
import { Tag as TagIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface TagCandidate {
  tag: Tag;
  count: number;
}

const fold = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function FolderTagFilter({
  selected,
  candidates,
  onChange,
  resultFolders,
  resultBookmarks,
  autoFocus = false,
}: {
  selected: Tag[];
  candidates: TagCandidate[];
  onChange: (ids: string[]) => void;
  resultFolders: number;
  resultBookmarks: number;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const matches = useMemo(() => {
    const needle = fold(text.trim());
    return candidates
      .filter((c) => !needle || fold(c.tag.name).includes(needle))
      .sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name));
  }, [candidates, text]);

  const ids = selected.map((s) => s.id);
  const add = (id: string) => {
    onChange([...ids, id]);
    setText("");
    input.current?.focus();
  };

  return (
    <div
      data-testid="folder-tag-filter"
      className="mt-2 rounded border border-slate-300 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <TagIcon className="h-4 w-4 shrink-0 text-slate-400" />
        {selected.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ background: tag.color }}
          >
            {tag.name}
            <button
              type="button"
              onClick={() => onChange(ids.filter((x) => x !== tag.id))}
              aria-label={t("folder.tagFilter.remove", { name: tag.name })}
              className="rounded-full hover:bg-black/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="relative min-w-[12rem] flex-1">
          <input
            ref={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                e.preventDefault();
                add(matches[0].tag.id);
              } else if (e.key === "Backspace" && !text && ids.length > 0) {
                onChange(ids.slice(0, -1));
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={
              candidates.length > 0
                ? t("folder.tagFilter.placeholder")
                : t("folder.tagFilter.noMore")
            }
            aria-label={t("folder.tagFilter.placeholder")}
            className="w-full bg-transparent py-1 text-sm outline-none"
          />
          {open && matches.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full min-w-[14rem] overflow-y-auto rounded border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              {matches.map((c) => (
                <li key={c.tag.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(c.tag.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: c.tag.color }}
                    />
                    <span className="flex-1 truncate">{c.tag.name}</span>
                    <span className="text-xs text-slate-400">{c.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {ids.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="ml-auto rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t("folder.tagFilter.clear")}
          </button>
        )}
      </div>
      {ids.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {t("folder.tagFilter.summary", {
            folders: resultFolders,
            bookmarks: resultBookmarks,
          })}
        </p>
      )}
    </div>
  );
}
