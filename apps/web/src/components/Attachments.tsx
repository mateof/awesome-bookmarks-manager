import {
  formatBytes,
  MAX_ATTACHMENT_BYTES,
  type Attachment,
  type AttachmentEntity,
} from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { dlg } from "./dialogs.js";

/**
 * Files attached to a folder or a bookmark.
 *
 * Kept separate from the description's inline images on purpose. An image
 * pasted into a note is part of the text and rides inside the same encrypted
 * field; an attachment is a file the user wants to keep and download again,
 * so it gets its own blob, its own quota accounting and its own row.
 *
 * The list is its own query, only ever run on a detail view. Nothing about
 * browsing folders or listing bookmarks touches it, which is why adding this
 * feature does not slow navigation down.
 */
export function Attachments({
  entity,
  id,
  /** False in read-only contexts; the list still renders, the buttons do not. */
  canEdit = true,
}: {
  entity: AttachmentEntity;
  id: string;
  canEdit?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);

  const key = ["attachments", entity, id];
  const { data: files } = useQuery({
    queryKey: key,
    queryFn: () => api.listAttachments(entity, id),
  });

  const upload = useMutation({
    // Takes a plain array, never the input's own FileList: clearing the
    // input's value (which the change handler must do) empties that list, and
    // the mutation body runs a tick later — it would find nothing to upload
    // and report success having sent zero files.
    mutationFn: async (list: File[]) => {
      // Sequential rather than parallel: each upload is checked against the
      // quota as it lands, and three concurrent 25 MB seals is a lot of heap
      // for no gain the user would notice.
      for (const file of list) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(
            t("attachments.tooLarge", {
              name: file.name,
              max: formatBytes(MAX_ATTACHMENT_BYTES, i18n.language),
            }),
          );
        }
        await api.uploadAttachment(entity, id, file);
      }
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: key });
      // The bytes count against the quota, so the storage figure is now stale.
      qc.invalidateQueries({ queryKey: ["storage"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const remove = useMutation({
    mutationFn: (attachmentId: string) => api.deleteAttachment(attachmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["storage"] });
    },
  });

  const list = files ?? [];
  // An empty section on every bookmark that has no files would be clutter, so
  // when there is nothing to show only the add button remains.
  if (list.length === 0 && !canEdit) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase text-slate-500">
          <Paperclip className="h-3.5 w-3.5" />
          {t("attachments.heading")}
          {list.length > 0 && (
            <span className="text-slate-400">({list.length})</span>
          )}
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            className="ml-auto flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Plus className="h-3 w-3" />
            {upload.isPending
              ? t("attachments.uploading")
              : t("attachments.add")}
          </button>
        )}
        <input
          ref={inputRef}
          data-testid="attachment-input"
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            // Clear it, or picking the same file twice in a row does nothing.
            e.target.value = "";
            if (picked.length) upload.mutate(picked);
          }}
        />
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {list.length === 0 ? (
        <p className="text-xs text-slate-400">{t("attachments.empty")}</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {list.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-2 py-1.5">
              {f.previewable ? (
                <button
                  type="button"
                  onClick={() => setPreview(f)}
                  title={t("attachments.preview")}
                  className="shrink-0"
                >
                  <img
                    src={api.attachmentUrl(f.id, true)}
                    alt=""
                    className="h-8 w-8 rounded object-cover"
                  />
                </button>
              ) : (
                <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm" title={f.name}>
                  {f.name}
                </div>
                <div className="text-xs text-slate-400">
                  {formatBytes(f.sizeBytes, i18n.language)}
                </div>
              </div>
              <a
                href={api.attachmentUrl(f.id)}
                download={f.name}
                title={t("attachments.download")}
                aria-label={t("attachments.download")}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <Download className="h-4 w-4" />
              </a>
              {canEdit && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await dlg.confirm({
                      message: t("attachments.confirmDelete", { name: f.name }),
                      danger: true,
                    });
                    if (ok) remove.mutate(f.id);
                  }}
                  title={t("attachments.delete")}
                  aria-label={t("attachments.delete")}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <button
          type="button"
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          aria-label={t("common.close")}
        >
          <img
            src={api.attachmentUrl(preview.id, true)}
            alt={preview.name}
            className="max-h-full max-w-full rounded object-contain"
          />
        </button>
      )}
    </div>
  );
}
