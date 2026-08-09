import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type BookmarkSnapshot,
  type FolderSnapshot,
  type VersionEntity,
  api,
} from "../api.js";
import { Modal } from "./Modal.js";
import { RichTextView } from "./RichTextView.js";

function fmt(iso: string): string {
  const d = new Date(iso.includes("Z") || iso.includes("T") ? iso : `${iso}Z`);
  return d.toLocaleString();
}

/** Read-only render of a version's snapshot fields. */
function SnapshotView({ versionId }: { versionId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["version", versionId],
    queryFn: () => api.getVersion(versionId),
  });
  if (!q.data) return <div className="text-xs text-slate-400">…</div>;
  const s = q.data.snapshot;
  const isBookmark = "url" in s;
  const b = s as BookmarkSnapshot;
  const f = s as FolderSnapshot;
  return (
    <div className="space-y-1 text-sm">
      <div className="text-[11px] uppercase text-slate-400">
        {t("versions.version", { rev: q.data.rev })} · {fmt(q.data.createdAt)}
      </div>
      <div className="font-medium">{isBookmark ? b.title : f.name}</div>
      {isBookmark && (
        <div className="break-all text-xs text-slate-500">{b.url}</div>
      )}
      {s.description && (
        <div className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-800">
          <RichTextView html={s.description} />
        </div>
      )}
      {s.bgColor && (
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span
            className="inline-block h-3 w-3 rounded-full border border-slate-300"
            style={{ background: s.bgColor }}
          />
          {s.bgColor}
        </div>
      )}
    </div>
  );
}

export function VersionHistory({
  entityType,
  entityId,
  onClose,
  onChanged,
}: {
  entityType: VersionEntity;
  entityId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"versions" | "activity">("versions");
  const [compare, setCompare] = useState<string[]>([]);
  const [forkName, setForkName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const versions = useQuery({
    queryKey: ["versions", entityType, entityId],
    queryFn: () => api.listVersions(entityType, entityId),
  });
  const activity = useQuery({
    queryKey: ["activity", entityId],
    queryFn: () => api.folderActivity(entityId),
    enabled: entityType === "folder" && tab === "activity",
  });

  const restore = useMutation({
    mutationFn: (vid: string) =>
      api.restoreVersion(entityType, entityId, vid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["versions", entityType, entityId] });
      onChanged();
      setMsg(t("versions.restored"));
    },
  });
  const fork = useMutation({
    mutationFn: (vid: string) =>
      api.forkVersion(
        entityType,
        entityId,
        vid,
        entityType === "folder"
          ? { name: forkName || undefined }
          : { title: forkName || undefined },
      ),
    onSuccess: () => {
      onChanged();
      setMsg(t("versions.forked"));
    },
  });

  const toggleCompare = (id: string) =>
    setCompare((c) =>
      c.includes(id)
        ? c.filter((x) => x !== id)
        : c.length < 2
          ? [...c, id]
          : [c[1]!, id],
    );

  return (
    <Modal title={t("versions.title")} onClose={onClose} size="lg">
      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("versions")}
            className={`rounded px-3 py-1 text-sm ${tab === "versions" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            {t("versions.tabVersions")}
          </button>
          {entityType === "folder" && (
            <button
              type="button"
              onClick={() => setTab("activity")}
              className={`rounded px-3 py-1 text-sm ${tab === "activity" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              {t("versions.tabActivity")}
            </button>
          )}
        </div>

        {msg && (
          <div className="rounded bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {msg}
          </div>
        )}

        {tab === "versions" && (
          <>
            <div className="flex items-center gap-2">
              <input
                value={forkName}
                onChange={(e) => setForkName(e.target.value)}
                placeholder={t("versions.forkNamePlaceholder")}
                className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {(versions.data ?? []).length === 0 && (
                <div className="text-sm text-slate-400">
                  {t("versions.empty")}
                </div>
              )}
              {(versions.data ?? []).map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm dark:border-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={compare.includes(v.id)}
                    onChange={() => toggleCompare(v.id)}
                    title={t("versions.compare")}
                  />
                  <span className="flex-1">
                    {t("versions.version", { rev: v.rev })}
                    <span className="ml-2 text-xs text-slate-400">
                      {fmt(v.createdAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => restore.mutate(v.id)}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {t("versions.restore")}
                  </button>
                  <button
                    type="button"
                    onClick={() => fork.mutate(v.id)}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {t("versions.fork")}
                  </button>
                </div>
              ))}
            </div>

            {compare.length > 0 && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                {compare.map((id) => (
                  <div
                    key={id}
                    className="rounded border border-slate-200 p-2 dark:border-slate-700"
                  >
                    <SnapshotView versionId={id} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "activity" && (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {(activity.data ?? []).length === 0 && (
              <div className="text-sm text-slate-400">
                {t("versions.activityEmpty")}
              </div>
            )}
            {(activity.data ?? []).map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm dark:border-slate-700"
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${a.entityType === "folder" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
                >
                  {a.entityType === "folder"
                    ? t("versions.folder")
                    : t("versions.bookmark")}
                </span>
                <span className="flex-1 truncate font-medium">{a.label}</span>
                <span className="text-xs text-slate-400">
                  {t("versions.version", { rev: a.rev })} · {fmt(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
