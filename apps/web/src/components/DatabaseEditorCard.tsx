import { useQuery } from "@tanstack/react-query";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { DB_BLOCK_CLASS } from "../lib/richDatabase.js";

/**
 * How an embedded database looks *inside the editor*.
 *
 * Not the grid: the grid lives where the note is read, because editing prose
 * and filling in a hundred cells are different jobs. But a bare box with a name
 * in it tells you nothing, so this says what the table is, how big it is, and
 * lets you rename it without leaving the editor, which is otherwise the one
 * thing you cannot do to a database from anywhere.
 */
export function DatabaseEditorCard({ node, updateAttributes }: NodeViewProps) {
  const { t } = useTranslation();
  const id = node.attrs.dbId as string | null;
  const [name, setName] = useState((node.attrs.dbName as string) ?? "");
  const [editing, setEditing] = useState(false);

  const { data, isError, refetch } = useQuery({
    queryKey: ["database", id],
    queryFn: () => api.getDatabase(id!),
    enabled: !!id,
  });

  // Follow the server, except while the field is being typed in.
  useEffect(() => {
    if (!editing && data?.name) setName(data.name);
  }, [data?.name, editing]);

  const commit = async () => {
    setEditing(false);
    const next = name.trim();
    if (!id || !next || next === data?.name) return;
    await api.renameDatabase(id, next);
    // Written into the note as well, so the block still names the table when
    // it is rendered somewhere that has not loaded the data yet.
    updateAttributes({ dbName: next });
    await refetch();
  };

  return (
    <NodeViewWrapper
      as="div"
      className={DB_BLOCK_CLASS}
      data-testid="db-editor-card"
    >
      <div className="flex items-center gap-2">
        <Table2 className="h-4 w-4 shrink-0 opacity-70" />
        {editing ? (
          <input
            value={name}
            autoFocus
            aria-label={t("db.renameDatabase")}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setName(data?.name ?? "");
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 py-0.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title={t("db.renameDatabase")}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
          >
            {name || t("db.newName")}
          </button>
        )}
        <span className="shrink-0 text-xs opacity-70">
          {isError
            ? t("db.missing", { name: name })
            : data
              ? t("db.rowCount", { count: data.rows.length })
              : t("db.loading")}
        </span>
      </div>
      <p className="mt-1 text-xs opacity-70">{t("db.editorHint")}</p>
    </NodeViewWrapper>
  );
}
