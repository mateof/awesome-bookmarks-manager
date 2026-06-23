import { useMutation } from "@tanstack/react-query";
import type { Bookmark } from "@awesome-bookmarks/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { BackgroundPicker } from "./BackgroundPicker.js";
import { IconPicker } from "./IconPicker.js";
import { Modal } from "./Modal.js";
import { RichTextEditor } from "./RichTextEditor.js";
import { TagPicker } from "./TagPicker.js";

interface Props {
  bookmark: Bookmark;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Shared bookmark edit dialog used from FolderPage kebab and from
 * BookmarkDetailPage. Receives the full bookmark object so the caller
 * doesn't have to break it down field by field.
 */
export function BookmarkEditDialog({ bookmark, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(bookmark.title);
  const [url, setUrl] = useState(bookmark.url);
  const [description, setDescription] = useState(bookmark.description ?? "");
  const [tagIds, setTagIds] = useState<string[]>(bookmark.tagIds ?? []);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bgColor, setBgColor] = useState<string | null>(bookmark.bgColor ?? null);
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      await api.updateBookmark(bookmark.id, {
        title,
        url,
        description: description || null,
        tagIds,
        bgColor,
      });
      if (iconFile) await api.uploadBookmarkIcon(bookmark.id, iconFile);
    },
    onSuccess: () => {
      setErr(null);
      onSaved();
      onClose();
    },
    onError: (e) =>
      setErr(e instanceof Error ? e.message : t("folder.errorGenericSave")),
  });

  return (
    <Modal title={t("bookmark.dialogEditTitle")} onClose={onClose} size="lg">
      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("bookmark.fieldTitle")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("bookmark.fieldUrl")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <IconPicker
          currentUrl={
            bookmark.iconBlobPath ? api.bookmarkIconUrl(bookmark.id) : null
          }
          onPick={async (f) => setIconFile(f)}
          autoFetchUrl={url}
        />
        <RichTextEditor value={description} onChange={setDescription} />
        <TagPicker value={tagIds} onChange={setTagIds} />
        <BackgroundPicker
          bgColor={bgColor}
          onBgColorChange={setBgColor}
          currentImageUrl={
            bookmark.imageBlobPath
              ? api.bookmarkBgImageUrl(bookmark.id)
              : null
          }
          onImagePick={async (f) => {
            await api.uploadBookmarkBgImage(bookmark.id, f);
            onSaved();
          }}
          onImageClear={async () => {
            await api.clearBookmarkBgImage(bookmark.id);
            onSaved();
          }}
        />
        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
        <button
          disabled={!title || !url || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </Modal>
  );
}
