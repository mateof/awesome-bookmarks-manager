import type { Folder } from "@awesome-bookmarks/shared";
import { ChevronDown, ChevronRight, FolderClosed, Home } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal.js";

interface Props {
  folders: Folder[];
  /** Folders being moved — they and their descendants are invalid targets. */
  movingFolderIds: string[];
  /** Total items being moved, for the header count. */
  count: number;
  onClose: () => void;
  /** Resolve the move; `dest` is null for the root. */
  onConfirm: (dest: string | null) => void | Promise<void>;
  /** Optional label overrides so the picker can be reused (e.g. for import). */
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export function MoveToDialog({
  folders,
  movingFolderIds,
  count,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
}: Props) {
  const { t } = useTranslation();
  // undefined = nothing chosen yet; null = root; string = a folder id.
  const [dest, setDest] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState(false);
  // Folders start collapsed; the user expands them as needed.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const arr = m.get(f.parentId) ?? [];
      arr.push(f);
      m.set(f.parentId, arr);
    }
    return m;
  }, [folders]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // A folder can't move into itself or into any of its own descendants; the
  // API rejects it, but disabling those rows keeps the choice honest.
  const disabled = useMemo(() => {
    const blocked = new Set<string>(movingFolderIds);
    const stack = [...movingFolderIds];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const child of childrenOf.get(cur) ?? []) {
        if (!blocked.has(child.id)) {
          blocked.add(child.id);
          stack.push(child.id);
        }
      }
    }
    return blocked;
  }, [childrenOf, movingFolderIds]);

  const confirm = async () => {
    if (dest === undefined || pending) return;
    setPending(true);
    try {
      await onConfirm(dest);
    } finally {
      setPending(false);
    }
  };

  const renderNodes = (parentId: string | null, depth: number) =>
    (childrenOf.get(parentId) ?? []).map((f) => {
      const isDisabled = disabled.has(f.id);
      const isSelected = dest === f.id;
      const hasChildren = (childrenOf.get(f.id) ?? []).length > 0;
      const isOpen = expanded.has(f.id);
      return (
        <div key={f.id}>
          <div
            className={`flex items-center rounded ${
              isSelected
                ? "bg-blue-500/15 ring-1 ring-inset ring-blue-500"
                : ""
            }`}
            style={{ paddingLeft: depth * 16 }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(f.id)}
                aria-label={isOpen ? t("moveDialog.collapse") : t("moveDialog.expand")}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="w-6 shrink-0" />
            )}
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setDest(f.id)}
              className={`flex flex-1 items-center gap-2 rounded px-1 py-1.5 text-left text-sm ${
                isDisabled
                  ? "cursor-not-allowed text-slate-400 dark:text-slate-600"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <FolderClosed className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">{f.name}</span>
            </button>
          </div>
          {hasChildren && isOpen && renderNodes(f.id, depth + 1)}
        </div>
      );
    });

  return (
    <Modal title={title ?? t("moveDialog.title")} onClose={onClose} size="md">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {description ?? t("moveDialog.description", { count })}
      </p>
      <div className="max-h-[50vh] overflow-auto rounded border border-slate-200 p-1 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setDest(null)}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
            dest === null
              ? "bg-blue-500/15 ring-1 ring-inset ring-blue-500"
              : "hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Home className="h-4 w-4 shrink-0 text-slate-500" />
          <span>{t("moveDialog.root")}</span>
        </button>
        {renderNodes(null, 0)}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {t("moveDialog.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={dest === undefined || pending}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {pending
            ? t("moveDialog.moving")
            : (confirmLabel ?? t("moveDialog.confirm"))}
        </button>
      </div>
    </Modal>
  );
}
