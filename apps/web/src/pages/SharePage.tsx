import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { ApiError } from "../api.js";

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

export function SharePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchShare = async (pwd?: string) => {
    setErr(null);
    try {
      const res = await fetch(`/api/share/${token}`, {
        headers: pwd ? { "x-share-password": pwd } : {},
      });
      const body = await res.json();
      if (!res.ok)
        throw new ApiError(res.status, body.code ?? "", body.error ?? t("common.error"));
      if (body.needsPassword) {
        setNeedsPassword(true);
        return;
      }
      setNeedsPassword(false);
      setData(body.payload);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("common.error"));
    }
  };

  useEffect(() => {
    void fetchShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-600">
        {err}
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex h-full items-center justify-center">
        <form
          className="space-y-2 rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          onSubmit={(e) => {
            e.preventDefault();
            void fetchShare(password);
          }}
        >
          <h1 className="font-semibold">{t("share.needsPassword")}</h1>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-64 rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
          />
          <button className="w-full rounded bg-slate-900 py-2 text-white dark:bg-slate-100 dark:text-slate-900">
            {t("share.view")}
          </button>
        </form>
      </div>
    );
  }

  if (!data) return <div className="p-6 text-slate-400">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Render payload={data} />
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
        {payload.description && (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: payload.description }}
          />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{payload.name}</h1>
      {payload.description && (
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: payload.description }}
        />
      )}
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
        </div>
      ))}
      {payload.subfolders.map((sf) => (
        <details
          key={sf.id}
          className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
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
