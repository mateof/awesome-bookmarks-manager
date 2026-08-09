import { useMutation } from "@tanstack/react-query";
import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isConflict } from "../api.js";
import { BackgroundPicker } from "./BackgroundPicker.js";
import { Modal } from "./Modal.js";

type Target =
  | { kind: "folder"; folder: Folder }
  | { kind: "bookmark"; bookmark: Bookmark };

interface Props {
  target: Target;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Focused per-card appearance editor opened from the 3-dot kebab. Covers
 * background colour + opacity + background image — same controls as the
 * "Apariencia" section of the full edit dialog, but in a tiny modal so the
 * user doesn't have to scroll past every field to change just the look.
 */
export function AppearanceDialog({ target, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const initial =
    target.kind === "folder" ? target.folder.bgColor : target.bookmark.bgColor;
  const [bgColor, setBgColor] = useState<string | null>(initial ?? null);
  const [err, setErr] = useState<string | null>(null);

  const imageUrl =
    target.kind === "folder"
      ? target.folder.imageBlobPath
        ? api.folderBgImageUrl(target.folder.id)
        : null
      : target.bookmark.imageBlobPath
        ? api.bookmarkBgImageUrl(target.bookmark.id)
        : null;

  const uploadImage = (file: File) =>
    target.kind === "folder"
      ? api.uploadFolderBgImage(target.folder.id, file)
      : api.uploadBookmarkBgImage(target.bookmark.id, file);

  const clearImage = () =>
    target.kind === "folder"
      ? api.clearFolderBgImage(target.folder.id)
      : api.clearBookmarkBgImage(target.bookmark.id);

  const saveColor = useMutation({
    mutationFn: async () => {
      if (target.kind === "folder") {
        await api.updateFolder(target.folder.id, {
          bgColor,
          baseRev: target.folder.rev,
        });
      } else {
        await api.updateBookmark(target.bookmark.id, {
          bgColor,
          baseRev: target.bookmark.rev,
        });
      }
    },
    onSuccess: () => {
      setErr(null);
      onSaved();
      onClose();
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
    <Modal title={t("background.dialogTitle")} onClose={onClose} size="md">
      <div className="space-y-3">
        <BackgroundPicker
          bgColor={bgColor}
          onBgColorChange={setBgColor}
          currentImageUrl={imageUrl}
          onImagePick={async (file) => {
            await uploadImage(file);
            onSaved();
          }}
          onImageClear={async () => {
            await clearImage();
            onSaved();
          }}
        />
        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => saveColor.mutate()}
            disabled={saveColor.isPending}
            className="flex-1 rounded bg-slate-900 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {saveColor.isPending ? t("common.saving") : t("common.save")}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
