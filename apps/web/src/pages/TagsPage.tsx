import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tag } from "@awesome-bookmarks/shared";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { Modal } from "../components/Modal.js";

const PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

export function TagsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const foldersQ = useQuery({
    queryKey: ["folders"],
    queryFn: api.listFolders,
  });
  const bookmarksQ = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of foldersQ.data ?? []) {
      for (const id of f.tagIds ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    }
    for (const b of bookmarksQ.data ?? []) {
      for (const id of b.tagIds ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [foldersQ.data, bookmarksQ.data]);

  const tags = (tagsQ.data ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const del = useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold">{t("tags.pageTitle")}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
        >
          <Plus className="h-4 w-4" /> {t("tags.newTag")}
        </button>
      </div>

      {tags.length === 0 && !tagsQ.isLoading && (
        <div className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
          {t("tags.empty")}
        </div>
      )}

      <div className="space-y-1">
        {tags.map((tg) => (
          <div
            key={tg.id}
            className="flex items-center gap-3 rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
          >
            <span
              className="h-4 w-4 shrink-0 rounded-full"
              style={{ background: tg.color }}
            />
            <Link
              to={`/tag/${tg.id}`}
              className="flex-1 truncate text-sm font-medium hover:underline"
            >
              {tg.name}
            </Link>
            <span className="text-xs text-slate-500">
              {t("tags.usedInCount", { count: usage.get(tg.id) ?? 0 })}
            </span>
            <button
              onClick={() => setEditing(tg)}
              title={t("common.edit")}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={async () => {
                if (
                  !confirm(
                    t("tags.confirmDelete", {
                      name: tg.name,
                      count: usage.get(tg.id) ?? 0,
                    }),
                  )
                )
                  return;
                del.mutate(tg.id);
              }}
              title={t("common.delete")}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {showCreate && (
        <TagDialog
          onClose={() => setShowCreate(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["tags"] })}
        />
      )}
      {editing && (
        <TagDialog
          tag={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["tags"] })}
        />
      )}
    </div>
  );
}

function TagDialog({
  tag,
  onClose,
  onSaved,
}: {
  tag?: Tag;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!tag;
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? PALETTE[0]!);
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      isEdit
        ? api.updateTag(tag!.id, { name, color })
        : api.createTag({ name, color }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  return (
    <Modal
      title={isEdit ? t("tags.dialogEdit") : t("tags.dialogNew")}
      onClose={onClose}
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">
            {t("tags.fieldName")}
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>

        <div>
          <span className="mb-1 block text-xs text-slate-500">
            {t("tags.fieldColor")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{ background: c }}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-transparent transition hover:scale-110"
              >
                {color === c && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-slate-300 dark:border-slate-700"
            />
          </div>
        </div>

        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
        <button
          disabled={!name.trim() || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending
            ? isEdit
              ? t("common.saving")
              : t("common.creating")
            : isEdit
              ? t("common.save")
              : t("common.create")}
        </button>
      </div>
    </Modal>
  );
}
