import { useMutation } from "@tanstack/react-query";
import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isConflict } from "../api.js";
import { BackgroundPicker } from "./BackgroundPicker.js";
import { bestContrastRatio } from "../lib/contrast.js";
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
  const [textTone, setTextTone] = useState<"auto" | "light" | "dark">(
    (target.kind === "folder" ? target.folder.textTone : target.bookmark.textTone) ??
      "auto",
  );
  const [err, setErr] = useState<string | null>(null);

  const imageUrl =
    target.kind === "folder"
      ? target.folder.imageBlobPath
        ? api.folderBgImageUrl(target.folder.id, target.folder.updatedAt)
        : null
      : target.bookmark.imageBlobPath
        ? api.bookmarkBgImageUrl(target.bookmark.id, target.bookmark.updatedAt)
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
          textTone,
          baseRev: target.folder.rev,
        });
      } else {
        await api.updateBookmark(target.bookmark.id, {
          bgColor,
          textTone,
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
        <TextToneField
          value={textTone}
          onChange={setTextTone}
          bgColor={bgColor}
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

/**
 * Manual override for the text drawn over the background.
 *
 * "Automático" is the right answer nearly always, and it is the default; this
 * exists for the mid-tone colours where neither white nor near-black is
 * comfortable. The measured contrast is shown next to it so the choice is
 * informed rather than a guess: below 4.5 fails WCAG AA for body text.
 */
function TextToneField({
  value,
  onChange,
  bgColor,
}: {
  value: "auto" | "light" | "dark";
  onChange: (v: "auto" | "light" | "dark") => void;
  bgColor: string | null;
}) {
  const { t } = useTranslation();
  const ratio = bestContrastRatio(bgColor);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">
          {t("background.textTone")}
        </span>
        {(["auto", "light", "dark"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              value === option
                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {t(`background.tone.${option}` as "background.tone.auto")}
          </button>
        ))}
      </div>
      {ratio !== null && value === "auto" && (
        <p
          className={`text-[11px] ${
            ratio < 4.5 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"
          }`}
        >
          {ratio < 4.5
            ? t("background.lowContrast", { ratio: ratio.toFixed(1) })
            : t("background.goodContrast", { ratio: ratio.toFixed(1) })}
        </p>
      )}
    </div>
  );
}
