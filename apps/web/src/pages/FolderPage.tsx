import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import {
  Download,
  ExternalLink,
  FolderClosed,
  FolderPlus,
  PencilLine,
  Plus,
  Share2,
  TabletSmartphone,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { Breadcrumbs } from "../components/Breadcrumbs.js";
import { IconPicker } from "../components/IconPicker.js";
import { KebabMenu, type KebabItem } from "../components/KebabMenu.js";
import { Modal } from "../components/Modal.js";
import { RichTextEditor } from "../components/RichTextEditor.js";
import { RichTextView } from "../components/RichTextView.js";
import { ShareToGroup } from "../components/ShareToGroup.js";
import { TagChipList } from "../components/TagChip.js";
import { TagPicker } from "../components/TagPicker.js";
import { ViewModeToggle } from "../components/ViewModeToggle.js";
import { useViewMode, type ViewMode } from "../view-mode.js";
import type { Tag } from "@awesome-bookmarks/shared";

type SelectionKey = `folder:${string}` | `bookmark:${string}`;

function useRelativeTime() {
  const { i18n } = useTranslation();
  const rtf = new Intl.RelativeTimeFormat(i18n.resolvedLanguage ?? "es", {
    numeric: "auto",
  });
  return (iso: string): string => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const diffSec = (t - Date.now()) / 1000;
    const abs = Math.abs(diffSec);
    if (abs < 60) return rtf.format(Math.round(diffSec), "second");
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
    if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), "day");
    if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), "month");
    return rtf.format(Math.round(diffSec / 31536000), "year");
  };
}

function stripTags(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

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

  const [showAddBookmark, setShowAddBookmark] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showEditFolder, setShowEditFolder] = useState(false);
  const [showShareFolder, setShowShareFolder] = useState(false);
  const [selection, setSelection] = useState<Set<SelectionKey>>(
    () => new Set(),
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["folders"] });
    qc.invalidateQueries({ queryKey: ["bookmarks"] });
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

  const openAllInTabs = (recursive: boolean) => {
    const urls = recursive
      ? collectDescendantBookmarks(folderId)
      : items.map((b) => b.url);
    if (urls.length === 0) return;
    if (
      urls.length > 20 &&
      !confirm(t("folder.confirmTooManyTabs", { count: urls.length }))
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

  const openSelectionInTabs = () => {
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
      alert(t("folder.selectionNoLinks"));
      return;
    }
    if (
      urls.size > 20 &&
      !confirm(t("folder.confirmTooManyTabs", { count: urls.size }))
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
      alert(
        e instanceof Error
          ? t("folder.couldNotExport", { message: e.message })
          : t("folder.couldNotExportGeneric"),
      );
    }
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
      alert(
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
        alert(t("folder.nothingToExport"));
        return;
      }
      try {
        await api.exportBookmarksHtml({ folderIds: ids, bookmarkIds: bIds });
      } catch (e) {
        alert(
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
    if (!confirm(t("folder.confirmDeleteFolder", { name: target.name }))) return;
    try {
      await api.deleteFolder(target.id);
      invalidate();
      if (target.id === folderId) nav("/");
    } catch (e) {
      alert(
        e instanceof Error
          ? t("folder.couldNotDelete", { message: e.message })
          : t("folder.couldNotDeleteGeneric"),
      );
    }
  };

  const deleteBookmark = async (b: Bookmark) => {
    if (!confirm(t("folder.confirmDeleteBookmark", { title: b.title }))) return;
    try {
      await api.deleteBookmark(b.id);
      invalidate();
    } catch (e) {
      alert(
        e instanceof Error
          ? t("folder.couldNotDelete", { message: e.message })
          : t("folder.couldNotDeleteGeneric"),
      );
    }
  };

  const deleteSelection = async () => {
    if (selection.size === 0) return;
    if (
      !confirm(
        t("folder.confirmDeleteSelection", { count: selection.size }),
      )
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
    if (failures.length > 0) alert(failures.join("\n"));
  };

  const folderKebab = (f: Folder): KebabItem[] => [
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

  return (
    <div className="space-y-4">
      {folderId && <Breadcrumbs folderId={folderId} />}

      <div className="flex flex-wrap items-center gap-3">
        {folder?.iconBlobPath && (
          <img
            src={api.folderIconUrl(folder.id)}
            alt=""
            className="h-10 w-10 rounded object-cover"
          />
        )}
        <h1 className="text-xl font-semibold">
          {folder?.name ?? t("folder.rootTitle")}
        </h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ViewModeToggle />
          {folderId && items.length > 0 && (
            <button
              onClick={() => openAllInTabs(false)}
              className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              title={t("folder.openDirectTitle")}
            >
              <TabletSmartphone className="h-4 w-4" /> {t("folder.openDirect")}
            </button>
          )}
          {folderId && (
            <button
              onClick={() => openAllInTabs(true)}
              className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              title={t("folder.openAllTitle")}
            >
              <ExternalLink className="h-4 w-4" /> {t("folder.openAll")}
            </button>
          )}
          <button
            onClick={exportCurrentFolder}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            title={t("folder.exportButtonTitle")}
          >
            <Download className="h-4 w-4" /> {t("folder.exportButton")}
          </button>
          {folder && (
            <>
              <button
                onClick={() => setShowEditFolder(true)}
                className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <PencilLine className="h-4 w-4" /> {t("folder.editFolder")}
              </button>
              <button
                onClick={() => setShowShareFolder(true)}
                className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Share2 className="h-4 w-4" /> {t("folder.shareWithGroup")}
              </button>
              <KebabMenu
                items={[
                  {
                    label: t("folder.deleteFolderKebab"),
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    onClick: () => void deleteFolder(folder),
                  },
                ]}
              />
            </>
          )}
          <button
            onClick={() => setShowAddFolder(true)}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <FolderPlus className="h-4 w-4" /> {t("folder.addFolder")}
          </button>
          <button
            onClick={() => setShowAddBookmark(true)}
            className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            <Plus className="h-4 w-4" /> {t("folder.addBookmark")}
          </button>
        </div>
      </div>

      {folder?.description && <RichTextView html={folder.description} />}

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
        onNavFolder={(id) => nav(`/folder/${id}`)}
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
    </div>
  );
}

interface BodyProps {
  mode: ViewMode;
  subfolders: Folder[];
  items: Bookmark[];
  allTags: Tag[];
  selection: Set<SelectionKey>;
  toggle: (k: SelectionKey) => void;
  countDirectItems: (id: string) => number;
  folderKebab: (f: Folder) => KebabItem[];
  bookmarkKebab: (b: Bookmark) => KebabItem[];
  onNavFolder: (id: string) => void;
}

function Body(p: BodyProps) {
  const { t } = useTranslation();
  if (p.mode === "table") return <TableLayout {...p} />;
  return (
    <>
      {p.subfolders.length > 0 && (
        <Section title={t("folder.foldersSection")}>
          <FoldersBlock {...p} />
        </Section>
      )}
      <Section title={t("folder.bookmarksSection")}>
        {p.items.length > 0 ? (
          <BookmarksBlock {...p} />
        ) : (
          <div className="text-sm text-slate-400">{t("folder.noBookmarksHere")}</div>
        )}
      </Section>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FoldersBlock(p: BodyProps) {
  switch (p.mode) {
    case "list":
      return (
        <div className="divide-y divide-slate-200 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {p.subfolders.map((sf) => (
            <FolderListRow key={sf.id} sf={sf} p={p} />
          ))}
        </div>
      );
    case "large":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {p.subfolders.map((sf) => (
            <FolderLargeCard key={sf.id} sf={sf} p={p} />
          ))}
        </div>
      );
    case "mosaic":
      return (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {p.subfolders.map((sf) => (
            <FolderMosaicCard key={sf.id} sf={sf} p={p} />
          ))}
        </div>
      );
    case "grid":
    default:
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {p.subfolders.map((sf) => (
            <FolderGridCard key={sf.id} sf={sf} p={p} />
          ))}
        </div>
      );
  }
}

function BookmarksBlock(p: BodyProps) {
  switch (p.mode) {
    case "list":
      return (
        <div className="divide-y divide-slate-200 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {p.items.map((b) => (
            <BookmarkListRow key={b.id} b={b} p={p} />
          ))}
        </div>
      );
    case "large":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {p.items.map((b) => (
            <BookmarkLargeCard key={b.id} b={b} p={p} />
          ))}
        </div>
      );
    case "mosaic":
      return (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {p.items.map((b) => (
            <BookmarkMosaicCard key={b.id} b={b} p={p} />
          ))}
        </div>
      );
    case "grid":
    default:
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {p.items.map((b) => (
            <BookmarkGridCard key={b.id} b={b} p={p} />
          ))}
        </div>
      );
  }
}

function stopBubble(e: React.MouseEvent | React.KeyboardEvent) {
  e.stopPropagation();
}

function FolderIcon({ sf, size }: { sf: Folder; size: string }) {
  if (sf.iconBlobPath) {
    return (
      <img
        src={api.folderIconUrl(sf.id)}
        alt=""
        className={`${size} rounded object-cover`}
      />
    );
  }
  return <FolderClosed className={`${size} text-slate-500`} />;
}

function BookmarkIcon({ b, size }: { b: Bookmark; size: string }) {
  if (b.iconBlobPath) {
    return (
      <img
        src={api.bookmarkIconUrl(b.id)}
        alt=""
        className={`${size} shrink-0 rounded object-cover`}
      />
    );
  }
  return <ExternalLink className={`${size} shrink-0 text-slate-400`} />;
}

function HoverCheckbox({
  selected,
  onToggle,
  label,
  className = "",
  alwaysVisible = false,
}: {
  selected: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
  alwaysVisible?: boolean;
}) {
  const visibility =
    alwaysVisible || selected
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100 focus:opacity-100";
  return (
    <input
      type="checkbox"
      checked={selected}
      onChange={onToggle}
      onClick={stopBubble}
      aria-label={label}
      className={`h-4 w-4 accent-slate-700 transition-opacity ${visibility} ${className}`}
    />
  );
}

// `t` typed as any to sidestep TS2589 (deep i18next resource instantiation).
function selectFolderLabel(t: any, name: string) {
  return `${t("common.selectFolder")} ${name}`;
}
function selectBookmarkLabel(t: any, title: string) {
  return `${t("common.selectBookmark")} ${title}`;
}

function FolderGridCard({ sf, p }: { sf: Folder; p: BodyProps }) {
  const { t } = useTranslation();
  const key: SelectionKey = `folder:${sf.id}`;
  const selected = p.selection.has(key);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => p.onNavFolder(sf.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onNavFolder(sf.id);
      }}
      className="group relative flex cursor-pointer flex-col items-center gap-2 rounded border border-slate-200 bg-white p-3 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectFolderLabel(t, sf.name)}
        className="absolute left-1 top-1"
      />
      <div
        className={`absolute right-1 top-1 transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <KebabMenu items={p.folderKebab(sf)} />
      </div>
      <FolderIcon sf={sf} size="h-8 w-8" />
      <div className="w-full truncate text-center text-sm">{sf.name}</div>
      {(sf.tagIds?.length ?? 0) > 0 && (
        <div className="flex w-full justify-center">
          <TagChipList
            tagIds={sf.tagIds ?? []}
            allTags={p.allTags}
            size="sm"
            asLink
            max={3}
          />
        </div>
      )}
    </div>
  );
}

function FolderListRow({ sf, p }: { sf: Folder; p: BodyProps }) {
  const { t } = useTranslation();
  const key: SelectionKey = `folder:${sf.id}`;
  const selected = p.selection.has(key);
  const count = p.countDirectItems(sf.id);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => p.onNavFolder(sf.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onNavFolder(sf.id);
      }}
      className="group flex cursor-pointer items-center gap-3 bg-white px-3 py-2 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectFolderLabel(t, sf.name)}
      />
      <FolderIcon sf={sf} size="h-5 w-5" />
      <div className="flex-1 truncate text-sm">{sf.name}</div>
      <TagChipList
        tagIds={sf.tagIds ?? []}
        allTags={p.allTags}
        size="sm"
        asLink
        max={3}
      />
      <div className="text-xs text-slate-500">
        {t("folder.itemsCount", { count })}
      </div>
      <KebabMenu items={p.folderKebab(sf)} />
    </div>
  );
}

function FolderLargeCard({ sf, p }: { sf: Folder; p: BodyProps }) {
  const { t } = useTranslation();
  const key: SelectionKey = `folder:${sf.id}`;
  const selected = p.selection.has(key);
  const desc = stripTags(sf.description);
  const count = p.countDirectItems(sf.id);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => p.onNavFolder(sf.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onNavFolder(sf.id);
      }}
      className="group relative flex min-h-[8rem] cursor-pointer flex-col rounded border border-slate-200 bg-white p-4 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectFolderLabel(t, sf.name)}
        className="absolute left-2 top-2"
      />
      <div
        className={`absolute right-2 top-2 transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <KebabMenu items={p.folderKebab(sf)} />
      </div>
      <div className="flex items-center gap-3">
        <FolderIcon sf={sf} size="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{sf.name}</div>
          <div className="text-xs text-slate-500">
            {t("folder.itemsCount", { count })}
          </div>
        </div>
      </div>
      {desc && (
        <div className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">
          {desc}
        </div>
      )}
      {(sf.tagIds?.length ?? 0) > 0 && (
        <div className="mt-2">
          <TagChipList
            tagIds={sf.tagIds ?? []}
            allTags={p.allTags}
            size="sm"
            asLink
          />
        </div>
      )}
    </div>
  );
}

function FolderMosaicCard({ sf, p }: { sf: Folder; p: BodyProps }) {
  const { t } = useTranslation();
  const key: SelectionKey = `folder:${sf.id}`;
  const selected = p.selection.has(key);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => p.onNavFolder(sf.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onNavFolder(sf.id);
      }}
      className="group relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white p-2 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectFolderLabel(t, sf.name)}
        className="absolute left-1 top-1"
      />
      <div
        className={`absolute right-1 top-1 transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <KebabMenu items={p.folderKebab(sf)} />
      </div>
      <FolderIcon sf={sf} size="h-10 w-10" />
      <div className="w-full truncate text-center text-xs">{sf.name}</div>
      {(sf.tagIds?.length ?? 0) > 0 && (
        <TagChipList
          tagIds={sf.tagIds ?? []}
          allTags={p.allTags}
          asDot
        />
      )}
    </div>
  );
}

function BookmarkGridCard({ b, p }: { b: Bookmark; p: BodyProps }) {
  const { t } = useTranslation();
  const key: SelectionKey = `bookmark:${b.id}`;
  const selected = p.selection.has(key);
  return (
    <div className="group relative flex items-start gap-2 rounded border border-slate-200 bg-white p-3 pl-7 dark:border-slate-800 dark:bg-slate-900">
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectBookmarkLabel(t, b.title)}
        className="absolute left-2 top-3"
      />
      <BookmarkIcon b={b} size="h-8 w-8" />
      <div className="flex-1 overflow-hidden">
        <Link
          to={`/bookmark/${b.id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {b.title}
        </Link>
        <a
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-xs text-slate-500 hover:underline"
        >
          {b.url}
        </a>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            {b.snapshotStatus}
          </span>
          <TagChipList
            tagIds={b.tagIds ?? []}
            allTags={p.allTags}
            size="sm"
            asLink
            max={3}
          />
        </div>
      </div>
      <a
        href={b.url}
        target="_blank"
        rel="noopener noreferrer"
        title={t("bookmark.openUrlTitle")}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <KebabMenu items={p.bookmarkKebab(b)} />
    </div>
  );
}

function BookmarkListRow({ b, p }: { b: Bookmark; p: BodyProps }) {
  const { t } = useTranslation();
  const key: SelectionKey = `bookmark:${b.id}`;
  const selected = p.selection.has(key);
  return (
    <div className="group flex items-center gap-3 bg-white px-3 py-2 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800">
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectBookmarkLabel(t, b.title)}
      />
      <BookmarkIcon b={b} size="h-5 w-5" />
      <Link
        to={`/bookmark/${b.id}`}
        className="truncate text-sm font-medium hover:underline"
      >
        {b.title}
      </Link>
      <a
        href={b.url}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden flex-1 truncate text-xs text-slate-500 hover:underline sm:block"
      >
        {b.url}
      </a>
      <TagChipList
        tagIds={b.tagIds ?? []}
        allTags={p.allTags}
        size="sm"
        asLink
        max={3}
      />
      <span className="hidden text-[10px] uppercase tracking-wide text-slate-400 lg:inline">
        {b.snapshotStatus}
      </span>
      <a
        href={b.url}
        target="_blank"
        rel="noopener noreferrer"
        title={t("bookmark.openUrlTitle")}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <KebabMenu items={p.bookmarkKebab(b)} />
    </div>
  );
}

function BookmarkLargeCard({ b, p }: { b: Bookmark; p: BodyProps }) {
  const { t } = useTranslation();
  const key: SelectionKey = `bookmark:${b.id}`;
  const selected = p.selection.has(key);
  const desc = stripTags(b.description);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {b.hasSnapshot && (
        <a
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block aspect-video bg-slate-100 dark:bg-slate-800"
        >
          <img
            src={api.bookmarkScreenshotUrl(b.id)}
            alt=""
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
            className="h-full w-full object-cover object-top"
          />
        </a>
      )}
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectBookmarkLabel(t, b.title)}
        className="absolute left-2 top-2 rounded bg-white/80 backdrop-blur dark:bg-slate-900/80"
      />
      <div
        className={`absolute right-2 top-2 transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <KebabMenu items={p.bookmarkKebab(b)} />
      </div>
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          <BookmarkIcon b={b} size="h-5 w-5" />
          <Link
            to={`/bookmark/${b.id}`}
            className="flex-1 truncate text-sm font-medium hover:underline"
          >
            {b.title}
          </Link>
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            title={t("bookmark.openUrlTitle")}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <a
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-xs text-slate-500 hover:underline"
        >
          {b.url}
        </a>
        {desc && (
          <div className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
            {desc}
          </div>
        )}
        {(b.tagIds?.length ?? 0) > 0 && (
          <div className="mt-1">
            <TagChipList
              tagIds={b.tagIds ?? []}
              allTags={p.allTags}
              size="sm"
              asLink
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BookmarkMosaicCard({ b, p }: { b: Bookmark; p: BodyProps }) {
  const { t } = useTranslation();
  const key: SelectionKey = `bookmark:${b.id}`;
  const selected = p.selection.has(key);
  return (
    <div className="group relative flex aspect-square flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white p-2 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800">
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectBookmarkLabel(t, b.title)}
        className="absolute left-1 top-1"
      />
      <div
        className={`absolute right-1 top-1 transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <KebabMenu items={p.bookmarkKebab(b)} />
      </div>
      <a
        href={b.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 flex-col items-center justify-center gap-1"
      >
        <BookmarkIcon b={b} size="h-10 w-10" />
      </a>
      <Link
        to={`/bookmark/${b.id}`}
        className="w-full truncate text-center text-xs hover:underline"
      >
        {b.title}
      </Link>
      {(b.tagIds?.length ?? 0) > 0 && (
        <TagChipList tagIds={b.tagIds ?? []} allTags={p.allTags} asDot />
      )}
    </div>
  );
}

function TableLayout(p: BodyProps) {
  const { t } = useTranslation();
  const relativeTime = useRelativeTime();
  if (p.subfolders.length === 0 && p.items.length === 0) {
    return <div className="text-sm text-slate-400">{t("folder.noItemsHere")}</div>;
  }
  return (
    <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
          <tr>
            <th className="w-8 px-2 py-2"></th>
            <th className="w-8 px-2 py-2"></th>
            <th className="px-2 py-2 text-left">{t("table.title")}</th>
            <th className="px-2 py-2 text-left">{t("table.url")}</th>
            <th className="px-2 py-2 text-left">{t("table.tags")}</th>
            <th className="px-2 py-2 text-left">{t("table.info")}</th>
            <th className="px-2 py-2 text-left">{t("table.added")}</th>
            <th className="w-20 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {p.subfolders.map((sf) => {
            const key: SelectionKey = `folder:${sf.id}`;
            const selected = p.selection.has(key);
            const count = p.countDirectItems(sf.id);
            return (
              <tr
                key={`f-${sf.id}`}
                className="cursor-pointer bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                onClick={() => p.onNavFolder(sf.id)}
              >
                <td className="px-2 py-2" onClick={stopBubble}>
                  <HoverCheckbox
                    selected={selected}
                    onToggle={() => p.toggle(key)}
                    label={selectFolderLabel(t, sf.name)}
                    alwaysVisible
                  />
                </td>
                <td className="px-2 py-2">
                  <FolderIcon sf={sf} size="h-5 w-5" />
                </td>
                <td className="truncate px-2 py-2 font-medium">{sf.name}</td>
                <td className="px-2 py-2 text-slate-400">—</td>
                <td className="px-2 py-2">
                  <TagChipList
                    tagIds={sf.tagIds ?? []}
                    allTags={p.allTags}
                    size="sm"
                    asLink
                    max={3}
                  />
                </td>
                <td className="px-2 py-2 text-xs text-slate-500">
                  {t("folder.itemsCount", { count })}
                </td>
                <td className="px-2 py-2 text-xs text-slate-500">
                  {relativeTime(sf.createdAt)}
                </td>
                <td className="px-2 py-2" onClick={stopBubble}>
                  <KebabMenu items={p.folderKebab(sf)} />
                </td>
              </tr>
            );
          })}
          {p.items.map((b) => {
            const key: SelectionKey = `bookmark:${b.id}`;
            const selected = p.selection.has(key);
            return (
              <tr
                key={`b-${b.id}`}
                className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <td className="px-2 py-2">
                  <HoverCheckbox
                    selected={selected}
                    onToggle={() => p.toggle(key)}
                    label={selectBookmarkLabel(t, b.title)}
                    alwaysVisible
                  />
                </td>
                <td className="px-2 py-2">
                  <BookmarkIcon b={b} size="h-5 w-5" />
                </td>
                <td className="max-w-[20ch] truncate px-2 py-2 font-medium">
                  <Link
                    to={`/bookmark/${b.id}`}
                    className="hover:underline"
                  >
                    {b.title}
                  </Link>
                </td>
                <td className="max-w-[30ch] truncate px-2 py-2 text-xs text-slate-500">
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {b.url}
                  </a>
                </td>
                <td className="px-2 py-2">
                  <TagChipList
                    tagIds={b.tagIds ?? []}
                    allTags={p.allTags}
                    size="sm"
                    asLink
                    max={3}
                  />
                </td>
                <td className="px-2 py-2 text-[10px] uppercase tracking-wide text-slate-400">
                  {b.snapshotStatus}
                </td>
                <td className="px-2 py-2 text-xs text-slate-500">
                  {relativeTime(b.createdAt)}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("bookmark.openUrlTitle")}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <KebabMenu items={p.bookmarkKebab(b)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const created = await api.createBookmark({
        folderId,
        url,
        title: title || undefined,
        description: description || undefined,
        tagIds,
        fetchSnapshot: true,
      });
      if (iconFile) {
        await api.uploadBookmarkIcon(created.id, iconFile);
      }
      return created;
    },
    onSuccess: () => {
      setErr(null);
      onSaved();
      onClose();
    },
    onError: (e) =>
      setErr(e instanceof Error ? e.message : t("folder.errorGenericSave")),
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
          onPick={async (file) => setIconFile(file)}
          autoFetchUrl={url}
        />
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder={t("folder.fieldDescription")}
        />
        <TagPicker value={tagIds} onChange={setTagIds} />
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
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!folder;
  const m = useMutation({
    mutationFn: async () => {
      const target = isEdit
        ? await api.updateFolder(folder!.id, {
            name,
            description: description || null,
            tagIds,
          })
        : await api.createFolder({
            parentId,
            name,
            description: description || undefined,
            tagIds,
          });
      if (iconFile) await api.uploadFolderIcon(target.id, iconFile);
      return target;
    },
    onSuccess: () => {
      setErr(null);
      onSaved();
      onClose();
    },
    onError: (e) =>
      setErr(e instanceof Error ? e.message : t("folder.errorGenericSave")),
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
          currentUrl={folder?.iconBlobPath ? api.folderIconUrl(folder.id) : null}
          onPick={async (file) => setIconFile(file)}
        />
        <RichTextEditor value={description} onChange={setDescription} />
        <TagPicker value={tagIds} onChange={setTagIds} />
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
