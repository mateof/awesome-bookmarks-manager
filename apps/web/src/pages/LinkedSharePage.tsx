import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Home, Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { SharedFolderActions } from "../components/SharedFolderActions.js";
import {
  SharedFolderBody,
  SharedTrail,
  UpLevelButton,
  useSharedPath,
} from "../components/SharedTreeView.js";
import {
  SharedNodeEditor,
  type SharedPayload,
} from "../components/SharedNodeEditor.js";

interface SharedResponse {
  content: SharedPayload;
  access: "viewer" | "editor";
  rev: number;
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

  const data = q.data && "content" in q.data ? q.data : null;
  const root =
    data && data.content.type === "folder"
      ? data.content
      : { type: "folder" as const, id: "", name: "", description: null, bookmarks: [], subfolders: [] };
  // Hooks cannot sit behind the early returns below, so the path is resolved
  // against an empty root while the share is loading.
  const nav = useSharedPath(root);
  const [editing, setEditing] = useState<SharedPayload | null>(null);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["shared-content", shareId] });

  if (folders.isLoading)
    return <div className="text-slate-400">{t("common.loading")}</div>;
  if (!portal || !shareId)
    return <div className="text-slate-400">{t("linked.notLinked")}</div>;
  if (q.isLoading)
    return <div className="text-slate-400">{t("common.loading")}</div>;
  if (!data || data.content.type !== "folder")
    return <div className="text-slate-400">{t("linked.unavailable")}</div>;

  const canEdit = data.access === "editor";
  const inSubfolder = nav.inSubfolder;

  return (
    <div className="space-y-4">
      {/* Breadcrumb: back to home context + drill trail inside the share.
          The up-level button only appears once there is a level to go up to;
          at the root of the share, the "Inicio" crumb is that exit. */}
      <div className="flex items-center gap-2">
        {inSubfolder && <UpLevelButton onClick={nav.up} />}
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
            onClick={() => nav.goTo(0)}
            className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-100"
          >
            <Share2 className="h-3.5 w-3.5 text-blue-500" />
            {portal.name}
          </button>
          <SharedTrail trail={nav.trail} onGoTo={nav.goTo} />
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">
          {inSubfolder ? nav.node.name : portal.name}
        </h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          <Share2 className="h-3 w-3" />
          {canEdit ? t("shared.canEdit") : t("shared.readOnly")}
        </span>
        {portal.shareOrigin && (
          <span className="text-xs text-slate-400">{portal.shareOrigin}</span>
        )}
      </div>

      {canEdit && (
        <SharedFolderActions
          shareId={shareId}
          folderId={nav.node.id}
          baseRev={data.rev}
          onDone={refresh}
        />
      )}

      <SharedFolderBody
        shareId={shareId}
        node={nav.node}
        canEdit={canEdit}
        {...(canEdit ? { edit: { baseRev: data.rev, onDone: refresh } } : {})}
        onOpen={nav.open}
        onEdit={setEditing}
      />

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
