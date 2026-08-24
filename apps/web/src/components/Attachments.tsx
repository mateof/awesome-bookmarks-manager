import {
  formatBytes,
  MAX_ATTACHMENT_BYTES,
  type Attachment,
  type AttachmentEntity,
} from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { AttachmentDialog } from "./AttachmentDialog.js";
import { CopyButton } from "./CopyButton.js";
import { dlg } from "./dialogs.js";
import { EntitySection, SectionAction } from "./EntitySection.js";

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
  /**
   * Files picked but not yet uploaded. They queue rather than upload straight
   * away because each one now gets a name, a description and a slug first, and
   * the slug in particular is worth a look before it becomes the key a note
   * refers to.
   */
  const [queue, setQueue] = useState<File[]>([]);
  const [editing, setEditing] = useState<Attachment | null>(null);

  const key = ["attachments", entity, id];
  const { data: files } = useQuery({
    queryKey: key,
    queryFn: () => api.listAttachments(entity, id),
  });

  const tooBig = (f: File) =>
    t("attachments.tooLarge", {
      name: f.name,
      max: formatBytes(MAX_ATTACHMENT_BYTES, i18n.language),
    });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    // The list feeding the "#" picker is account-wide, so a new file has to
    // invalidate that too or it stays unreferenceable until a reload.
    qc.invalidateQueries({ queryKey: ["attachments", "all"] });
    // The bytes count against the quota, so the storage figure is now stale.
    qc.invalidateQueries({ queryKey: ["storage"] });
  };

  const remove = useMutation({
    mutationFn: (attachmentId: string) => api.deleteAttachment(attachmentId),
    onSuccess: refresh,
  });

  const list = files ?? [];
  // An empty section on every bookmark that has no files would be clutter, so
  // when there is nothing to show only the add button remains.
  if (list.length === 0 && !canEdit) return null;

  return (
    <EntitySection
      icon={<Paperclip className="h-3.5 w-3.5" />}
      title={t("attachments.heading")}
      count={list.length}
      action={
        canEdit ? (
          <SectionAction
            onClick={() => inputRef.current?.click()}
            icon={<Plus className="h-3 w-3" />}
          >
            {t("attachments.add")}
          </SectionAction>
        ) : undefined
      }
    >
      <div className="space-y-2">
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
            const oversized = picked.find((f) => f.size > MAX_ATTACHMENT_BYTES);
            if (oversized) {
              setError(tooBig(oversized));
              return;
            }
            setError(null);
            setQueue(picked);
          }}
        />

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
                    loading="lazy"
                    decoding="async"
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
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  {f.slug ? (
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      #{f.slug}
                    </span>
                  ) : (
                    <span className="italic">{t("attachments.noSlug")}</span>
                  )}
                  <span>·</span>
                  <span>{formatBytes(f.sizeBytes, i18n.language)}</span>
                </div>
                {f.description && (
                  <div
                    className="truncate text-xs text-slate-500 dark:text-slate-400"
                    title={f.description}
                  >
                    {f.description}
                  </div>
                )}
              </div>
              {f.slug && (
                <CopyButton
                  text={`#${f.slug}`}
                  title={t("attachments.copySlug")}
                  size="h-4 w-4"
                />
              )}
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
                  onClick={() => setEditing(f)}
                  title={t("attachments.edit")}
                  aria-label={t("attachments.edit")}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
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

      {queue.length > 0 && queue[0] && (
        <AttachmentDialog
          key={`${queue[0].name}:${queue.length}`}
          entity={entity}
          entityId={id}
          file={queue[0]}
          // Dropping the head either way: cancelling one of a multi-file pick
          // should move on to the next rather than abandon the whole batch.
          onClose={() => setQueue((q) => q.slice(1))}
          onDone={refresh}
        />
      )}

      {editing && (
        <AttachmentDialog
          entity={entity}
          entityId={id}
          existing={editing}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
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
    </EntitySection>
  );
}
