import {
  SLUG_RE,
  slugify,
  type Attachment,
  type AttachmentEntity,
} from "@awesome-bookmarks/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api.js";
import { Modal } from "./Modal.js";

/**
 * Name, description and slug for an attachment — on the way in and afterwards.
 *
 * One dialog for both because the fields are the same and the difference is
 * only whether there are bytes to send. Splitting it would mean two forms that
 * have to agree about slug validation, which is exactly the kind of pair that
 * drifts.
 *
 * The slug is the interesting field: it is what a note writes down to point at
 * this file, so it is suggested from the file name the moment one is picked,
 * and a collision is reported rather than silently worked around. Being handed
 * a different key than the one you typed would break the reference you were
 * about to write.
 */
export function AttachmentDialog({
  entity,
  entityId,
  file,
  existing,
  onClose,
  onDone,
}: {
  entity: AttachmentEntity;
  entityId: string;
  /** Set when uploading; null when editing an attachment that already exists. */
  file?: File | null;
  existing?: Attachment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? file?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [slug, setSlug] = useState(
    existing?.slug || slugify(file?.name ?? "archivo"),
  );
  const [err, setErr] = useState<string | null>(null);

  const valid = SLUG_RE.test(slug);

  const submit = useMutation({
    mutationFn: async () => {
      if (existing) {
        await api.updateAttachment(existing.id, {
          name: name.trim() || existing.name,
          description: description.trim() || null,
          slug,
        });
        return;
      }
      if (!file) return;
      await api.uploadAttachment(entity, entityId, file, {
        name: name.trim() || file.name,
        description: description.trim() || undefined,
        slug,
      });
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => {
      // 409 is specifically "that slug is taken", which deserves its own
      // sentence next to the field rather than a generic failure.
      if (e instanceof ApiError && e.status === 409) {
        setErr(t("attachments.slugTaken"));
        return;
      }
      setErr(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <Modal
      title={t(existing ? "attachments.editTitle" : "attachments.uploadTitle", {
        name: existing?.name ?? file?.name ?? "",
      })}
      onClose={onClose}
      size="md"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            {t("attachments.nameLabel")}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            {t("attachments.slugLabel")}
          </span>
          <input
            value={slug}
            onChange={(e) => {
              // Typed freely but folded as you go, so the field can only ever
              // hold something the server will accept.
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              setErr(null);
            }}
            aria-invalid={!valid}
            className={`w-full rounded border px-2 py-1.5 font-mono text-sm dark:bg-slate-800 ${
              valid
                ? "border-slate-300 dark:border-slate-700"
                : "border-red-400 dark:border-red-500"
            }`}
          />
          <span className="mt-1 block text-xs text-slate-400">
            {valid
              ? t("attachments.slugHint", { slug })
              : t("attachments.slugInvalid")}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            {t("attachments.descriptionLabel")}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!valid || submit.isPending}
            onClick={() => submit.mutate()}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {submit.isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
