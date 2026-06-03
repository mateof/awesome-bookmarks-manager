import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  Image as ImageIcon,
  Maximize2,
  PencilLine,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { Breadcrumbs } from "../components/Breadcrumbs.js";
import { IconPicker } from "../components/IconPicker.js";
import { Modal } from "../components/Modal.js";
import { RichTextEditor } from "../components/RichTextEditor.js";
import { RichTextView } from "../components/RichTextView.js";
import { ShareToGroup } from "../components/ShareToGroup.js";
import { TagChipList } from "../components/TagChip.js";
import { TagPicker } from "../components/TagPicker.js";

export function BookmarkDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["bookmark", id],
    queryFn: () => api.getBookmark(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.snapshotStatus === "pending" || data?.snapshotStatus === "running"
        ? 3000
        : false;
    },
  });
  const refresh = useMutation({
    mutationFn: () => api.refreshSnapshot(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookmark", id] });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
    },
    onError: (e) => {
      alert(
        e instanceof Error
          ? t("bookmark.cannotEnqueue", { message: e.message })
          : t("bookmark.cannotEnqueueGeneric"),
      );
    },
  });
  const [showEdit, setShowEdit] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [view, setView] = useState<"reader" | "screenshot">("reader");
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });

  if (!q.data) return <div className="text-slate-400">{t("common.loading")}</div>;
  const b = q.data;

  const backTo = b.folderId ? `/folder/${b.folderId}` : "/";

  return (
    <div className="space-y-3">
      <Breadcrumbs folderId={b.folderId} trailing={b.title} />
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={backTo}
          title={t("bookmark.backToFolder")}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {b.iconBlobPath ? (
          <img
            src={api.bookmarkIconUrl(b.id)}
            alt=""
            className="h-8 w-8 rounded object-cover"
          />
        ) : (
          <ImageIcon className="h-6 w-6 text-slate-400" />
        )}
        <h1 className="truncate text-xl font-semibold">{b.title}</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" /> {t("bookmark.openUrl")}
          </a>
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending || b.snapshotStatus === "running"}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            title={t("bookmark.reSnapshotTitle")}
          >
            <RefreshCw
              className={`h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`}
            />
            {refresh.isPending
              ? t("bookmark.enqueuing")
              : b.snapshotStatus === "running"
                ? t("bookmark.generating")
                : t("bookmark.reSnapshot")}
          </button>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <PencilLine className="h-4 w-4" /> {t("common.edit")}
          </button>
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Share2 className="h-4 w-4" /> {t("common.share")}
          </button>
          <button
            onClick={async () => {
              if (!confirm(t("folder.confirmDeleteBookmark", { title: b.title }))) return;
              try {
                await api.deleteBookmark(b.id);
                qc.invalidateQueries({ queryKey: ["bookmarks"] });
                nav("/");
              } catch (e) {
                alert(
                  e instanceof Error
                    ? t("folder.couldNotDelete", { message: e.message })
                    : t("folder.couldNotDeleteGeneric"),
                );
              }
            }}
            className="flex items-center gap-1 rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
          >
            <Trash2 className="h-4 w-4" /> {t("common.delete")}
          </button>
        </div>
      </div>

      <div className="break-all text-sm text-slate-500">{b.url}</div>

      {(b.tagIds?.length ?? 0) > 0 && (
        <TagChipList
          tagIds={b.tagIds ?? []}
          allTags={tagsQ.data ?? []}
          asLink
        />
      )}

      {b.description && <RichTextView html={b.description} />}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase text-slate-500">
            {t("bookmark.snapshotHeading")}
          </h2>
          <span className="text-xs text-slate-400">({b.snapshotStatus})</span>
          {b.snapshotStatus === "error" && b.snapshotError && (
            <span
              className="ml-2 truncate text-xs text-red-600"
              title={b.snapshotError}
            >
              {b.snapshotError.slice(0, 100)}
            </span>
          )}
          {b.hasSnapshot && (
            <div className="ml-auto flex gap-1">
              <button
                onClick={() => setView("reader")}
                className={`rounded px-2 py-0.5 text-xs ${
                  view === "reader"
                    ? "bg-slate-200 dark:bg-slate-700"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {t("bookmark.viewHtml")}
              </button>
              <button
                onClick={() => setView("screenshot")}
                className={`rounded px-2 py-0.5 text-xs ${
                  view === "screenshot"
                    ? "bg-slate-200 dark:bg-slate-700"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {t("bookmark.viewScreenshot")}
              </button>
              <a
                href={
                  view === "reader"
                    ? api.bookmarkSnapshotUrl(b.id)
                    : api.bookmarkScreenshotUrl(b.id)
                }
                target="_blank"
                rel="noopener noreferrer"
                title={t("bookmark.openInTab")}
                className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Maximize2 className="h-3 w-3 text-slate-400" />
              </a>
            </div>
          )}
        </div>
        <SnapshotViewer
          bookmarkId={b.id}
          status={b.snapshotStatus}
          hasSnapshot={b.hasSnapshot}
          view={view}
        />
      </div>

      {showEdit && (
        <EditBookmarkDialog
          bookmarkId={b.id}
          initial={{
            title: b.title,
            url: b.url,
            description: b.description ?? "",
            iconUrl: b.iconBlobPath ? api.bookmarkIconUrl(b.id) : null,
            tagIds: b.tagIds ?? [],
          }}
          onClose={() => setShowEdit(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["bookmark", b.id] })}
        />
      )}
      {showShare && (
        <ShareToGroup
          sourceType="bookmark"
          sourceId={b.id}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

function SnapshotViewer({
  bookmarkId,
  status,
  hasSnapshot,
  view,
}: {
  bookmarkId: string;
  status: string;
  hasSnapshot: boolean;
  view: "reader" | "screenshot";
}) {
  const { t } = useTranslation();
  const [iframeKey, setIframeKey] = useState(0);
  useEffect(() => setIframeKey((k) => k + 1), [bookmarkId]);

  if (!hasSnapshot) {
    if (status === "pending" || status === "running") {
      return (
        <div className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          {t("bookmark.generatingSnapshot")}
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="rounded border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600 dark:border-red-900 dark:bg-red-950">
          {t("bookmark.snapshotFailed")}
        </div>
      );
    }
    return (
      <div className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        {t("bookmark.noSnapshot")}
      </div>
    );
  }

  if (view === "screenshot") {
    return (
      <img
        src={api.bookmarkScreenshotUrl(bookmarkId)}
        alt={t("bookmark.screenshotAlt")}
        className="w-full rounded border border-slate-200 dark:border-slate-800"
      />
    );
  }

  return (
    <iframe
      key={iframeKey}
      src={api.bookmarkSnapshotUrl(bookmarkId)}
      title={t("bookmark.snapshotIframeTitle")}
      sandbox=""
      className="h-[70vh] w-full rounded border border-slate-200 bg-white dark:border-slate-800"
    />
  );
}

function EditBookmarkDialog({
  bookmarkId,
  initial,
  onClose,
  onSaved,
}: {
  bookmarkId: string;
  initial: {
    title: string;
    url: string;
    description: string;
    iconUrl: string | null;
    tagIds: string[];
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial.title);
  const [url, setUrl] = useState(initial.url);
  const [description, setDescription] = useState(initial.description);
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      await api.updateBookmark(bookmarkId, {
        title,
        url,
        description: description || null,
        tagIds,
      });
      if (iconFile) await api.uploadBookmarkIcon(bookmarkId, iconFile);
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
    <Modal title={t("bookmark.dialogEditTitle")} onClose={onClose} size="lg">
      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("bookmark.fieldTitle")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("bookmark.fieldUrl")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <IconPicker
          currentUrl={initial.iconUrl}
          onPick={async (f) => setIconFile(f)}
          autoFetchUrl={url}
        />
        <RichTextEditor value={description} onChange={setDescription} />
        <TagPicker value={tagIds} onChange={setTagIds} />
        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
        <button
          disabled={!title || !url || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </Modal>
  );
}
