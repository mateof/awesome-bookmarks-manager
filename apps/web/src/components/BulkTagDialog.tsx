import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { Modal } from "./Modal.js";
import { TagPicker } from "./TagPicker.js";

/**
 * Put tags on everything currently selected.
 *
 * It **adds**, and says so on the label. The items in a selection rarely carry
 * the same tags, so a picker pre-filled with "the" current tags would have to
 * either lie about a mixed state or destroy it on save. Starting empty and only
 * ever adding is the one behaviour that means the same thing for every item in
 * the selection.
 */
export function BulkTagDialog({
  folderIds,
  bookmarkIds,
  onClose,
}: {
  folderIds: string[];
  bookmarkIds: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const count = folderIds.length + bookmarkIds.length;

  const apply = useMutation({
    mutationFn: () => api.applyTags({ folderIds, bookmarkIds, tagIds }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      // A selection can hold something shared read-only. Saying nothing would
      // leave the reader thinking every item was tagged.
      if (r.skipped > 0) {
        setErr(t("tags.bulkSkipped", { count: r.skipped }));
        return;
      }
      onClose();
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  return (
    <Modal title={t("tags.bulkTitle", { count })} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("tags.bulkHint", { count })}
        </p>
        <TagPicker value={tagIds} onChange={setTagIds} autoFocus />
        {err && (
          <div className="rounded bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {err}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            disabled={tagIds.length === 0 || apply.isPending}
            onClick={() => {
              setErr(null);
              apply.mutate();
            }}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {t("tags.bulkApply")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
