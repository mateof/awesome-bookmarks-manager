import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import {
  ArrowUp,
  Check,
  ClipboardCopy,
  FileArchive,
  Copy,
  Download,
  ExternalLink,
  FolderClosed,
  FolderInput,
  FolderPlus,
  GripVertical,
  History,
  LayoutDashboard,
  Link2,
  ListTree,
  Palette,
  PencilLine,
  Plus,
  Share2,
  TabletSmartphone,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dlg } from "../components/dialogs.js";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, isConflict } from "../api.js";
import { copyRichLink } from "../lib/clipboard.js";
import { buildOutline, copyOutline } from "../lib/outline.js";
import { onAppCommand } from "../lib/commands.js";
import {
  lookStyle,
  useLookClass,
  type EntityLook,
} from "../lib/entityLook.js";
import { CopyButton } from "../components/CopyButton.js";
import { FavoriteToggle } from "../components/FavoriteToggle.js";
import { LetterIcon } from "../components/LetterIcon.js";
import { AppearanceDialog } from "../components/AppearanceDialog.js";
import { BackgroundPicker } from "../components/BackgroundPicker.js";
import { BookmarkEditDialog } from "../components/BookmarkEditDialog.js";
import { Breadcrumbs } from "../components/Breadcrumbs.js";
import { EntityBanner } from "../components/EntityBanner.js";
import { SharedBadge } from "../components/SharedBadge.js";
import { IconPicker } from "../components/IconPicker.js";
import { VersionHistory } from "../components/VersionHistory.js";
import { GeneratePanelDialog } from "../components/GeneratePanelDialog.js";
import { KebabMenu, type KebabItem } from "../components/KebabMenu.js";
import { Modal } from "../components/Modal.js";
import { MoveToDialog } from "../components/MoveToDialog.js";
import { RichTextEditor } from "../components/RichTextEditor.js";
import { Attachments } from "../components/Attachments.js";
import { CollapsibleRichText } from "../components/CollapsibleRichText.js";
import { DescriptionEditDialog } from "../components/DescriptionEditDialog.js";
import { InlineTags } from "../components/InlineTags.js";
import { ImportArchiveDialog } from "../components/ImportArchiveDialog.js";
import { ExportArchiveDialog } from "../components/ExportArchiveDialog.js";
import { ShareToGroup } from "../components/ShareToGroup.js";
import { TagChipList } from "../components/TagChip.js";
import { TagPicker } from "../components/TagPicker.js";
import { ViewModeToggle } from "../components/ViewModeToggle.js";
import {
  Body,
  EntitySourceProvider,
  PERSONAL_SOURCE,
  type BodyProps,
  type SelectionKey,
} from "../components/EntityGrid.js";
import {
  BOOKMARK_SORTABLE_IDS,
  FOLDER_SORTABLE_IDS,
  type SortableResult,
  useBookmarkSortable,
  useFolderSortable,
  useNestDrop,
} from "../dnd.js";
import { useViewMode, type ViewMode } from "../view-mode.js";
import type { Tag } from "@awesome-bookmarks/shared";
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";




export function FolderPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const folderId = id ?? null;
  const qc = useQueryClient();
  const nav = useNavigate();
  const { mode } = useViewMode();
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
  const allBookmarks = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const allTags = tagsQ.data ?? [];

  const folder = folders.data?.find((f) => f.id === folderId);
  const subfolders =
    folders.data?.filter((f) => f.parentId === folderId) ?? [];
  const items = (allBookmarks.data ?? []).filter(
    (b) => b.folderId === folderId,
  );

  // A linked-share portal has no real content; its home is the live view.
  useEffect(() => {
    if (folder?.linkedShareId) nav(`/linked/${folder.id}`, { replace: true });
  }, [folder?.linkedShareId, folder?.id, nav]);

  const [showAddBookmark, setShowAddBookmark] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showEditFolder, setShowEditFolder] = useState(false);
  const [showShareFolder, setShowShareFolder] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [appearanceTarget, setAppearanceTarget] = useState<
    | { kind: "folder"; folder: Folder }
    | { kind: "bookmark"; bookmark: Bookmark }
    | null
  >(null);
  const [selection, setSelection] = useState<Set<SelectionKey>>(
    () => new Set(),
  );
  const [moveTarget, setMoveTarget] = useState<{
    folderIds: string[];
    bookmarkIds: string[];
  } | null>(null);
  const [copyTarget, setCopyTarget] = useState<{
    kind: "folder" | "bookmark";
    id: string;
  } | null>(null);
  const [panelFolder, setPanelFolder] = useState<Folder | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copiedOutline, setCopiedOutline] = useState(false);
  const [editDescription, setEditDescription] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{
    kind: "folder" | "bookmark";
    id: string;
  } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["folders"] });
    qc.invalidateQueries({ queryKey: ["bookmarks"] });
    // Deletes are soft, so anything removed here lands in the trash and the
    // sidebar badge would otherwise lag behind.
    qc.invalidateQueries({ queryKey: ["trash"] });
  };

  const collectDescendantBookmarks = (rootId: string | null): string[] => {
    if (!folders.data || !allBookmarks.data) return [];
    const stack = [rootId];
    const out: string[] = [];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const b of allBookmarks.data) {
        if (b.folderId === cur) out.push(b.url);
      }
      for (const f of folders.data) {
        if (f.parentId === cur) stack.push(f.id);
      }
    }
    return out;
  };

  const countDirectItems = (fid: string): number => {
    const subs = folders.data?.filter((f) => f.parentId === fid).length ?? 0;
    const bks =
      allBookmarks.data?.filter((b) => b.folderId === fid).length ?? 0;
    return subs + bks;
  };

  const openAllInTabs = async (recursive: boolean) => {
    const urls = recursive
      ? collectDescendantBookmarks(folderId)
      : items.map((b) => b.url);
    if (urls.length === 0) return;
    if (
      urls.length > 20 &&
      !(await dlg.confirm(t("folder.confirmTooManyTabs", { count: urls.length })))
    ) {
      return;
    }
    for (const u of urls) window.open(u, "_blank", "noopener,noreferrer");
  };

  const toggle = (key: SelectionKey) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const clearSelection = () => setSelection(new Set());

  // Navigating to another folder starts a fresh selection. The page component
  // stays mounted across /folder/:id changes, so without this the action bar
  // would linger referring to items that are no longer on screen.
  useEffect(() => {
    setSelection(new Set());
  }, [folderId]);

  // The command palette lives in Layout, above this page, so "nueva carpeta"
  // and "nuevo bookmark" arrive as window events and open the dialogs here —
  // always in whatever folder the user is currently looking at.
  useEffect(
    () =>
      onAppCommand((command) => {
        if (command === "new-folder") setShowAddFolder(true);
        else if (command === "new-bookmark") setShowAddBookmark(true);
      }),
    [],
  );

  const selectedFolderIds = useMemo(
    () =>
      [...selection]
        .filter((k) => k.startsWith("folder:"))
        .map((k) => k.slice("folder:".length)),
    [selection],
  );
  const selectedBookmarkIds = useMemo(
    () =>
      [...selection]
        .filter((k) => k.startsWith("bookmark:"))
        .map((k) => k.slice("bookmark:".length)),
    [selection],
  );

  const openSelectionInTabs = async () => {
    if (selection.size === 0) return;
    const urls = new Set<string>();
    for (const fid of selectedFolderIds) {
      for (const u of collectDescendantBookmarks(fid)) urls.add(u);
    }
    if (allBookmarks.data) {
      for (const bid of selectedBookmarkIds) {
        const b = allBookmarks.data.find((x) => x.id === bid);
        if (b) urls.add(b.url);
      }
    }
    if (urls.size === 0) {
      await dlg.alert(t("folder.selectionNoLinks"));
      return;
    }
    if (
      urls.size > 20 &&
      !(await dlg.confirm(t("folder.confirmTooManyTabs", { count: urls.size })))
    ) {
      return;
    }
    for (const u of urls) window.open(u, "_blank", "noopener,noreferrer");
  };

  const exportSingle = async (
    target: { folderId: string } | { bookmarkId: string },
  ) => {
    try {
      await api.exportBookmarksHtml(
        "folderId" in target
          ? { folderIds: [target.folderId] }
          : { bookmarkIds: [target.bookmarkId] },
      );
    } catch (e) {
      await dlg.alert(
        e instanceof Error
          ? t("folder.couldNotExport", { message: e.message })
          : t("folder.couldNotExportGeneric"),
      );
    }
  };

  /**
   * The selection as a hierarchical list on the clipboard, folders expanded
   * all the way down. Markdown for chats, a nested list of links for email;
   * see lib/outline.
   */
  const copySelectionOutline = async () => {
    if (selection.size === 0) return;
    const outline = buildOutline(
      { folderIds: selectedFolderIds, bookmarkIds: selectedBookmarkIds },
      folders.data ?? [],
      allBookmarks.data ?? [],
    );
    if (outline.links === 0) {
      await dlg.alert(t("folder.selectionNoLinks"));
      return;
    }
    if (!(await copyOutline(outline))) {
      await dlg.alert(t("folder.couldNotCopy"));
      return;
    }
    // Same brief confirmation the single-link copy button gives, rather than a
    // modal: the selection stays put in case they want to paste it twice.
    setCopiedOutline(true);
    setTimeout(() => setCopiedOutline(false), 1500);
  };

  const exportSelection = async () => {
    if (selection.size === 0) return;
    try {
      await api.exportBookmarksHtml({
        folderIds: selectedFolderIds,
        bookmarkIds: selectedBookmarkIds,
      });
      clearSelection();
    } catch (e) {
      await dlg.alert(
        e instanceof Error
          ? t("folder.couldNotExport", { message: e.message })
          : t("folder.couldNotExportGeneric"),
      );
    }
  };

  const exportCurrentFolder = async () => {
    if (!folderId) {
      const ids = (folders.data ?? [])
        .filter((f) => f.parentId === null)
        .map((f) => f.id);
      const bIds = (allBookmarks.data ?? [])
        .filter((b) => b.folderId === null)
        .map((b) => b.id);
      if (ids.length === 0 && bIds.length === 0) {
        await dlg.alert(t("folder.nothingToExport"));
        return;
      }
      try {
        await api.exportBookmarksHtml({ folderIds: ids, bookmarkIds: bIds });
      } catch (e) {
        await dlg.alert(
          e instanceof Error
            ? t("folder.couldNotExport", { message: e.message })
            : t("folder.couldNotExportGeneric"),
        );
      }
      return;
    }
    await exportSingle({ folderId });
  };

  const deleteFolder = async (target: Folder) => {
    if (!(await dlg.confirm({
      message: t("folder.confirmDeleteFolder", { name: target.name }),
      danger: true,
    }))) return;
    try {
      await api.deleteFolder(target.id);
      invalidate();
      if (target.id === folderId) nav("/");
    } catch (e) {
      await dlg.alert(
        e instanceof Error
          ? t("folder.couldNotDelete", { message: e.message })
          : t("folder.couldNotDeleteGeneric"),
      );
    }
  };

  const deleteBookmark = async (b: Bookmark) => {
    if (!(await dlg.confirm({
      message: t("folder.confirmDeleteBookmark", { title: b.title }),
      danger: true,
    }))) return;
    try {
      await api.deleteBookmark(b.id);
      invalidate();
    } catch (e) {
      await dlg.alert(
        e instanceof Error
          ? t("folder.couldNotDelete", { message: e.message })
          : t("folder.couldNotDeleteGeneric"),
      );
    }
  };

  const deleteSelection = async () => {
    if (selection.size === 0) return;
    if (
      !(await dlg.confirm({
        message: t("folder.confirmDeleteSelection", { count: selection.size }),
        danger: true,
      }))
    ) {
      return;
    }
    const failures: string[] = [];
    await Promise.all([
      ...selectedFolderIds.map((id) =>
        api.deleteFolder(id).catch((e) => {
          failures.push(
            t("folder.folderBatchError", {
              id,
              message: e instanceof Error ? e.message : t("common.error"),
            }),
          );
        }),
      ),
      ...selectedBookmarkIds.map((id) =>
        api.deleteBookmark(id).catch((e) => {
          failures.push(
            t("folder.bookmarkBatchError", {
              id,
              message: e instanceof Error ? e.message : t("common.error"),
            }),
          );
        }),
      ),
    ]);
    clearSelection();
    invalidate();
    if (failures.length > 0) await dlg.alert(failures.join("\n"));
  };

  // Move folders/bookmarks into `dest` (null = root). Position 0 mirrors the
  // drag-to-nest path so both entry points behave the same.
  const moveItems = async (
    ids: { folderIds: string[]; bookmarkIds: string[] },
    dest: string | null,
  ) => {
    const failures: string[] = [];
    await Promise.all([
      ...ids.folderIds.map((id) =>
        api.moveFolder(id, dest, 0).catch((e) => {
          failures.push(
            t("folder.folderBatchError", {
              id,
              message: e instanceof Error ? e.message : t("common.error"),
            }),
          );
        }),
      ),
      ...ids.bookmarkIds.map((id) =>
        api.moveBookmark(id, dest, 0).catch((e) => {
          failures.push(
            t("folder.bookmarkBatchError", {
              id,
              message: e instanceof Error ? e.message : t("common.error"),
            }),
          );
        }),
      ),
    ]);
    invalidate();
    if (failures.length > 0) await dlg.alert(failures.join("\n"));
  };

  const folderKebab = (f: Folder): KebabItem[] => [
    {
      label: t("folder.editFolderKebab"),
      icon: <PencilLine className="h-4 w-4" />,
      onClick: () => setEditingFolder(f),
    },
    {
      label: t("folder.moveKebab"),
      icon: <FolderInput className="h-4 w-4" />,
      onClick: () => setMoveTarget({ folderIds: [f.id], bookmarkIds: [] }),
    },
    {
      label: t("folder.copyKebab"),
      icon: <Copy className="h-4 w-4" />,
      onClick: () => setCopyTarget({ kind: "folder", id: f.id }),
    },
    ...(f.aliasOf
      ? []
      : [
          {
            label: t("folder.linkKebab"),
            icon: <Link2 className="h-4 w-4" />,
            onClick: () => setLinkTarget({ kind: "folder", id: f.id }),
          },
        ]),
    {
      label: t("panels.generateKebab"),
      icon: <LayoutDashboard className="h-4 w-4" />,
      onClick: () => setPanelFolder(f),
    },
    {
      label: t("background.kebabItem"),
      icon: <Palette className="h-4 w-4" />,
      onClick: () => setAppearanceTarget({ kind: "folder", folder: f }),
    },
    {
      label: t("folder.exportFolderKebab"),
      icon: <Download className="h-4 w-4" />,
      onClick: () => void exportSingle({ folderId: f.id }),
    },
    {
      label: t("folder.deleteFolderKebab"),
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      onClick: () => void deleteFolder(f),
    },
  ];

  const bookmarkKebab = (b: Bookmark): KebabItem[] => [
    {
      label: t("folder.editBookmarkKebab"),
      icon: <PencilLine className="h-4 w-4" />,
      onClick: () => setEditingBookmark(b),
    },
    {
      label: t("folder.moveKebab"),
      icon: <FolderInput className="h-4 w-4" />,
      onClick: () => setMoveTarget({ folderIds: [], bookmarkIds: [b.id] }),
    },
    {
      label: t("folder.copyKebab"),
      icon: <Copy className="h-4 w-4" />,
      onClick: () => setCopyTarget({ kind: "bookmark", id: b.id }),
    },
    ...(b.aliasOf
      ? []
      : [
          {
            label: t("folder.linkKebab"),
            icon: <Link2 className="h-4 w-4" />,
            onClick: () => setLinkTarget({ kind: "bookmark", id: b.id }),
          },
        ]),
    {
      label: t("folder.copyLinkKebab"),
      icon: <ClipboardCopy className="h-4 w-4" />,
      onClick: () => void copyRichLink(b.title, b.url),
    },
    {
      label: t("background.kebabItem"),
      icon: <Palette className="h-4 w-4" />,
      onClick: () => setAppearanceTarget({ kind: "bookmark", bookmark: b }),
    },
    {
      label: t("folder.exportBookmarkKebab"),
      icon: <Download className="h-4 w-4" />,
      onClick: () => void exportSingle({ bookmarkId: b.id }),
    },
    {
      label: t("folder.deleteBookmarkKebab"),
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      onClick: () => void deleteBookmark(b),
    },
  ];

  const hasCover = !!(folder && (folder.imageBlobPath || folder.bgColor));
  const folderIconNode = folder?.iconBlobPath ? (
    <img
      src={api.folderIconUrl(folder.id, folder.updatedAt)}
      alt=""
      className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-md ring-2 ring-white/70"
    />
  ) : (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/85 shadow-md ring-2 ring-white/70 dark:bg-slate-800">
      <FolderClosed className="h-7 w-7 text-slate-500" />
    </div>
  );
  // What the group role allows, in one place. The root (no folder) is always
  // your own, so there is nothing to be a viewer of.
  const canWrite = folder ? folder.canWrite : true;

  const headerControls = (
    <>
      <ViewModeToggle />
      <KebabMenu
        items={[
          ...(folderId && items.length > 0
            ? [
                {
                  label: t("folder.openDirect"),
                  icon: <TabletSmartphone className="h-4 w-4" />,
                  onClick: () => openAllInTabs(false),
                },
              ]
            : []),
          ...(folderId
            ? [
                {
                  label: t("folder.openAll"),
                  icon: <ExternalLink className="h-4 w-4" />,
                  onClick: () => openAllInTabs(true),
                },
              ]
            : []),
          {
            label: t("folder.exportButton"),
            icon: <Download className="h-4 w-4" />,
            onClick: () => void exportCurrentFolder(),
          },
          {
            // The app's own format: keeps tags, descriptions, colours, icons
            // and favourites, none of which survive the Netscape HTML export.
            // It opens a dialog rather than downloading on the spot because
            // the passphrase and the snapshots are choices only the user can
            // make.
            label: t("archive.exportFolder"),
            icon: <FileArchive className="h-4 w-4" />,
            onClick: () => setExportOpen(true),
          },
          {
            label: t("archive.importHere"),
            icon: <Upload className="h-4 w-4" />,
            onClick: () => setImportOpen(true),
          },
          ...(folder
            ? [
                {
                  label: t("folder.editFolder"),
                  icon: <PencilLine className="h-4 w-4" />,
                  onClick: () => setShowEditFolder(true),
                },
                {
                  label: t("folder.shareWithGroup"),
                  icon: <Share2 className="h-4 w-4" />,
                  onClick: () => setShowShareFolder(true),
                },
                {
                  label: t("versions.title"),
                  icon: <History className="h-4 w-4" />,
                  onClick: () => setShowHistory(true),
                },
              ]
            : []),
          ...(folder
            ? [
                {
                  label: t("folder.deleteFolderKebab"),
                  icon: <Trash2 className="h-4 w-4" />,
                  danger: true,
                  onClick: () => void deleteFolder(folder),
                },
              ]
            : []),
        ]}
      />
      {/* A viewer of a shared folder reaches this page like anybody else now,
          so the buttons have to say what they may do. Offering a create that
          comes back 403 is worse than not offering it. */}
      {canWrite && (
        <>
          <button
            onClick={() => setShowAddFolder(true)}
            title={t("folder.quickAddFolder")}
            aria-label={t("folder.quickAddFolder")}
            className="rounded border border-slate-300 p-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowAddBookmark(true)}
            title={t("folder.quickAddBookmark")}
            aria-label={t("folder.quickAddBookmark")}
            className="rounded bg-slate-900 p-1.5 text-white dark:bg-slate-100 dark:text-slate-900"
          >
            <Plus className="h-4 w-4" />
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {folderId && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              nav(folder?.parentId ? `/folder/${folder.parentId}` : "/")
            }
            title={t("folder.upLevel")}
            aria-label={t("folder.upLevel")}
            className="shrink-0 rounded border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <Breadcrumbs folderId={folderId} />
        </div>
      )}

      {hasCover ? (
        <EntityBanner
          textTone={folder!.textTone}
          imageUrl={
            folder!.imageBlobPath
              ? api.folderBgImageUrl(folder!.id, folder!.updatedAt)
              : null
          }
          bgColor={folder!.bgColor}
          icon={folderIconNode}
          title={folder!.name}
          subtitle={
            folder!.shareOrigin
              ? t("folder.sharedFrom", { group: folder!.shareOrigin })
              : folder!.shared && !folder!.mine
                ? `${t("folder.shared")} · ${
                    folder!.canWrite ? t("shared.canEdit") : t("shared.readOnly")
                  }`
                : undefined
          }
          actions={headerControls}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {folder?.iconBlobPath && (
            <img
              src={api.folderIconUrl(folder.id, folder.updatedAt)}
              alt=""
              className="h-10 w-10 rounded object-cover"
            />
          )}
          <h1 className="text-xl font-semibold">
            {folder?.name ?? t("folder.rootTitle")}
          </h1>
          {folder?.shareOrigin && (
            <span
              title={t("folder.sharedFrom", { group: folder.shareOrigin })}
              className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            >
              <Share2 className="h-3 w-3" /> {t("folder.shared")}
            </span>
          )}
          {/* Reached through a group rather than owned. `shareOrigin` above is
              a different thing: an imported copy, which *is* yours. */}
          {folder?.shared && !folder.mine && (
            <SharedBadge canWrite={folder.canWrite} />
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {headerControls}
          </div>
        </div>
      )}

      {folder && (
        <InlineTags
          entity="folder"
          id={folder.id}
          tagIds={folder.tagIds ?? []}
          canEdit={canWrite}
          onSaved={() => qc.invalidateQueries({ queryKey: ["folders"] })}
        />
      )}

      {folder?.description && (
        <CollapsibleRichText
          html={folder.description}
          {...(canWrite ? { onEdit: () => setEditDescription(true) } : {})}
        />
      )}

      {folder && (
        <Attachments entity="folder" id={folder.id} canEdit={canWrite} />
      )}

      {editDescription && folder && (
        <DescriptionEditDialog
          entity="folder"
          id={folder.id}
          title={folder.name}
          html={folder.description ?? ""}
          baseRev={folder.rev}
          onClose={() => setEditDescription(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["folders"] });
          }}
        />
      )}

      {selection.size > 0 && (
        <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <span className="text-sm font-medium">
            {t("folder.selectionCount", { count: selection.size })}
          </span>
          <button
            onClick={openSelectionInTabs}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            title={t("folder.selectionOpenTabsTitle")}
          >
            <ExternalLink className="h-4 w-4" /> {t("folder.selectionOpenTabs")}
          </button>
          <button
            onClick={() =>
              setMoveTarget({
                folderIds: selectedFolderIds,
                bookmarkIds: selectedBookmarkIds,
              })
            }
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <FolderInput className="h-4 w-4" /> {t("folder.selectionMove")}
          </button>
          <button
            onClick={copySelectionOutline}
            title={t("folder.selectionCopyListTitle")}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {copiedOutline ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <ListTree className="h-4 w-4" />
            )}{" "}
            {copiedOutline
              ? t("folder.selectionCopied")
              : t("folder.selectionCopyList")}
          </button>
          <button
            onClick={exportSelection}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" /> {t("folder.selectionExport")}
          </button>
          <button
            onClick={deleteSelection}
            className="flex items-center gap-1 rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
          >
            <Trash2 className="h-4 w-4" /> {t("folder.selectionDelete")}
          </button>
          <button
            onClick={clearSelection}
            className="ml-auto rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t("folder.selectionCancel")}
          </button>
        </div>
      )}

      <Body
        mode={mode}
        subfolders={subfolders}
        items={items}
        allTags={allTags}
        selection={selection}
        toggle={toggle}
        countDirectItems={countDirectItems}
        folderKebab={folderKebab}
        bookmarkKebab={bookmarkKebab}
        onNavFolder={(id) => {
          const sf = subfolders.find((f) => f.id === id);
          if (sf?.linkedShareId) {
            nav(`/linked/${id}`);
            return;
          }
          // A symlink opens the real folder, so its contents are the live ones.
          nav(`/folder/${sf?.aliasOf ?? id}`);
        }}
      />

      {showAddBookmark && (
        <BookmarkDialog
          folderId={folderId}
          onClose={() => setShowAddBookmark(false)}
          onSaved={invalidate}
        />
      )}
      {showAddFolder && (
        <FolderDialog
          parentId={folderId}
          onClose={() => setShowAddFolder(false)}
          onSaved={invalidate}
        />
      )}
      {showEditFolder && folder && (
        <FolderDialog
          parentId={folder.parentId}
          folder={folder}
          onClose={() => setShowEditFolder(false)}
          onSaved={invalidate}
        />
      )}
      {showShareFolder && folder && (
        <ShareToGroup
          sourceType="folder"
          sourceId={folder.id}
          onClose={() => setShowShareFolder(false)}
        />
      )}
      {showHistory && folder && (
        <VersionHistory
          entityType="folder"
          entityId={folder.id}
          onClose={() => setShowHistory(false)}
          onChanged={invalidate}
        />
      )}
      {editingFolder && (
        <FolderDialog
          parentId={editingFolder.parentId}
          folder={editingFolder}
          onClose={() => setEditingFolder(null)}
          onSaved={invalidate}
        />
      )}
      {editingBookmark && (
        <BookmarkEditDialog
          bookmark={editingBookmark}
          onClose={() => setEditingBookmark(null)}
          onSaved={invalidate}
        />
      )}
      {appearanceTarget && (
        <AppearanceDialog
          target={appearanceTarget}
          onClose={() => setAppearanceTarget(null)}
          onSaved={invalidate}
        />
      )}
      {moveTarget && (
        <MoveToDialog
          folders={folders.data ?? []}
          movingFolderIds={moveTarget.folderIds}
          count={moveTarget.folderIds.length + moveTarget.bookmarkIds.length}
          onClose={() => setMoveTarget(null)}
          onConfirm={async (dest) => {
            await moveItems(moveTarget, dest);
            clearSelection();
            setMoveTarget(null);
          }}
        />
      )}
      {copyTarget && (
        <MoveToDialog
          folders={folders.data ?? []}
          movingFolderIds={[]}
          count={1}
          title={t("copyDialog.title")}
          description={t("copyDialog.description")}
          confirmLabel={t("copyDialog.confirm")}
          onClose={() => setCopyTarget(null)}
          onConfirm={async (dest) => {
            const r =
              copyTarget.kind === "folder"
                ? await api.copyFolder(copyTarget.id, dest)
                : await api.copyBookmark(copyTarget.id, dest);
            invalidate();
            setCopyTarget(null);
            if (r.type === "folder") nav(`/folder/${r.id}`);
          }}
        />
      )}
      {linkTarget && (
        <MoveToDialog
          folders={folders.data ?? []}
          movingFolderIds={
            linkTarget.kind === "folder" ? [linkTarget.id] : []
          }
          count={1}
          title={t("linkDialog.title")}
          description={t("linkDialog.description")}
          confirmLabel={t("linkDialog.confirm")}
          onClose={() => setLinkTarget(null)}
          onConfirm={async (dest) => {
            await api.createAlias({
              targetType: linkTarget.kind,
              targetId: linkTarget.id,
              parentId: dest,
            });
            invalidate();
            setLinkTarget(null);
          }}
        />
      )}
      {exportOpen && (
        <ExportArchiveDialog
          scope={folderId ? "folder" : "account"}
          {...(folderId ? { id: folderId } : {})}
          onClose={() => setExportOpen(false)}
        />
      )}

      {importOpen && (
        <ImportArchiveDialog
          parentId={folderId}
          onClose={() => setImportOpen(false)}
          onDone={invalidate}
        />
      )}
      {panelFolder && (
        <GeneratePanelDialog
          folderId={panelFolder.id}
          folderName={panelFolder.name}
          onClose={() => setPanelFolder(null)}
        />
      )}
    </div>
  );
}

function BookmarkDialog({
  folderId,
  onClose,
  onSaved,
}: {
  folderId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bgColor, setBgColor] = useState<string | null>(null);
  const [bgImageFile, setBgImageFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const created = await api.createBookmark({
        folderId,
        url,
        title: title || undefined,
        description: description || undefined,
        tagIds,
        bgColor,
        fetchSnapshot: true,
      });
      if (iconFile) {
        await api.uploadBookmarkIcon(created.id, iconFile);
      }
      if (bgImageFile) {
        await api.uploadBookmarkBgImage(created.id, bgImageFile);
      }
      return created;
    },
    onSuccess: () => {
      setErr(null);
      onSaved();
      onClose();
    },
    onError: (e) =>
      setErr(
        isConflict(e)
          ? t("common.conflict")
          : e instanceof Error
            ? e.message
            : t("folder.errorGenericSave"),
      ),
  });
  return (
    <Modal title={t("folder.dialogNewBookmark")} onClose={onClose} size="lg">
      <div className="space-y-2">
        <input
          autoFocus
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("folder.fieldUrl")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("folder.fieldTitleOptional")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <IconPicker
          currentUrl={null}
          fallbackLabel={title || url}
          onPick={async (file) => setIconFile(file)}
          autoFetchUrl={url}
        />
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder={t("folder.fieldDescription")}
        />
        <TagPicker value={tagIds} onChange={setTagIds} />
        <BackgroundPicker
          bgColor={bgColor}
          onBgColorChange={setBgColor}
          currentImageUrl={null}
          onImagePick={async (f) => setBgImageFile(f)}
          onImageClear={async () => setBgImageFile(null)}
        />
        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
        <button
          disabled={!url || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("common.saving") : t("common.create")}
        </button>
      </div>
    </Modal>
  );
}

function FolderDialog({
  parentId,
  folder,
  onClose,
  onSaved,
}: {
  parentId: string | null;
  folder?: Folder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(folder?.name ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [tagIds, setTagIds] = useState<string[]>(folder?.tagIds ?? []);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bgColor, setBgColor] = useState<string | null>(folder?.bgColor ?? null);
  const [bgImageFile, setBgImageFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!folder;
  const m = useMutation({
    mutationFn: async () => {
      const target = isEdit
        ? await api.updateFolder(folder!.id, {
            name,
            description: description || null,
            tagIds,
            bgColor,
            baseRev: folder!.rev,
          })
        : await api.createFolder({
            parentId,
            name,
            description: description || undefined,
            tagIds,
            bgColor,
          });
      if (iconFile) await api.uploadFolderIcon(target.id, iconFile);
      if (bgImageFile) await api.uploadFolderBgImage(target.id, bgImageFile);
      return target;
    },
    onSuccess: () => {
      setErr(null);
      onSaved();
      onClose();
    },
    onError: (e) =>
      setErr(
        isConflict(e)
          ? t("common.conflict")
          : e instanceof Error
            ? e.message
            : t("folder.errorGenericSave"),
      ),
  });
  return (
    <Modal
      title={isEdit ? t("folder.dialogEditFolder") : t("folder.dialogNewFolder")}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-2">
        <input
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("folder.fieldFolderName")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <IconPicker
          currentUrl={folder?.iconBlobPath ? api.folderIconUrl(folder.id, folder.updatedAt) : null}
          fallbackLabel={name}
          onPick={async (file) => setIconFile(file)}
        />
        <RichTextEditor value={description} onChange={setDescription} />
        <TagPicker value={tagIds} onChange={setTagIds} />
        <BackgroundPicker
          bgColor={bgColor}
          onBgColorChange={setBgColor}
          currentImageUrl={
            isEdit && folder?.imageBlobPath
              ? api.folderBgImageUrl(folder.id, folder.updatedAt)
              : null
          }
          onImagePick={async (file) => {
            if (isEdit && folder) {
              await api.uploadFolderBgImage(folder.id, file);
              onSaved();
            } else {
              setBgImageFile(file);
            }
          }}
          onImageClear={async () => {
            if (isEdit && folder) {
              await api.clearFolderBgImage(folder.id);
              onSaved();
            } else {
              setBgImageFile(null);
            }
          }}
        />
        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
        <button
          disabled={!name || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("common.saving") : isEdit ? t("common.save") : t("common.create")}
        </button>
      </div>
    </Modal>
  );
}
