import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  ClipboardCopy,
  ExternalLink,
  History,
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
import { copyRichLink } from "../lib/clipboard.js";
import { BookmarkEditDialog } from "../components/BookmarkEditDialog.js";
import { CopyButton } from "../components/CopyButton.js";
import { FavoriteToggle } from "../components/FavoriteToggle.js";
import { LetterIcon } from "../components/LetterIcon.js";
import { VersionHistory } from "../components/VersionHistory.js";
import { Breadcrumbs } from "../components/Breadcrumbs.js";
import { EntityBanner } from "../components/EntityBanner.js";
import { CollapsibleRichText } from "../components/CollapsibleRichText.js";
import { ShareToGroup } from "../components/ShareToGroup.js";
import { TagChipList } from "../components/TagChip.js";

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
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });

  if (!q.data) return <div className="text-slate-400">{t("common.loading")}</div>;
  const b = q.data;

  const backTo = b.folderId ? `/folder/${b.folderId}` : "/";

  const hasCover = !!(b.imageBlobPath || b.bgColor);

  return (
    <div className="space-y-3">
      <Breadcrumbs folderId={b.folderId} trailing={b.title} />
      {hasCover && (
        <EntityBanner
          imageUrl={
            b.imageBlobPath
              ? api.bookmarkBgImageUrl(b.id, b.updatedAt)
              : null
          }
          bgColor={b.bgColor}
          title={b.title}
          subtitle={b.url}
          icon={
            b.iconBlobPath ? (
              <img
                src={api.bookmarkIconUrl(b.id, b.updatedAt)}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-md ring-2 ring-white/70"
              />
            ) : (
              <LetterIcon
                label={b.title || b.url}
                seed={b.url || b.title}
                size="h-14 w-14 shrink-0 rounded-xl shadow-md ring-2 ring-white/70"
              />
            )
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={backTo}
          title={t("bookmark.backToFolder")}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {!hasCover &&
          (b.iconBlobPath ? (
            <img
              src={api.bookmarkIconUrl(b.id, b.updatedAt)}
              alt=""
              className="h-8 w-8 rounded object-cover"
            />
          ) : (
            <LetterIcon label={b.title || b.url} seed={b.url || b.title} size="h-8 w-8" />
          ))}
        {!hasCover && (
          <h1 className="truncate text-xl font-semibold">{b.title}</h1>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FavoriteToggle bookmark={b} size="h-5 w-5" />
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" /> {t("bookmark.openUrl")}
          </a>
          <button
            onClick={() => void copyRichLink(b.title, b.url)}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            title={t("folder.copyLinkKebab")}
          >
            <ClipboardCopy className="h-4 w-4" /> {t("bookmark.copyLink")}
          </button>
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
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <History className="h-4 w-4" /> {t("versions.title")}
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

      <div className="flex items-start gap-1">
        <div className="break-all text-sm text-slate-500">{b.url}</div>
        <CopyButton
          text={b.url}
          title={t("bookmark.copyUrl")}
          size="h-4 w-4"
        />
      </div>

      {(b.tagIds?.length ?? 0) > 0 && (
        <TagChipList
          tagIds={b.tagIds ?? []}
          allTags={tagsQ.data ?? []}
          asLink
        />
      )}

      {b.description && <CollapsibleRichText html={b.description} />}

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
              <a
                href={api.bookmarkSnapshotUrl(b.id)}
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
        />
      </div>

      {showEdit && (
        <BookmarkEditDialog
          bookmark={b}
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
      {showHistory && (
        <VersionHistory
          entityType="bookmark"
          entityId={b.id}
          onClose={() => setShowHistory(false)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["bookmark", b.id] });
            qc.invalidateQueries({ queryKey: ["bookmarks"] });
          }}
        />
      )}
    </div>
  );
}

function SnapshotViewer({
  bookmarkId,
  status,
  hasSnapshot,
}: {
  bookmarkId: string;
  status: string;
  hasSnapshot: boolean;
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

