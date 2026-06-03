import { useQuery } from "@tanstack/react-query";
import type { Bookmark, Folder, SharedItem } from "@awesome-bookmarks/shared";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderClosed,
  Star,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../api.js";

interface Props {
  folders: Folder[];
  bookmarks: Bookmark[];
}

/**
 * Two-section bookmarks bar — "Mis bookmarks" and "Compartidos".
 * Each opens a single panel that uses click-to-expand (no hover flyouts) so
 * navigation is reliable on touch and never loses tracking on mouse gaps.
 */
export function BookmarksBar({ folders, bookmarks }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<"mine" | "shared" | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative mt-1 flex items-center gap-1 py-1">
      <Trigger
        active={open === "mine"}
        onClick={() => setOpen((o) => (o === "mine" ? null : "mine"))}
      >
        <Star className="h-4 w-4" /> {t("bookmarksBar.mine")}
      </Trigger>
      <Trigger
        active={open === "shared"}
        onClick={() => setOpen((o) => (o === "shared" ? null : "shared"))}
      >
        <Users className="h-4 w-4" /> {t("bookmarksBar.shared")}
      </Trigger>

      {open === "mine" && (
        <Panel onClose={() => setOpen(null)}>
          <MineTree folders={folders} bookmarks={bookmarks} />
        </Panel>
      )}
      {open === "shared" && (
        <Panel onClose={() => setOpen(null)}>
          <SharedTree />
        </Panel>
      )}
    </div>
  );
}

function Trigger({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm ${
        active
          ? "bg-slate-200 dark:bg-slate-700"
          : "hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {children}
      <ChevronDown className="h-3 w-3 text-slate-400" />
    </button>
  );
}

function Panel({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute left-0 top-full z-30 mt-1 max-h-[70vh] w-full max-w-md overflow-auto rounded border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
      onClick={(e) => {
        // Close when an anchor in the panel is clicked (mostly bookmark links).
        const t = e.target as HTMLElement;
        if (t.closest("a[data-close-on-click]")) onClose();
      }}
    >
      {children}
    </div>
  );
}

// ---------- Mine ----------

function MineTree({
  folders,
  bookmarks,
}: {
  folders: Folder[];
  bookmarks: Bookmark[];
}) {
  const { t } = useTranslation();
  const rootFolders = folders.filter((f) => f.parentId === null);
  const rootBookmarks = bookmarks.filter((b) => b.folderId === null);
  const isEmpty = rootFolders.length === 0 && rootBookmarks.length === 0;
  if (isEmpty) {
    return <Empty>{t("bookmarksBar.emptyRoot")}</Empty>;
  }
  return (
    <ul className="text-sm">
      {rootFolders.map((f) => (
        <FolderNode
          key={f.id}
          folder={f}
          folders={folders}
          bookmarks={bookmarks}
          depth={0}
        />
      ))}
      {rootBookmarks.map((b) => (
        <BookmarkRow key={b.id} bookmark={b} depth={0} />
      ))}
    </ul>
  );
}

function FolderNode({
  folder,
  folders,
  bookmarks,
  depth,
}: {
  folder: Folder;
  folders: Folder[];
  bookmarks: Bookmark[];
  depth: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(depth === 0 ? false : false);
  const childFolders = folders.filter((f) => f.parentId === folder.id);
  const childBookmarks = bookmarks.filter((b) => b.folderId === folder.id);
  const hasChildren = childFolders.length > 0 || childBookmarks.length > 0;

  const openAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const stack: (string | null)[] = [folder.id];
    const urls: string[] = [];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const b of bookmarks) if (b.folderId === cur) urls.push(b.url);
      for (const f of folders) if (f.parentId === cur) stack.push(f.id);
    }
    if (urls.length === 0) return;
    if (
      urls.length > 20 &&
      !confirm(t("bookmarksBar.confirmOpenN", { count: urls.length }))
    )
      return;
    for (const u of urls) window.open(u, "_blank", "noopener,noreferrer");
  };

  return (
    <li>
      <div
        className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label={expanded ? t("bookmarksBar.closeAria") : t("bookmarksBar.openAria")}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <span className="inline-block h-3 w-3" />
          )}
        </button>
        <FolderClosed className="h-4 w-4 text-slate-500" />
        <Link
          to={`/folder/${folder.id}`}
          data-close-on-click
          className="flex-1 truncate"
        >
          {folder.name}
        </Link>
        {hasChildren && (
          <button
            onClick={openAll}
            title={t("bookmarksBar.openAllInTabs")}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          >
            <ExternalLink className="h-3 w-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" />
          </button>
        )}
      </div>
      {expanded && hasChildren && (
        <ul>
          {childFolders.map((cf) => (
            <FolderNode
              key={cf.id}
              folder={cf}
              folders={folders}
              bookmarks={bookmarks}
              depth={depth + 1}
            />
          ))}
          {childBookmarks.map((b) => (
            <BookmarkRow key={b.id} bookmark={b} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function BookmarkRow({
  bookmark,
  depth,
}: {
  bookmark: Bookmark;
  depth: number;
}) {
  return (
    <li>
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        data-close-on-click
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
        style={{ paddingLeft: 8 + depth * 14 + 17 }}
        title={bookmark.url}
      >
        {bookmark.iconBlobPath ? (
          <img
            src={api.bookmarkIconUrl(bookmark.id)}
            alt=""
            className="h-4 w-4 rounded object-cover"
          />
        ) : (
          <ExternalLink className="h-3 w-3 text-slate-400" />
        )}
        <span className="truncate">{bookmark.title}</span>
      </a>
    </li>
  );
}

// ---------- Shared ----------

function SharedTree() {
  const { t } = useTranslation();
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.listGroups });
  const shared = useQuery({ queryKey: ["shared"], queryFn: api.listShared });

  if (groups.isLoading || shared.isLoading) {
    return <Empty>{t("bookmarksBar.loading")}</Empty>;
  }
  const items = shared.data ?? [];
  if (items.length === 0) {
    return <Empty>{t("bookmarksBar.emptyShared")}</Empty>;
  }

  // Group shared items by groupId
  const byGroup = new Map<string, SharedItem[]>();
  for (const it of items) {
    const list = byGroup.get(it.groupId) ?? [];
    list.push(it);
    byGroup.set(it.groupId, list);
  }

  return (
    <ul className="text-sm">
      {(groups.data ?? [])
        .filter((g) => byGroup.has(g.id))
        .map((g) => (
          <GroupNode key={g.id} groupName={g.name} items={byGroup.get(g.id) ?? []} />
        ))}
    </ul>
  );
}

function GroupNode({
  groupName,
  items,
}: {
  groupName: string;
  items: SharedItem[];
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  return (
    <li>
      <div className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <Users className="h-4 w-4 text-slate-500" />
        <span className="flex-1 truncate font-medium">{groupName}</span>
        <span className="text-xs text-slate-400">{items.length}</span>
      </div>
      {expanded && (
        <ul>
          {items.map((it) => (
            <li key={it.id}>
              <Link
                to={`/shared/${it.id}`}
                data-close-on-click
                className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                style={{ paddingLeft: 8 + 14 + 17 }}
              >
                {it.sourceType === "folder" ? (
                  <FolderClosed className="h-4 w-4 text-slate-500" />
                ) : (
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                )}
                <span className="flex-1 truncate text-xs uppercase tracking-wide text-slate-500">
                  {it.sourceType}
                </span>
                <span className="truncate text-xs text-slate-400">
                  {t("bookmarksBar.sharedByUser", { email: it.sharedByEmail })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-6 text-center text-xs text-slate-400">
      {children}
    </div>
  );
}
