import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FolderClosed, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
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

function SharedItemView({ shareId }: { shareId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["shared-content", shareId],
    queryFn: () => api.getSharedContent(shareId) as Promise<Payload>,
  });
  if (q.isLoading) return <div className="text-slate-400">{t("common.loading")}</div>;
  if (!q.data) return <div className="text-slate-400">{t("shared.cannotLoad")}</div>;
  return (
    <div className="space-y-3">
      <Link
        to="/shared"
        className="text-sm text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
      >
        {t("shared.backArrow")}
      </Link>
      <Render payload={q.data} />
    </div>
  );
}

function Render({ payload }: { payload: Payload }) {
  if (payload.type === "bookmark") {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{payload.title}</h1>
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
      <h1 className="text-xl font-semibold">{payload.name}</h1>
      {payload.description && <RichTextView html={payload.description} />}
      {payload.bookmarks.map((b) => (
        <div
          key={b.id}
          className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
        >
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
          >
            {b.title}
          </a>
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
            <Render payload={sf} />
          </div>
        </details>
      ))}
    </div>
  );
}
