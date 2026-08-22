import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Plus, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { DatabaseBlock } from "../components/DatabaseBlock.js";
import { dlg } from "../components/dialogs.js";
import { ShareToGroup } from "../components/ShareToGroup.js";

/**
 * Every database in the account, and a full-page view of one.
 *
 * This page is what stops a database becoming unreachable. A table lives in
 * its own tables, not inside the note that embeds it, so deleting the note
 * would otherwise leave rows nobody can open and nobody can delete, quietly
 * occupying the storage quota.
 */
export function DatabasesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams<{ id?: string }>();
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);

  const { data: list } = useQuery({
    queryKey: ["databases"],
    queryFn: () => api.listDatabases(),
    enabled: !id,
  });

  const create = useMutation({
    mutationFn: () => api.createDatabase(t("db.newName")),
    onSuccess: (db) => {
      qc.invalidateQueries({ queryKey: ["databases"] });
      navigate(`/databases/${db.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: (dbId: string) => api.deleteDatabase(dbId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["databases"] });
      qc.invalidateQueries({ queryKey: ["storage"] });
    },
  });

  if (id) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => navigate("/databases")}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t("db.allDatabases")}
        </button>
        <DatabaseBlock databaseId={id} />
      </div>
    );
  }

  const rows = list ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Database className="h-5 w-5" />
          {t("db.allDatabases")}
        </h1>
        <button
          type="button"
          disabled={create.isPending || busy}
          onClick={() => create.mutate()}
          className="ml-auto flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          <Plus className="h-4 w-4" />
          {t("db.newDatabase")}
        </button>
      </div>

      <p className="text-sm text-slate-500">{t("db.pageHint")}</p>

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
          {t("db.noDatabases")}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => navigate(`/databases/${d.id}`)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Database className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {t("db.rowCount", { count: d.rowCount })}
                </span>
              </button>
              {!d.shared && (
                <button
                  type="button"
                  onClick={() => setSharing(d.id)}
                  title={t("db.shareWithGroups")}
                  aria-label={`${t("db.shareWithGroups")}: ${d.name}`}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              )}
              {d.shared && (
                <span
                  title={t("db.sharedAlready")}
                  className="p-1 text-sky-600 dark:text-sky-400"
                >
                  <Share2 className="h-4 w-4" />
                </span>
              )}
              <button
                type="button"
                onClick={async () => {
                  setBusy(true);
                  const ok = await dlg.confirm({
                    message: t("db.confirmDeleteDatabase", { name: d.name }),
                    danger: true,
                  });
                  setBusy(false);
                  if (ok) remove.mutate(d.id);
                }}
                title={t("common.delete")}
                aria-label={`${t("common.delete")}: ${d.name}`}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {sharing && (
        <ShareToGroup
          sourceType="database"
          sourceId={sharing}
          onClose={() => {
            setSharing(null);
            qc.invalidateQueries({ queryKey: ["databases"] });
          }}
        />
      )}
    </div>
  );
}
