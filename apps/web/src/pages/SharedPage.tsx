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
import {
  SharedNodeEditor,
  type SharedBookmarkPayload,
  type SharedFolderPayload,
  type SharedPayload,
} from "../components/SharedNodeEditor.js";
import { SharedFolderActions } from "../components/SharedFolderActions.js";
import { SharedGrid } from "../components/SharedGrid.js";
import {
  SharedTrail,
  UpLevelButton,
  useSharedPath,
} from "../components/SharedTreeView.js";

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
  content: SharedPayload;
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
  const [editing, setEditing] = useState<SharedPayload | null>(null);
  const data = q.data && "content" in q.data ? q.data : null;

  if (q.isLoading)
    return <div className="text-slate-400">{t("common.loading")}</div>;
  if (!data)
    return <div className="text-slate-400">{t("shared.cannotLoad")}</div>;

  const canEdit = data.access === "editor";
  return (
    <div className="space-y-3">
      {data.content.type === "folder" ? (
        <FolderShareView
          shareId={shareId}
          root={data.content}
          canEdit={canEdit}
          {...(canEdit
            ? {
                edit: {
                  baseRev: data.rev,
                  onDone: () =>
                    qc.invalidateQueries({
                      queryKey: ["shared-content", shareId],
                    }),
                },
              }
            : {})}
          onEdit={setEditing}
        />
      ) : (
        <BookmarkShareView
          content={data.content}
          canEdit={canEdit}
          onEdit={setEditing}
        />
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
          onChanged={() =>
            qc.invalidateQueries({ queryKey: ["shared-content", shareId] })
          }
        />
      )}
    </div>
  );
}

function ShareHeader({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  return (
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

/**
 * A shared folder, browsed one level at a time like the owner's own view (and
 * like the linked-folder portal) rather than as one nested dump: the same
 * cards, the same backgrounds and icons, and an up-level button.
 */
function FolderShareView({
  shareId,
  root,
  canEdit,
  edit,
  onEdit,
}: {
  shareId: string;
  root: SharedFolderPayload;
  canEdit: boolean;
  /** Present when the viewer may change the share. */
  edit?: { baseRev: number; onDone: () => void };
  onEdit: (node: SharedPayload) => void;
}) {
  const nav = useSharedPath(root);
  const inSubfolder = nav.inSubfolder;
  return (
    <>
      <ShareHeader canEdit={canEdit} />
      {/* At the root the crumb would just repeat the heading, so the trail
          only appears once there is somewhere to go back to. */}
      {inSubfolder && (
        <div className="flex items-center gap-2">
          <UpLevelButton onClick={nav.up} />
          <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
            <button
              type="button"
              onClick={() => nav.goTo(0)}
              className="font-medium text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-100"
            >
              {root.name}
            </button>
            <SharedTrail trail={nav.trail} onGoTo={nav.goTo} />
          </nav>
        </div>
      )}
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{nav.node.name}</h1>
        {canEdit && <EditButton onClick={() => onEdit(nav.node)} />}
      </div>
      {canEdit && edit && (
        <SharedFolderActions
          shareId={shareId}
          node={nav.node}
          baseRev={edit.baseRev}
          onDone={edit.onDone}
        />
      )}

      <SharedGrid
        shareId={shareId}
        node={nav.node}
        root={root}
        canEdit={canEdit}
        baseRev={edit?.baseRev ?? 0}
        onOpen={nav.open}
        onEdit={onEdit}
        onDone={edit?.onDone ?? (() => undefined)}
      />
    </>
  );
}

function BookmarkShareView({
  content,
  canEdit,
  onEdit,
}: {
  content: SharedBookmarkPayload;
  canEdit: boolean;
  onEdit: (node: SharedPayload) => void;
}) {
  return (
    <>
      <ShareHeader canEdit={canEdit} />
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{content.title}</h1>
          {canEdit && <EditButton onClick={() => onEdit(content)} />}
        </div>
        <a
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-sm text-blue-600 hover:underline"
        >
          {content.url}
        </a>
        {content.description && (
          <CollapsibleRichText html={content.description} />
        )}
      </div>
    </>
  );
}
