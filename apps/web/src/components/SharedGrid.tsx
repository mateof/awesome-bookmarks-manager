import { useMutation } from "@tanstack/react-query";
import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import {
  ExternalLink,
  FolderInput,
  Palette,
  PencilLine,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isConflict } from "../api.js";
import {
  asBookmark,
  asFolder,
  shareSource,
  tagsOf,
} from "../lib/shareAdapter.js";
import { useViewMode } from "../view-mode.js";
import { AppearanceDialog } from "./AppearanceDialog.js";
import { dlg } from "./dialogs.js";
import {
  Body,
  EntitySourceProvider,
  type SelectionKey,
} from "./EntityGrid.js";
import { MoveToDialog } from "./MoveToDialog.js";
import type {
  SharedFolderPayload,
  SharedPayload,
} from "./SharedNodeEditor.js";
import { ViewModeToggle } from "./ViewModeToggle.js";

/**
 * A shared folder drawn with the *same* grid as your own folders.
 *
 * The point of the exercise: five view modes, the same cards, the same kebab,
 * and the same dialogs behind its entries — the appearance dialog here is the
 * personal one with its destination swapped, not a lookalike. What differs is
 * where the data comes from and where each edit is sent, and both of those are
 * arguments rather than a second implementation.
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
  const [appearance, setAppearance] = useState<string | null>(null);

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
    onError: async (e) =>
      dlg.alert(errorText(e, t("common.conflict"), t("common.error"))),
  });

  const nodeById = (id: string): SharedPayload | null => {
    const f = node.subfolders.find((x) => x.id === id);
    if (f) return f;
    return node.bookmarks.find((x) => x.id === id) ?? null;
  };

  // The same entries, in the same order, as a personal card's kebab offers
  // for the operations a share supports.
  const shared = (id: string, label: string) => [
    {
      label: String(t("common.edit")),
      icon: <PencilLine className="h-4 w-4" />,
      onClick: () => {
        const n = nodeById(id);
        if (n) onEdit(n);
      },
    },
    {
      label: String(t("background.kebabItem")),
      icon: <Palette className="h-4 w-4" />,
      onClick: () => setAppearance(id),
    },
    {
      label: String(t("folder.moveKebab")),
      icon: <FolderInput className="h-4 w-4" />,
      onClick: () => setMoving({ id, label }),
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

  const appearanceRow =
    appearance !== null
      ? (subfolders.find((f) => f.id === appearance) ??
        items.find((b) => b.id === appearance) ??
        null)
      : null;

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
          folderKebab={(f: Folder) => (canEdit ? shared(f.id, f.name) : [])}
          bookmarkKebab={(b: Bookmark) =>
            canEdit
              ? [...readOnlyKebab(b.url), ...shared(b.id, b.title)]
              : readOnlyKebab(b.url)
          }
          onNavFolder={onOpen}
        />
      </EntitySourceProvider>

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
              await api.moveSharedNode(shareId, moving.id, dest, undefined, baseRev);
              onDone();
            } catch (e) {
              await dlg.alert(
                errorText(e, t("common.conflict"), t("common.error")),
              );
            }
            setMoving(null);
          }}
        />
      )}

      {appearanceRow && (
        <AppearanceDialog
          target={
            "url" in appearanceRow
              ? { kind: "bookmark", bookmark: appearanceRow as Bookmark }
              : { kind: "folder", folder: appearanceRow as Folder }
          }
          io={shareAppearanceIo(shareId, appearanceRow, onDone)}
          onClose={() => setAppearance(null)}
          onSaved={onDone}
        />
      )}
    </>
  );
}

/**
 * The personal appearance dialog pointed at a share: images go to the share's
 * asset store, colour and tone go through the share's appearance operation.
 */
export function shareAppearanceIo(
  shareId: string,
  row: { id: string; imageBlobPath?: string | null },
  onDone: () => void,
) {
  return {
    imageUrl: row.imageBlobPath
      ? api.sharedAssetUrl(shareId, row.id, "image", row.imageBlobPath)
      : null,
    uploadImage: async (file: File) => {
      await api.uploadSharedAsset(shareId, row.id, "image", file);
      onDone();
    },
    clearImage: async () => {
      await api.clearSharedAsset(shareId, row.id);
      onDone();
    },
    save: (v: { bgColor: string | null; textTone: "auto" | "light" | "dark" }) =>
      api.setSharedAppearance(shareId, row.id, {
        bgColor: v.bgColor,
        textTone: v.textTone === "auto" ? null : v.textTone,
      }),
  };
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
