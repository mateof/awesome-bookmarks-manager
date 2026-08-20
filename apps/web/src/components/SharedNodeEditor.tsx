import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isConflict } from "../api.js";
import { BackgroundPicker } from "./BackgroundPicker.js";
import { IconPicker } from "./IconPicker.js";
import { Modal } from "./Modal.js";
import { RichTextEditor } from "./RichTextEditor.js";
import { TagPicker } from "./TagPicker.js";

/**
 * The look the owner gave a node, carried in the share so the recipient sees
 * the same folder rather than a generic card.
 *
 * Every field is optional: shares sealed before this existed are read back
 * from disk unchanged until their owner next triggers a re-seal.
 *
 * `icon` and `image` are cache-busting version tokens, not paths. The bytes
 * come from `api.sharedAssetUrl`, because the owner's own icon endpoint needs
 * the owner's key.
 */
export interface SharedAppearance {
  bgColor?: string | null;
  textTone?: "auto" | "light" | "dark" | null;
  favorite?: boolean;
  tags?: { name: string; color: string }[];
  icon?: string | null;
  image?: string | null;
}

export interface SharedBookmarkPayload extends SharedAppearance {
  type: "bookmark";
  id: string;
  title: string;
  url: string;
  description: string | null;
}

export interface SharedFolderPayload extends SharedAppearance {
  type: "folder";
  id: string;
  name: string;
  description: string | null;
  bookmarks: SharedBookmarkPayload[];
  subfolders: SharedFolderPayload[];
}

export type SharedPayload = SharedBookmarkPayload | SharedFolderPayload;

/**
 * Edit a node inside an editable ("editor") group share.
 *
 * Deliberately the same form, in the same order, as the personal folder and
 * bookmark dialogs: name (or title + URL), the icon picker with its library
 * and emoji, the rich-text description, tags, background. A shared folder you
 * can edit should feel like one of your own; the only differences are where
 * each field is sent — the share's endpoints instead of the personal ones —
 * and that tags travel by name, because the owner's tag ids mean nothing in
 * this account.
 *
 * Fields are saved as separate operations, each queued for the owner, so only
 * what actually changed is sent. `baseRev` guards the first write; the rest
 * follow it in the same user action, so re-checking each one against a rev the
 * previous op just bumped would reject our own edit.
 */
export function SharedNodeEditor({
  shareId,
  node,
  baseRev,
  onClose,
  onSaved,
  onChanged,
}: {
  shareId: string;
  node: SharedPayload;
  baseRev: number;
  onClose: () => void;
  /** Saved and done: the caller closes the dialog and refreshes. */
  onSaved: () => void;
  /**
   * Something changed but the dialog stays open — an image upload applies
   * immediately, like the personal dialog's. Without a separate callback the
   * caller's onSaved would slam the dialog shut mid-edit.
   */
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const isBookmark = node.type === "bookmark";
  const [title, setTitle] = useState(
    node.type === "bookmark" ? node.title : node.name,
  );
  const [url, setUrl] = useState(node.type === "bookmark" ? node.url : "");
  const [description, setDescription] = useState(node.description ?? "");
  const [tagNames, setTagNames] = useState<string[]>(
    (node.tags ?? []).map((tg) => tg.name),
  );
  const [bgColor, setBgColor] = useState<string | null>(node.bgColor ?? null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Immediate operations (image upload/clear) bump the share's rev; the final
  // save has to check against the latest one or it would 409 on our own edit.
  const revRef = useRef(baseRev);

  const m = useMutation({
    mutationFn: async () => {
      // Text first, with the rev the dialog was opened on; the rest are part
      // of the same action and follow without re-checking (each op bumps the
      // rev, so re-using baseRev would reject our own second write).
      await api.editSharedNode(shareId, node.id, {
        ...(isBookmark ? { title, url } : { name: title }),
        description: description || null,
        baseRev: revRef.current,
      });
      const before = (node.tags ?? []).map((tg) => tg.name);
      if (JSON.stringify(before) !== JSON.stringify(tagNames)) {
        await api.setSharedTags(shareId, node.id, tagNames);
      }
      if ((node.bgColor ?? null) !== bgColor) {
        await api.setSharedAppearance(shareId, node.id, { bgColor });
      }
      if (iconFile) {
        await api.uploadSharedAsset(shareId, node.id, "icon", iconFile);
      }
    },
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
          autoFocus
          required
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
        <IconPicker
          currentUrl={
            node.icon
              ? api.sharedAssetUrl(shareId, node.id, "icon", node.icon)
              : null
          }
          fallbackLabel={title}
          onPick={async (file) => setIconFile(file)}
          {...(isBookmark && url ? { autoFetchUrl: url } : {})}
        />
        <RichTextEditor value={description} onChange={setDescription} />
        <TagPicker value={tagNames} onChange={setTagNames} byName />
        <BackgroundPicker
          bgColor={bgColor}
          onBgColorChange={setBgColor}
          currentImageUrl={
            node.image
              ? api.sharedAssetUrl(shareId, node.id, "image", node.image)
              : null
          }
          onImagePick={async (file) => {
            const r = await api.uploadSharedAsset(shareId, node.id, "image", file);
            revRef.current = r.rev;
            onChanged?.();
          }}
          onImageClear={async () => {
            const r = await api.clearSharedAsset(shareId, node.id);
            revRef.current = r.rev;
            onChanged?.();
          }}
        />
        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
        <button
          disabled={!title || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </Modal>
  );
}
