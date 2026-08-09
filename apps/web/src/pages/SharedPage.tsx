import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FolderClosed, PencilLine, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api, isConflict } from "../api.js";
import { Modal } from "../components/Modal.js";
import { RichTextEditor } from "../components/RichTextEditor.js";
import { RichTextView } from "../components/RichTextView.js";

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

function SharedList() {
  const { t } = useTranslation();
  const shared = useQuery({ queryKey: ["shared"], queryFn: api.listShared });

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{t("shared.myShared")}</h1>
      {shared.isLoading && <div className="text-slate-400">{t("common.loading")}</div>}
      <div className="space-y-2">
        {(shared.data ?? []).map((s) => (
          <Link
            key={s.id}
            to={`/shared/${s.id}`}
            className="flex items-center gap-3 rounded border border-slate-200 bg-white p-3 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            {s.sourceType === "folder" ? (
              <FolderClosed className="h-5 w-5 text-slate-400" />
            ) : (
              <ExternalLink className="h-5 w-5 text-slate-400" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium">
                {s.sourceType === "folder"
                  ? t("shared.folderShared")
                  : t("shared.bookmarkShared")}
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Users className="h-3 w-3" />
                {s.groupName} · {t("bookmarksBar.sharedByUser", { email: s.sharedByEmail })}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                s.access === "editor"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {s.access === "editor" ? t("shared.canEdit") : t("shared.readOnly")}
            </span>
            <span className="text-xs uppercase text-slate-400">
              {s.payloadStatus}
            </span>
          </Link>
        ))}
        {(shared.data ?? []).length === 0 && !shared.isLoading && (
          <div className="text-sm text-slate-400">{t("shared.nothingShared")}</div>
        )}
      </div>
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
        {payload.description && <RichTextView html={payload.description} />}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{payload.name}</h1>
        {canEdit && <EditButton onClick={() => onEdit(payload)} />}
      </div>
      {payload.description && <RichTextView html={payload.description} />}
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
              <RichTextView html={b.description} />
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

function SharedNodeEditor({
  shareId,
  node,
  baseRev,
  onClose,
  onSaved,
}: {
  shareId: string;
  node: Payload;
  baseRev: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isBookmark = node.type === "bookmark";
  const [title, setTitle] = useState(
    node.type === "bookmark" ? node.title : node.name,
  );
  const [url, setUrl] = useState(node.type === "bookmark" ? node.url : "");
  const [description, setDescription] = useState(node.description ?? "");
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      api.editSharedNode(shareId, node.id, {
        ...(isBookmark ? { title, url } : { name: title }),
        description: description || null,
        baseRev,
      }),
    onSuccess: () => {
      setErr(null);
      onSaved();
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
    <Modal title={t("shared.editNode")} onClose={onClose} size="lg">
      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            isBookmark
              ? t("bookmark.fieldTitle")
              : t("folder.fieldFolderName")
          }
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        {isBookmark && (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("bookmark.fieldUrl")}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
          />
        )}
        <RichTextEditor value={description} onChange={setDescription} />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={m.isPending}
            onClick={() => m.mutate()}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {m.isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
