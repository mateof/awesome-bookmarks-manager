import { useMutation } from "@tanstack/react-query";
import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import {
  ExternalLink,
  FolderInput,
  Image as ImageIcon,
  Palette,
  PencilLine,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isConflict } from "../api.js";
import {
  asBookmark,
  asFolder,
  shareSource,
  tagsOf,
} from "../lib/shareAdapter.js";
import { useViewMode } from "../view-mode.js";
import { dlg } from "./dialogs.js";
import {
  Body,
  EntitySourceProvider,
  type SelectionKey,
} from "./EntityGrid.js";
import { Modal } from "./Modal.js";
import { MoveToDialog } from "./MoveToDialog.js";
import { TagPicker } from "./TagPicker.js";
import type {
  SharedFolderPayload,
  SharedPayload,
} from "./SharedNodeEditor.js";
import { ViewModeToggle } from "./ViewModeToggle.js";

/**
 * A shared folder drawn with the *same* grid as your own folders.
 *
 * The point of the exercise: five view modes, the same cards, the same kebab.
 * What differs is where the data comes from and what each menu entry calls,
 * and both of those are arguments rather than a second implementation.
 *
 * What a member cannot do, and why, is in `shareSource`: no starring (personal),
 * no drag-reordering (the payload carries no order to store), no snapshots.
 */
export function SharedGrid({
  shareId,
  node,
  canEdit,
  baseRev,
  root,
  onOpen,
  onEdit,
  onDone,
}: {
  shareId: string;
  /** The folder currently open inside the share. */
  node: SharedFolderPayload;
  canEdit: boolean;
  baseRev: number;
  /** The whole share, for the "move to" picker. */
  root: SharedFolderPayload;
  onOpen: (id: string) => void;
  onEdit: (node: SharedPayload) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { mode } = useViewMode();
  const [selection, setSelection] = useState<Set<SelectionKey>>(new Set());
  const [moving, setMoving] = useState<{ id: string; label: string } | null>(null);
  const [tagging, setTagging] = useState<{ id: string; tags: string[] } | null>(
    null,
  );
  const [colouring, setColouring] = useState<{
    id: string;
    bgColor: string | null;
  } | null>(null);

  const source = useMemo(
    () => shareSource(shareId, baseRev, onDone),
    [shareId, baseRev, onDone],
  );
  const subfolders = node.subfolders.map((f, i) => asFolder(f, node.id, i));
  const items = node.bookmarks.map((b, i) => asBookmark(b, node.id, i));
  const allTags = useMemo(
    () => [
      ...new Map(
        [...node.subfolders, ...node.bookmarks]
          .flatMap((n) => tagsOf(n))
          .map((tg) => [tg.id, tg]),
      ).values(),
    ],
    [node],
  );

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSharedNode(shareId, id, baseRev),
    onSuccess: onDone,
    onError: async (e) => dlg.alert(errorText(e, t("common.conflict"), t("common.error"))),
  });

  /**
   * Uploading an image is a file input, and a kebab entry cannot be one, so a
   * single hidden input is driven from whichever entry was clicked.
   */
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ id: string; kind: "icon" | "image" } | null>(null);
  const pickImage = (id: string, kind: "icon" | "image") => {
    pending.current = { id, kind };
    fileRef.current?.click();
  };

  const nodeById = (id: string): SharedPayload | null => {
    const f = node.subfolders.find((x) => x.id === id);
    if (f) return f;
    return node.bookmarks.find((x) => x.id === id) ?? null;
  };

  const shared = (id: string, label: string, tags: string[], bgColor: string | null) => [
    {
      label: String(t("common.edit")),
      icon: <PencilLine className="h-4 w-4" />,
      onClick: () => {
        const n = nodeById(id);
        if (n) onEdit(n);
      },
    },
    {
      label: String(t("folder.moveKebab")),
      icon: <FolderInput className="h-4 w-4" />,
      onClick: () => setMoving({ id, label }),
    },
    {
      label: String(t("tags.pageTitle")),
      icon: <TagIcon className="h-4 w-4" />,
      onClick: () => setTagging({ id, tags }),
    },
    {
      label: String(t("background.dialogTitle")),
      icon: <Palette className="h-4 w-4" />,
      onClick: () => setColouring({ id, bgColor }),
    },
    {
      label: String(t("sharedEdit.icon")),
      icon: <ImageIcon className="h-4 w-4" />,
      onClick: () => pickImage(id, "icon"),
    },
    {
      label: String(t("sharedEdit.background")),
      icon: <ImageIcon className="h-4 w-4" />,
      onClick: () => pickImage(id, "image"),
    },
    {
      label: String(t("common.delete")),
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      onClick: async () => {
        if (
          !(await dlg.confirm({
            message: t("sharedEdit.confirmDelete", { name: label }),
            danger: true,
          }))
        )
          return;
        remove.mutate(id);
      },
    },
  ];

  const readOnlyKebab = (url?: string) =>
    url
      ? [
          {
            label: String(t("bookmark.openUrl")),
            icon: <ExternalLink className="h-4 w-4" />,
            onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
          },
        ]
      : [];

  return (
    <>
      <div className="flex items-center justify-end">
        <ViewModeToggle />
      </div>

      <EntitySourceProvider source={source}>
        <Body
          mode={mode}
          subfolders={subfolders}
          items={items}
          allTags={allTags}
          selection={selection}
          toggle={(k) =>
            setSelection((prev) => {
              const next = new Set(prev);
              if (next.has(k)) next.delete(k);
              else next.add(k);
              return next;
            })
          }
          countDirectItems={(id) => {
            const f = node.subfolders.find((x) => x.id === id);
            return f ? f.subfolders.length + f.bookmarks.length : 0;
          }}
          folderKebab={(f: Folder) =>
            canEdit
              ? shared(f.id, f.name, f.tagIds ?? [], f.bgColor ?? null)
              : []
          }
          bookmarkKebab={(b: Bookmark) =>
            canEdit
              ? [
                  ...readOnlyKebab(b.url),
                  ...shared(b.id, b.title, b.tagIds ?? [], b.bgColor ?? null),
                ]
              : readOnlyKebab(b.url)
          }
          onNavFolder={onOpen}
        />
      </EntitySourceProvider>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const at = pending.current;
          pending.current = null;
          if (!file || !at) return;
          try {
            await api.uploadSharedAsset(shareId, at.id, at.kind, file);
            onDone();
          } catch (err) {
            await dlg.alert(
              errorText(err, t("common.conflict"), t("common.error")),
            );
          }
        }}
      />

      {moving && (
        <MoveToDialog
          folders={foldersForPicker(root)}
          movingFolderIds={[moving.id]}
          count={1}
          title={t("folder.moveKebab")}
          confirmLabel={t("folder.selectionMove")}
          onClose={() => setMoving(null)}
          onConfirm={async (dest) => {
            try {
              await api.moveSharedNode(shareId, moving.id, dest, baseRev);
              onDone();
            } catch (e) {
              await dlg.alert(errorText(e, t("common.conflict"), t("common.error")));
            }
            setMoving(null);
          }}
        />
      )}

      {tagging && (
        <TagsDialog
          shareId={shareId}
          nodeId={tagging.id}
          names={tagging.tags}
          baseRev={baseRev}
          onClose={() => setTagging(null)}
          onDone={onDone}
        />
      )}

      {colouring && (
        <ColourDialog
          shareId={shareId}
          nodeId={colouring.id}
          bgColor={colouring.bgColor}
          baseRev={baseRev}
          onClose={() => setColouring(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function errorText(e: unknown, conflict: string, generic: string): string {
  if (isConflict(e)) return conflict;
  return e instanceof Error ? e.message : generic;
}

/** The share's folders as the move picker's flat list. Only folders inside the
 * share: moving something out of it is not this dialog's job. */
function foldersForPicker(root: SharedFolderPayload): Folder[] {
  const out: Folder[] = [];
  const walk = (f: SharedFolderPayload, parentId: string | null) => {
    out.push(asFolder(f, parentId, out.length));
    for (const sub of f.subfolders) walk(sub, f.id);
  };
  walk(root, null);
  return out;
}

function TagsDialog({
  shareId,
  nodeId,
  names,
  baseRev,
  onClose,
  onDone,
}: {
  shareId: string;
  nodeId: string;
  names: string[];
  baseRev: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  // The picker speaks tag ids from your own account; in a share the name is
  // the identity, so it round-trips through names on the way in and out.
  const [value, setValue] = useState<string[]>(names);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.setSharedTags(shareId, nodeId, value, baseRev),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => setErr(errorText(e, t("common.conflict"), t("common.error"))),
  });
  return (
    <Modal title={t("tags.pageTitle")} onClose={onClose}>
      <div className="space-y-2">
        <SharedTagPicker value={value} onChange={setValue} />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <DialogButtons
          pending={save.isPending}
          onCancel={onClose}
          onSave={() => save.mutate()}
        />
      </div>
    </Modal>
  );
}

/** The normal picker, driven by names instead of ids. */
function SharedTagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return <TagPicker value={value} onChange={onChange} byName />;
}

function ColourDialog({
  shareId,
  nodeId,
  bgColor,
  baseRev,
  onClose,
  onDone,
}: {
  shareId: string;
  nodeId: string;
  bgColor: string | null;
  baseRev: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [colour, setColour] = useState(bgColor ?? "#ffffff");
  const [none, setNone] = useState(bgColor === null);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.setSharedAppearance(shareId, nodeId, {
        bgColor: none ? null : colour,
        baseRev,
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => setErr(errorText(e, t("common.conflict"), t("common.error"))),
  });
  return (
    <Modal title={t("background.dialogTitle")} onClose={onClose}>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={none}
            onChange={(e) => setNone(e.target.checked)}
          />
          {t("sharedEdit.noBackground")}
        </label>
        {!none && (
          <input
            type="color"
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            className="h-10 w-full rounded border border-slate-300 dark:border-slate-700"
          />
        )}
        {err && <div className="text-sm text-red-600">{err}</div>}
        <DialogButtons
          pending={save.isPending}
          onCancel={onClose}
          onSave={() => save.mutate()}
        />
      </div>
    </Modal>
  );
}

function DialogButtons({
  pending,
  onCancel,
  onSave,
}: {
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
      >
        {t("common.cancel")}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onSave}
        className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {pending ? t("common.saving") : t("common.save")}
      </button>
    </div>
  );
}
