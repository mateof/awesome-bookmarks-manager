import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  FolderClosed,
  Link as LinkIcon,
  PencilLine,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { dlg } from "../components/dialogs.js";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { fmtDate } from "../lib/date.js";
import { MoveToDialog } from "../components/MoveToDialog.js";
import { CollapsibleRichText } from "../components/CollapsibleRichText.js";
import { SharedNodeEditor } from "../components/SharedNodeEditor.js";

interface BookmarkPayload {
  type: "bookmark";
  id: string;
  title: string;
  url: string;
  description: string | null;
}

interface FolderPayload {
  type: "folder";
  id: string;
  name: string;
  description: string | null;
  bookmarks: BookmarkPayload[];
  subfolders: FolderPayload[];
}

type Payload = BookmarkPayload | FolderPayload;

export function SharedPage() {
  const { shareId } = useParams();
  if (shareId) return <SharedItemView shareId={shareId} />;
  return <SharedList />;
}

function AccessBadge({ access }: { access: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
        access === "editor"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      {access === "editor" ? t("shared.canEdit") : t("shared.readOnly")}
    </span>
  );
}

function SharedList() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<"withMe" | "byMe">("withMe");
  const [importing, setImporting] = useState<{
    shareId: string;
    mode: "link" | "copy";
  } | null>(null);
  const shared = useQuery({ queryKey: ["shared"], queryFn: api.listShared });
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
  const importShare = useMutation({
    mutationFn: (v: {
      shareId: string;
      parentId: string | null;
      mode: "link" | "copy";
    }) => api.importShare(v.shareId, v.parentId, v.mode),
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      setImporting(null);
      if (r.type !== "folder") {
        nav("/");
        return;
      }
      nav(v.mode === "link" ? `/linked/${r.id}` : `/folder/${r.id}`);
    },
  });
  const byMe = useQuery({
    queryKey: ["shares-by-me"],
    queryFn: api.listSharesByMe,
    enabled: tab === "byMe",
  });
  const revoke = useMutation({
    mutationFn: (s: { groupId: string; id: string }) =>
      api.deleteGroupShare(s.groupId, s.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shares-by-me"] });
      qc.invalidateQueries({ queryKey: ["shared"] });
    },
  });

  const tabCls = (active: boolean) =>
    `rounded px-3 py-1 text-sm ${
      active
        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
        : "hover:bg-slate-100 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{t("shared.title")}</h1>
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab("withMe")} className={tabCls(tab === "withMe")}>
          {t("shared.withMe")}
        </button>
        <button type="button" onClick={() => setTab("byMe")} className={tabCls(tab === "byMe")}>
          {t("shared.byMe")}
        </button>
      </div>

      {tab === "withMe" && (
        <div className="space-y-2">
          {(shared.data ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              {s.sourceType === "folder" ? (
                <FolderClosed className="h-5 w-5 shrink-0 text-slate-400" />
              ) : (
                <ExternalLink className="h-5 w-5 shrink-0 text-slate-400" />
              )}
              <Link to={`/shared/${s.id}`} className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium hover:underline">
                  {s.label ??
                    (s.sourceType === "folder"
                      ? t("shared.folderShared")
                      : t("shared.bookmarkShared"))}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-3 w-3" />
                  {s.groupName} ·{" "}
                  {t("bookmarksBar.sharedByUser", { email: s.sharedByEmail })} ·{" "}
                  {t("shared.sharedOn", { date: fmtDate(s.createdAt) })}
                </div>
              </Link>
              <AccessBadge access={s.access} />
              <button
                type="button"
                disabled={s.payloadStatus !== "ready"}
                onClick={() =>
                  setImporting({ shareId: s.id, mode: "link" })
                }
                title={t("shared.linkToDesc")}
                className="flex shrink-0 items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("shared.link")}</span>
              </button>
              <button
                type="button"
                disabled={s.payloadStatus !== "ready"}
                onClick={() =>
                  setImporting({ shareId: s.id, mode: "copy" })
                }
                title={t("shared.copyToDesc")}
                className="flex shrink-0 items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("shared.copy")}</span>
              </button>
            </div>
          ))}
          {(shared.data ?? []).length === 0 && !shared.isLoading && (
            <div className="text-sm text-slate-400">
              {t("shared.nothingShared")}
            </div>
          )}
        </div>
      )}

      {tab === "byMe" && (
        <div className="space-y-2">
          {(byMe.data ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              {s.sourceType === "folder" ? (
                <FolderClosed className="h-5 w-5 shrink-0 text-slate-400" />
              ) : (
                <ExternalLink className="h-5 w-5 shrink-0 text-slate-400" />
              )}
              <Link to={`/shared/${s.id}`} className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium hover:underline">
                  {s.label ?? t("groups.sharedItem")}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-3 w-3" />
                  {s.groupName} ·{" "}
                  {t("shared.sharedOn", { date: fmtDate(s.createdAt) })}
                </div>
              </Link>
              <AccessBadge access={s.access} />
              <button
                type="button"
                onClick={async () => {
                  if (!(await dlg.confirm({
                    message: t("groups.confirmRemoveShare"),
                    danger: true,
                  }))) return;
                  revoke.mutate({ groupId: s.groupId, id: s.id });
                }}
                title={t("shared.revoke")}
                className="text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {(byMe.data ?? []).length === 0 && !byMe.isLoading && (
            <div className="text-sm text-slate-400">
              {t("shared.byMeEmpty")}
            </div>
          )}
        </div>
      )}

      {importing && (
        <MoveToDialog
          folders={folders.data ?? []}
          movingFolderIds={[]}
          count={1}
          title={
            importing.mode === "link"
              ? t("shared.linkToTitle")
              : t("shared.copyToTitle")
          }
          description={
            importing.mode === "link"
              ? t("shared.linkToDesc")
              : t("shared.copyToDesc")
          }
          confirmLabel={
            importing.mode === "link"
              ? t("shared.linkToConfirm")
              : t("shared.copyToConfirm")
          }
          onClose={() => setImporting(null)}
          onConfirm={(dest) =>
            importShare.mutate({
              shareId: importing.shareId,
              parentId: dest,
              mode: importing.mode,
            })
          }
        />
      )}
    </div>
  );
}

interface SharedResponse {
  content: Payload;
  access: "viewer" | "editor";
  rev: number;
}

function SharedItemView({ shareId }: { shareId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["shared-content", shareId],
    queryFn: () =>
      api.getSharedContent(shareId) as Promise<
        SharedResponse | { error: string }
      >,
  });
  const [editing, setEditing] = useState<Payload | null>(null);

  if (q.isLoading)
    return <div className="text-slate-400">{t("common.loading")}</div>;
  const data = q.data && "content" in q.data ? q.data : null;
  if (!data)
    return <div className="text-slate-400">{t("shared.cannotLoad")}</div>;

  const canEdit = data.access === "editor";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link
          to="/shared"
          className="text-sm text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          {t("shared.backArrow")}
        </Link>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            canEdit
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {canEdit ? t("shared.canEdit") : t("shared.readOnly")}
        </span>
      </div>
      <Render payload={data.content} canEdit={canEdit} onEdit={setEditing} />
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

function EditButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto flex shrink-0 items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      <PencilLine className="h-3 w-3" /> {t("common.edit")}
    </button>
  );
}

function Render({
  payload,
  canEdit,
  onEdit,
}: {
  payload: Payload;
  canEdit: boolean;
  onEdit: (node: Payload) => void;
}) {
  if (payload.type === "bookmark") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{payload.title}</h1>
          {canEdit && <EditButton onClick={() => onEdit(payload)} />}
        </div>
        <a
          href={payload.url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-sm text-blue-600 hover:underline"
        >
          {payload.url}
        </a>
        {payload.description && (
          <CollapsibleRichText html={payload.description} />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{payload.name}</h1>
        {canEdit && <EditButton onClick={() => onEdit(payload)} />}
      </div>
      {payload.description && <CollapsibleRichText html={payload.description} />}
      {payload.bookmarks.map((b) => (
        <div
          key={b.id}
          className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2">
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
            >
              {b.title}
            </a>
            {canEdit && <EditButton onClick={() => onEdit(b)} />}
          </div>
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-slate-500 hover:underline"
          >
            {b.url}
          </a>
          {b.description && (
            <div className="mt-1 text-sm">
              <CollapsibleRichText
                html={b.description}
                collapsedHeight={120}
                fadeFrom="from-white dark:from-slate-900"
              />
            </div>
          )}
        </div>
      ))}
      {payload.subfolders.map((sf) => (
        <details
          key={sf.id}
          className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          open
        >
          <summary className="cursor-pointer font-medium">{sf.name}</summary>
          <div className="mt-2 pl-4">
            <Render payload={sf} canEdit={canEdit} onEdit={onEdit} />
          </div>
        </details>
      ))}
    </div>
  );
}
