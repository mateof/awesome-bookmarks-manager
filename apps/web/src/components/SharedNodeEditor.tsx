import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isConflict } from "../api.js";
import { Modal } from "./Modal.js";
import { RichTextEditor } from "./RichTextEditor.js";

export interface SharedBookmarkPayload {
  type: "bookmark";
  id: string;
  title: string;
  url: string;
  description: string | null;
  bgColor?: string | null;
}

export interface SharedFolderPayload {
  type: "folder";
  id: string;
  name: string;
  description: string | null;
  bgColor?: string | null;
  bookmarks: SharedBookmarkPayload[];
  subfolders: SharedFolderPayload[];
}

export type SharedPayload = SharedBookmarkPayload | SharedFolderPayload;

/**
 * Edit one node's fields (title/url/name/description) inside an editable
 * ("editor") group share. Shared by the Shared section and the linked-folder
 * (portal) view. Optimistic concurrency via baseRev.
 */
export function SharedNodeEditor({
  shareId,
  node,
  baseRev,
  onClose,
  onSaved,
}: {
  shareId: string;
  node: SharedPayload;
  baseRev: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isBookmark = node.type === "bookmark";
  const [title, setTitle] = useState(
    node.type === "bookmark" ? node.title : node.name,
  );
  const [url, setUrl] = useState(node.type === "bookmark" ? node.url : "");
  const [description, setDescription] = useState(node.description ?? "");
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      api.editSharedNode(shareId, node.id, {
        ...(isBookmark ? { title, url } : { name: title }),
        description: description || null,
        baseRev,
      }),
    onSuccess: () => {
      setErr(null);
      onSaved();
    },
    onError: (e) =>
      setErr(
        isConflict(e)
          ? t("common.conflict")
          : e instanceof Error
            ? e.message
            : t("folder.errorGenericSave"),
      ),
  });

  return (
    <Modal title={t("shared.editNode")} onClose={onClose} size="lg">
      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            isBookmark ? t("bookmark.fieldTitle") : t("folder.fieldFolderName")
          }
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        {isBookmark && (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("bookmark.fieldUrl")}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
          />
        )}
        <RichTextEditor value={description} onChange={setDescription} />
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
            disabled={m.isPending}
            onClick={() => m.mutate()}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {m.isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
