import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Folder as FolderIcon,
  Globe,
  Home,
  PencilLine,
  Share2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { RichTextView } from "../components/RichTextView.js";
import {
  SharedNodeEditor,
  type SharedBookmarkPayload,
  type SharedFolderPayload,
  type SharedPayload,
} from "../components/SharedNodeEditor.js";

interface SharedResponse {
  content: SharedPayload;
  access: "viewer" | "editor";
  rev: number;
}

/** Resolve the folder node reached by walking `path` (node ids) from root. */
function resolvePath(
  root: SharedFolderPayload,
  path: string[],
): { node: SharedFolderPayload; trail: SharedFolderPayload[] } {
  let node = root;
  const trail: SharedFolderPayload[] = [];
  for (const id of path) {
    const next = node.subfolders.find((f) => f.id === id);
    if (!next) break;
    trail.push(next);
    node = next;
  }
  return { node, trail };
}

export function LinkedSharePage() {
  const { folderId } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
  const portal = (folders.data ?? []).find((f) => f.id === folderId);
  const shareId = portal?.linkedShareId ?? null;

  const q = useQuery({
    queryKey: ["shared-content", shareId],
    enabled: !!shareId,
    queryFn: () =>
      api.getSharedContent(shareId!) as Promise<
        SharedResponse | { error: string }
      >,
  });

  const [path, setPath] = useState<string[]>([]);
  const [editing, setEditing] = useState<SharedPayload | null>(null);

  if (folders.isLoading)
    return <div className="text-slate-400">{t("common.loading")}</div>;
  if (!portal || !shareId)
    return <div className="text-slate-400">{t("linked.notLinked")}</div>;
  if (q.isLoading)
    return <div className="text-slate-400">{t("common.loading")}</div>;

  const data = q.data && "content" in q.data ? q.data : null;
  if (!data || data.content.type !== "folder")
    return <div className="text-slate-400">{t("linked.unavailable")}</div>;

  const canEdit = data.access === "editor";
  const root = data.content;
  const { node, trail } = resolvePath(root, path);

  return (
    <div className="space-y-4">
      {/* Breadcrumb: back to home context + drill trail inside the share. */}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link
          to={portal.parentId ? `/folder/${portal.parentId}` : "/"}
          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <Home className="h-3.5 w-3.5" />
          {t("linked.home")}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <button
          type="button"
          onClick={() => setPath([])}
          className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-100"
        >
          <Share2 className="h-3.5 w-3.5 text-blue-500" />
          {portal.name}
        </button>
        {trail.map((f, i) => (
          <span key={f.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" />
            <button
              type="button"
              onClick={() => setPath(path.slice(0, i + 1))}
              className="hover:text-slate-900 dark:hover:text-slate-100"
            >
              {f.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">
          {path.length === 0 ? portal.name : node.name}
        </h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          <Share2 className="h-3 w-3" />
          {canEdit ? t("shared.canEdit") : t("shared.readOnly")}
        </span>
        {portal.shareOrigin && (
          <span className="text-xs text-slate-400">{portal.shareOrigin}</span>
        )}
      </div>

      {node.description && <RichTextView html={node.description} />}

      {node.subfolders.length === 0 && node.bookmarks.length === 0 && (
        <div className="text-sm text-slate-400">{t("linked.empty")}</div>
      )}

      {node.subfolders.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {node.subfolders.map((sf) => (
            <FolderCard
              key={sf.id}
              folder={sf}
              canEdit={canEdit}
              onOpen={() => setPath([...path, sf.id])}
              onEdit={() => setEditing(sf)}
            />
          ))}
        </div>
      )}

      {node.bookmarks.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {node.bookmarks.map((b) => (
            <BookmarkCard
              key={b.id}
              bookmark={b}
              canEdit={canEdit}
              onEdit={() => setEditing(b)}
            />
          ))}
        </div>
      )}

      {editing && (
        <SharedNodeEditor
          shareId={shareId}
          node={editing}
          baseRev={data.rev}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["shared-content", shareId] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CardEdit({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onEdit();
      }}
      title={t("common.edit")}
      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <PencilLine className="h-4 w-4" />
    </button>
  );
}

function FolderCard({
  folder,
  canEdit,
  onOpen,
  onEdit,
}: {
  folder: SharedFolderPayload;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const count = folder.subfolders.length + folder.bookmarks.length;
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <FolderIcon className="h-9 w-9 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <div className="truncate font-medium">{folder.name}</div>
          <div className="text-xs text-slate-400">
            {t("linked.itemCount", { count })}
          </div>
        </div>
      </button>
      {canEdit && <CardEdit onEdit={onEdit} />}
    </div>
  );
}

function BookmarkCard({
  bookmark,
  canEdit,
  onEdit,
}: {
  bookmark: SharedBookmarkPayload;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-start gap-3"
      >
        <Globe className="mt-0.5 h-8 w-8 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <div className="truncate font-medium hover:underline">
            {bookmark.title}
          </div>
          <div className="truncate text-xs text-slate-400">{bookmark.url}</div>
          {bookmark.description && (
            <div className="mt-1 text-sm">
              <RichTextView html={bookmark.description} />
            </div>
          )}
        </div>
      </a>
      {canEdit && <CardEdit onEdit={onEdit} />}
    </div>
  );
}
