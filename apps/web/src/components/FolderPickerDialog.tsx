import type { Folder } from "@awesome-bookmarks/shared";
import { ChevronDown, ChevronRight, FolderClosed, Home, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildFolderPath } from "../hooks.js";
import { foldText } from "../lib/emojiCatalog.js";
import { Modal } from "./Modal.js";

/**
 * Choosing a folder out of a lot of folders.
 *
 * The share target used a `<select>` with every folder in it, one flat line
 * each, labelled with its whole path. That is fine for a dozen and unusable
 * for two hundred: a native picker on a phone has no search, the list is as
 * long as the library, and the shape of the library — which is the thing you
 * actually navigate by — is flattened into repeated prefixes.
 *
 * So: a tree you open one branch at a time, and a search that ignores the
 * tree. Both are needed and neither replaces the other. You know roughly where
 * a folder lives (tree) or you know roughly what it is called (search), and
 * which of the two you have changes from one save to the next.
 */
export function FolderPickerDialog({
  folders,
  value,
  onPick,
  onClose,
}: {
  folders: Folder[];
  /** null is the root. */
  value: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  // Linked shares and aliases are pointers at somebody else's folder or at
  // another of your own: saving "into" one is not a thing you can do.
  const usable = useMemo(
    () => folders.filter((f) => !f.linkedShareId && !f.aliasOf),
    [folders],
  );

  const children = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    for (const f of usable) {
      const list = map.get(f.parentId ?? null) ?? [];
      list.push(f);
      map.set(f.parentId ?? null, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [usable]);

  /**
   * The branch holding the current selection starts open.
   *
   * Opening a picker on a collapsed tree that does not show where you already
   * are makes you find it again to confirm it is still what you wanted.
   */
  const [open, setOpen] = useState<Set<string>>(() => {
    const path = value ? buildFolderPath(folders, value) : [];
    return new Set(path.map((f) => f.id));
  });

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pathOf = (id: string) =>
    buildFolderPath(folders, id)
      .map((f) => f.name)
      .join(" / ");

  const results = useMemo(() => {
    const needle = foldText(query.trim());
    if (!needle) return [];
    return usable
      .map((f) => ({ f, path: pathOf(f.id) }))
      .filter((x) => foldText(x.path).includes(needle))
      // A name that starts with what was typed first: typing "cont" almost
      // always means the folder called "Contratos", not one three levels down
      // that merely mentions it in its path.
      .sort((a, b) => {
        const as = foldText(a.f.name).startsWith(needle) ? 0 : 1;
        const bs = foldText(b.f.name).startsWith(needle) ? 0 : 1;
        return as - bs || a.path.localeCompare(b.path);
      })
      .slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, usable, folders]);

  const Row = ({
    folder,
    depth,
  }: {
    folder: Folder;
    depth: number;
  }) => {
    const kids = children.get(folder.id) ?? [];
    const isOpen = open.has(folder.id);
    return (
      <>
        <div
          className={`flex items-center gap-1 rounded ${
            value === folder.id ? "bg-sky-50 dark:bg-sky-950/40" : ""
          }`}
          style={{ paddingLeft: depth * 14 }}
        >
          {/* A leaf gets the same indent but no control: an empty button
              carrying the folder's name would be a second thing to tab to and
              a second thing read out, both of which do nothing. */}
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(folder.id)}
              aria-label={
                isOpen ? t("folderPicker.collapse") : t("folderPicker.expand")
              }
              aria-expanded={isOpen}
              className="flex h-7 w-6 shrink-0 items-center justify-center text-slate-400"
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="h-7 w-6 shrink-0" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={() => onPick(folder.id)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded py-1.5 pr-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <FolderClosed className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 truncate">{folder.name}</span>
            {kids.length > 0 && (
              <span className="shrink-0 text-[11px] text-slate-400">
                {kids.length}
              </span>
            )}
          </button>
        </div>
        {isOpen &&
          kids.map((k) => <Row key={k.id} folder={k} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <Modal title={t("folderPicker.title")} onClose={onClose} size="lg" fill>
      <div className="flex shrink-0 items-center gap-2 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-700">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("folderPicker.search")}
          aria-label={t("folderPicker.search")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="folder-picker">
        {query.trim() ? (
          <>
            {results.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-400">
                {t("folderPicker.noResults")}
              </p>
            )}
            {results.map(({ f, path }) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onPick(f.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  value === f.id ? "bg-sky-50 dark:bg-sky-950/40" : ""
                }`}
              >
                <FolderClosed className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{f.name}</span>
                  {/* The path is what tells two folders called "Facturas"
                      apart, which is the whole reason a flat list of names
                      would not do. */}
                  <span className="block truncate text-[11px] text-slate-400">
                    {path}
                  </span>
                </span>
              </button>
            ))}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onPick(null)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                value === null ? "bg-sky-50 dark:bg-sky-950/40" : ""
              }`}
            >
              <Home className="h-4 w-4 shrink-0 text-slate-400" />
              {t("sidebar.home")}
            </button>
            {(children.get(null) ?? []).map((f) => (
              <Row key={f.id} folder={f} depth={0} />
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
