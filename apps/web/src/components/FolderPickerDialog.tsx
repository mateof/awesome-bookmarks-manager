import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Folder } from "@awesome-bookmarks/shared";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderPlus,
  Home,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
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
 *
 * Folders can also be **created here**, under any folder in the tree. Filing a
 * link is when you find out the folder you wanted does not exist yet, and
 * leaving to make it means losing what you were sharing.
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
  const qc = useQueryClient();
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

  /** Which folder has the "new folder" line open under it, `null` for root. */
  const [creatingIn, setCreatingIn] = useState<{ parentId: string | null } | null>(
    null,
  );

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = useMutation({
    mutationFn: (vars: { name: string; parentId: string | null }) =>
      api.createFolder({ name: vars.name, parentId: vars.parentId }),
    onSuccess: (_folder, vars) => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      // Open the branch it was created in, or the new folder would be made
      // somewhere the tree is not showing.
      if (vars.parentId) {
        setOpen((prev) => new Set(prev).add(vars.parentId as string));
      }
      setCreatingIn(null);
    },
  });

  /**
   * Created, but not chosen.
   *
   * It is tempting to pick it straight away, since making a folder here almost
   * always means saving into it — but picking closes the dialog, so the folder
   * you just made would flash past without ever being seen in place. It
   * appears under its parent instead, one tap away.
   */
  const submitNew = (name: string, parentId: string | null) => {
    const clean = name.trim();
    if (!clean || create.isPending) return;
    create.mutate({ name: clean, parentId });
  };

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
            <div
              className={`flex items-center gap-1 rounded ${
                value === null ? "bg-sky-50 dark:bg-sky-950/40" : ""
              }`}
            >
              <span className="h-7 w-6 shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onPick(null)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded py-1.5 pr-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Home className="h-4 w-4 shrink-0 text-slate-400" />
                {t("sidebar.home")}
              </button>
              <NewFolderButton
                label={t("folderPicker.newFolderIn", { name: t("sidebar.home") })}
                onClick={() => setCreatingIn({ parentId: null })}
              />
            </div>
            {creatingIn && creatingIn.parentId === null && (
              <NewFolderRow
                depth={0}
                pending={create.isPending}
                onCancel={() => setCreatingIn(null)}
                onCreate={(name) => submitNew(name, null)}
              />
            )}
            {(children.get(null) ?? []).map((f) => (
              <Row
                key={f.id}
                folder={f}
                depth={0}
                childrenOf={children}
                open={open}
                value={value}
                creatingIn={creatingIn}
                pending={create.isPending}
                onToggle={toggle}
                onPick={onPick}
                onStartCreate={(parentId) => setCreatingIn({ parentId })}
                onCancelCreate={() => setCreatingIn(null)}
                onCreate={submitNew}
              />
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

interface RowProps {
  folder: Folder;
  depth: number;
  childrenOf: Map<string | null, Folder[]>;
  open: Set<string>;
  value: string | null;
  creatingIn: { parentId: string | null } | null;
  pending: boolean;
  onToggle: (id: string) => void;
  onPick: (id: string | null) => void;
  onStartCreate: (parentId: string) => void;
  onCancelCreate: () => void;
  onCreate: (name: string, parentId: string | null) => void;
}

/**
 * One folder in the tree, and its open branch under it.
 *
 * Defined out here rather than inside the dialog on purpose. A component
 * declared in the body is a new type on every render, so React throws the
 * whole subtree away and builds it again — which with an input in it means the
 * caret leaves the box after each letter typed. It also means two hundred rows
 * remounting every time anything changes.
 */
function Row({
  folder,
  depth,
  childrenOf,
  open,
  value,
  creatingIn,
  pending,
  onToggle,
  onPick,
  onStartCreate,
  onCancelCreate,
  onCreate,
}: RowProps) {
  const { t } = useTranslation();
  const kids = childrenOf.get(folder.id) ?? [];
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
            onClick={() => onToggle(folder.id)}
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
            /* Decorative: read out, it is a bare number after the folder's
               name with nothing saying what it counts. The chevron and its
               `aria-expanded` already carry "this one has things inside". */
            <span
              aria-hidden="true"
              className="shrink-0 text-[11px] text-slate-400"
            >
              {kids.length}
            </span>
          )}
        </button>
        <NewFolderButton
          label={t("folderPicker.newFolderIn", { name: folder.name })}
          onClick={() => onStartCreate(folder.id)}
        />
      </div>
      {creatingIn && creatingIn.parentId === folder.id && (
        <NewFolderRow
          depth={depth + 1}
          pending={pending}
          onCancel={onCancelCreate}
          onCreate={(name) => onCreate(name, folder.id)}
        />
      )}
      {isOpen &&
        kids.map((k) => (
          <Row
            key={k.id}
            folder={k}
            depth={depth + 1}
            childrenOf={childrenOf}
            open={open}
            value={value}
            creatingIn={creatingIn}
            pending={pending}
            onToggle={onToggle}
            onPick={onPick}
            onStartCreate={onStartCreate}
            onCancelCreate={onCancelCreate}
            onCreate={onCreate}
          />
        ))}
    </>
  );
}

/** Always visible, not on hover: on a phone there is no hover to reveal it. */
function NewFolderButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <FolderPlus className="h-4 w-4" />
    </button>
  );
}

/** The name of the folder being created, in place, where it will appear. */
function NewFolderRow({
  depth,
  pending,
  onCancel,
  onCreate,
}: {
  depth: number;
  pending: boolean;
  onCancel: () => void;
  onCreate: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  return (
    <div
      className="flex items-center gap-1 py-0.5"
      style={{ paddingLeft: depth * 14 }}
      data-testid="new-folder-row"
    >
      <span className="h-7 w-6 shrink-0" aria-hidden="true" />
      <FolderClosed className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCreate(name);
          }
          if (e.key === "Escape") {
            // The dialog closes on Escape from a listener on `document`, so
            // without this, giving up on the name would throw away the whole
            // picker and whatever was already chosen in it.
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder={t("folderPicker.newFolderName")}
        aria-label={t("folderPicker.newFolderName")}
        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-900"
      />
      <button
        type="button"
        onClick={() => onCreate(name)}
        disabled={pending || name.trim().length === 0}
        title={t("common.create")}
        aria-label={t("common.create")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 dark:hover:bg-emerald-950/40"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        title={t("common.cancel")}
        aria-label={t("common.cancel")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
