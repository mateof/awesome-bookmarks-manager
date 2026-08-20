import type { Folder } from "@awesome-bookmarks/shared";
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  Home,
  Share2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useNestDrop } from "../dnd.js";
import { buildFolderPath, useActiveFolderId } from "../hooks.js";
import { useLinkedShareTree } from "../lib/linkedTree.js";
import { FolderIconDialog } from "./FolderIconDialog.js";

export function FolderTree({ folders }: { folders: Folder[] }) {
  const { t } = useTranslation();
  // A linked share's contents are not rows in this account, so without this
  // the portal draws as a leaf however much is inside it.
  const linked = useLinkedShareTree(folders);
  const all = useMemo(
    () => [...folders, ...linked.folders],
    [folders, linked.folders],
  );
  const roots = folders.filter((f) => f.parentId === null);
  const activeId = useActiveFolderId();
  // "Home" is a drop target for the root (move a folder/bookmark to top level).
  const rootDrop = useNestDrop(null, "side");

  // Auto-expand the path from root to the active folder so the highlight
  // is always visible even if the user manually collapsed parents earlier.
  const pathIds = useMemo(
    () => new Set(buildFolderPath(all, activeId).map((f) => f.id)),
    [all, activeId],
  );
  const [iconTarget, setIconTarget] = useState<Folder | null>(null);

  return (
    <nav className="space-y-0.5">
      <Link
        ref={rootDrop.ref}
        to="/"
        className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
          !activeId
            ? "bg-slate-200 font-medium dark:bg-slate-800"
            : "hover:bg-slate-100 dark:hover:bg-slate-800"
        } ${rootDrop.isOver ? "ring-2 ring-inset ring-blue-500" : ""}`}
      >
        <Home className="h-4 w-4" />
        <span>{t("sidebar.home")}</span>
      </Link>
      {roots.map((f) => (
        <Node
          key={f.id}
          folder={f}
          folders={all}
          depth={0}
          activeId={activeId}
          pathIds={pathIds}
          hrefs={linked.hrefs}
          onEditIcon={setIconTarget}
        />
      ))}
      {iconTarget && (
        <FolderIconDialog
          folder={iconTarget}
          onClose={() => setIconTarget(null)}
        />
      )}
    </nav>
  );
}

function Node({
  folder,
  folders,
  depth,
  activeId,
  pathIds,
  hrefs,
  onEditIcon,
}: {
  folder: Folder;
  folders: Folder[];
  depth: number;
  activeId: string | null;
  pathIds: Set<string>;
  /** Where a node links to when it is not one of this user's own folders. */
  hrefs?: Map<string, string>;
  onEditIcon: (f: Folder) => void;
}) {
  const { t } = useTranslation();
  const onPath = pathIds.has(folder.id);
  const [open, setOpen] = useState<boolean>(onPath || depth === 0);
  // Re-open when the active path changes through this node.
  useEffect(() => {
    if (onPath) setOpen(true);
  }, [onPath]);
  const drop = useNestDrop(folder.id, "side");

  const children = folders.filter((f) => f.parentId === folder.id);
  const isActive = activeId === folder.id;
  return (
    <div>
      <div
        ref={drop.ref}
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-sm ${
          isActive
            ? "bg-slate-200 font-medium dark:bg-slate-800"
            : "hover:bg-slate-100 dark:hover:bg-slate-800"
        } ${drop.isOver ? "ring-2 ring-blue-500 ring-inset" : ""}`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {children.length > 0 ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-slate-400 hover:text-slate-600"
            aria-label={open ? t("common.close") : t("common.open")}
          >
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEditIcon(folder);
          }}
          title={t("sidebar.changeIcon")}
          aria-label={t("sidebar.changeIcon")}
          className="shrink-0 rounded hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-600"
        >
          {folder.iconBlobPath ? (
            // Mirror the folder's real icon, using the target's blob when this
            // row is a symlink.
            <img
              src={api.folderIconUrl(folder.aliasOf ?? folder.id, folder.updatedAt)}
              alt=""
              className="h-4 w-4 rounded object-cover"
            />
          ) : open && children.length > 0 ? (
            <FolderOpen className="h-4 w-4 text-slate-500" />
          ) : (
            <FolderClosed className="h-4 w-4 text-slate-500" />
          )}
        </button>
        <Link
          to={
            hrefs?.get(folder.id) ??
            (folder.linkedShareId
              ? `/linked/${folder.id}`
              : `/folder/${folder.id}`)
          }
          className="flex min-w-0 flex-1 items-center gap-1 truncate"
        >
          <span className="truncate">{folder.name}</span>
          {folder.shareOrigin && (
            <Share2 className="h-3 w-3 shrink-0 text-blue-500" />
          )}
        </Link>
      </div>
      {open &&
        children.map((c) => (
          <Node
            key={c.id}
            folder={c}
            folders={folders}
            depth={depth + 1}
            activeId={activeId}
            pathIds={pathIds}
            hrefs={hrefs}
            onEditIcon={onEditIcon}
          />
        ))}
    </div>
  );
}
