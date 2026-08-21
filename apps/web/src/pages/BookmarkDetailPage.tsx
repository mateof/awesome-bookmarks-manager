import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  ClipboardCopy,
  ExternalLink,
  FileArchive,
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
import { dlg } from "../components/dialogs.js";
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
import { ExportArchiveDialog } from "../components/ExportArchiveDialog.js";
import { KebabMenu } from "../components/KebabMenu.js";
import { Attachments } from "../components/Attachments.js";
import { CollapsibleRichText } from "../components/CollapsibleRichText.js";
import { DescriptionEditDialog } from "../components/DescriptionEditDialog.js";
import { ShareToGroup } from "../components/ShareToGroup.js";
import { InlineTags } from "../components/InlineTags.js";

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
    onError: async (e) => {
      await dlg.alert(
        e instanceof Error
          ? t("bookmark.cannotEnqueue", { message: e.message })
          : t("bookmark.cannotEnqueueGeneric"),
      );
    },
  });
  const [showEdit, setShowEdit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editDescription, setEditDescription] = useState(false);

  if (!q.data) return <div className="text-slate-400">{t("common.loading")}</div>;
  const b = q.data;

  const backTo = b.folderId ? `/folder/${b.folderId}` : "/";

  const hasCover = !!(b.imageBlobPath || b.bgColor);

  /** Delete, then go home. Unchanged behaviour; it just needed a name once the
   *  button moved into the kebab menu. */
  const remove = async () => {
    if (
      !(await dlg.confirm({
        message: t("folder.confirmDeleteBookmark", { title: b.title }),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await api.deleteBookmark(b.id);
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      nav("/");
    } catch (e) {
      await dlg.alert(
        e instanceof Error
          ? t("folder.couldNotDelete", { message: e.message })
          : t("folder.couldNotDeleteGeneric"),
      );
    }
  };

  return (
    <div className="space-y-3">
      <Breadcrumbs folderId={b.folderId} trailing={b.title} />
      {hasCover && (
        <EntityBanner
          textTone={b.textTone}
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
        <div className="ml-auto flex items-center gap-2">
          {/* One primary action, two icons, everything else behind the kebab.
              Seven equal buttons wrapped onto three rows on a phone, and the
              list only grows; this is the same shape the folder toolbar uses. */}
          <FavoriteToggle bookmark={b} size="h-5 w-5" />
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">{t("bookmark.openUrl")}</span>
          </a>
          <button
            onClick={() => setShowEdit(true)}
            title={t("common.edit")}
            aria-label={t("common.edit")}
            className="rounded border border-slate-300 p-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <PencilLine className="h-4 w-4" />
          </button>
          <KebabMenu
            items={[
              {
                label: t("bookmark.copyLink"),
                icon: <ClipboardCopy className="h-4 w-4" />,
                onClick: () => void copyRichLink(b.title, b.url),
              },
              {
                label:
                  refresh.isPending
                    ? t("bookmark.enqueuing")
                    : b.snapshotStatus === "running"
                      ? t("bookmark.generating")
                      : t("bookmark.reSnapshot"),
                icon: (
                  <RefreshCw
                    className={`h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`}
                  />
                ),
                onClick: () => refresh.mutate(),
              },
              {
                label: t("versions.title"),
                icon: <History className="h-4 w-4" />,
                onClick: () => setShowHistory(true),
              },
              {
                label: t("common.share"),
                icon: <Share2 className="h-4 w-4" />,
                onClick: () => setShowShare(true),
              },
              {
                // The app's own format, for one bookmark: the server has
                // always supported the scope, it just had nothing calling it.
                label: t("archive.exportBookmark"),
                icon: <FileArchive className="h-4 w-4" />,
                onClick: () => setShowExport(true),
              },
              {
                label: t("common.delete"),
                icon: <Trash2 className="h-4 w-4" />,
                danger: true,
                onClick: () => void remove(),
              },
            ]}
          />
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

      <InlineTags
        entity="bookmark"
        id={b.id}
        tagIds={b.tagIds ?? []}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["bookmark", b.id] });
          qc.invalidateQueries({ queryKey: ["bookmarks"] });
        }}
      />

      {b.description && (
        <CollapsibleRichText
          html={b.description}
          onEdit={() => setEditDescription(true)}
        />
      )}

      <Attachments entity="bookmark" id={b.id} />

      {editDescription && (
        <DescriptionEditDialog
          entity="bookmark"
          id={b.id}
          title={b.title}
          html={b.description ?? ""}
          baseRev={b.rev}
          onClose={() => setEditDescription(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["bookmark", b.id] });
            qc.invalidateQueries({ queryKey: ["bookmarks"] });
          }}
        />
      )}

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
      {showExport && (
        <ExportArchiveDialog
          scope="bookmark"
          id={b.id}
          onClose={() => setShowExport(false)}
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

