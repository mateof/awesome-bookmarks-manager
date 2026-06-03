import type { Folder } from "@awesome-bookmarks/shared";
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  Home,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { buildFolderPath, useActiveFolderId } from "../hooks.js";

export function FolderTree({ folders }: { folders: Folder[] }) {
  const { t } = useTranslation();
  const roots = folders.filter((f) => f.parentId === null);
  const activeId = useActiveFolderId();

  // Auto-expand the path from root to the active folder so the highlight
  // is always visible even if the user manually collapsed parents earlier.
  const pathIds = useMemo(
    () => new Set(buildFolderPath(folders, activeId).map((f) => f.id)),
    [folders, activeId],
  );

  return (
    <nav className="space-y-0.5">
      <Link
        to="/"
        className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
          !activeId
            ? "bg-slate-200 font-medium dark:bg-slate-800"
            : "hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        <Home className="h-4 w-4" />
        <span>{t("sidebar.home")}</span>
      </Link>
      {roots.map((f) => (
        <Node
          key={f.id}
          folder={f}
          folders={folders}
          depth={0}
          activeId={activeId}
          pathIds={pathIds}
        />
      ))}
    </nav>
  );
}

function Node({
  folder,
  folders,
  depth,
  activeId,
  pathIds,
}: {
  folder: Folder;
  folders: Folder[];
  depth: number;
  activeId: string | null;
  pathIds: Set<string>;
}) {
  const { t } = useTranslation();
  const onPath = pathIds.has(folder.id);
  const [open, setOpen] = useState<boolean>(onPath || depth === 0);
  // Re-open when the active path changes through this node.
  useEffect(() => {
    if (onPath) setOpen(true);
  }, [onPath]);

  const children = folders.filter((f) => f.parentId === folder.id);
  const isActive = activeId === folder.id;
  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-sm ${
          isActive
            ? "bg-slate-200 font-medium dark:bg-slate-800"
            : "hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
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
        {open && children.length > 0 ? (
          <FolderOpen className="h-4 w-4 text-slate-500" />
        ) : (
          <FolderClosed className="h-4 w-4 text-slate-500" />
        )}
        <Link to={`/folder/${folder.id}`} className="flex-1 truncate">
          {folder.name}
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
          />
        ))}
    </div>
  );
}
