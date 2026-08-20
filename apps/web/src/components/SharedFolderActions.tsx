import { useMutation } from "@tanstack/react-query";
import {
  FolderPlus,
  Image as ImageIcon,
  Palette,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, isConflict } from "../api.js";
import { dlg } from "./dialogs.js";
import { Modal } from "./Modal.js";

/**
 * Creating and deleting inside a shared folder you have editor access to.
 *
 * The change is visible to the whole group at once, because it goes into the
 * shared copy; it reaches the owner's own folders when they are next online,
 * because those rows are encrypted with their key and nobody else can write
 * them. The hint under the buttons says so rather than letting people guess.
 */
export function SharedFolderActions({
  shareId,
  folderId,
  baseRev,
  onDone,
  onEditSelf,
}: {
  shareId: string;
  /** The node new items go into: the folder currently open in the share. */
  folderId: string;
  baseRev: number;
  onDone: () => void;
  /** Opens the text editor on the folder you are standing in. */
  onEditSelf?: () => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState<"folder" | "bookmark" | null>(null);
  // The folder you are *inside* is not one of the cards, so its own colour and
  // pictures had nowhere to be changed from. These are its toolbar.
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<"icon" | "image">("icon");
  const pick = (kind: "icon" | "image") => {
    pendingKind.current = kind;
    fileRef.current?.click();
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {onEditSelf && (
          <button
            type="button"
            onClick={onEditSelf}
            title={t("sharedEdit.editThisFolder")}
            className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <PencilLine className="h-4 w-4" /> {t("sharedEdit.editThisFolder")}
          </button>
        )}
        <button
          type="button"
          onClick={() => pick("icon")}
          className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <ImageIcon className="h-4 w-4" /> {t("sharedEdit.icon")}
        </button>
        <button
          type="button"
          onClick={() => pick("image")}
          className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Palette className="h-4 w-4" /> {t("sharedEdit.background")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              await api.uploadSharedAsset(
                shareId,
                folderId,
                pendingKind.current,
                file,
              );
              onDone();
            } catch (err) {
              await dlg.alert(
                err instanceof Error ? err.message : t("common.error"),
              );
            }
          }}
        />
        <button
          type="button"
          onClick={() => setAdding("folder")}
          className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <FolderPlus className="h-4 w-4" /> {t("sharedEdit.newFolder")}
        </button>
        <button
          type="button"
          onClick={() => setAdding("bookmark")}
          className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> {t("sharedEdit.newBookmark")}
        </button>
        <span className="text-xs text-slate-500">{t("sharedEdit.syncHint")}</span>
      </div>
      {adding && (
        <AddDialog
          kind={adding}
          shareId={shareId}
          folderId={folderId}
          baseRev={baseRev}
          onClose={() => setAdding(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function AddDialog({
  kind,
  shareId,
  folderId,
  baseRev,
  onClose,
  onDone,
}: {
  kind: "folder" | "bookmark";
  shareId: string;
  folderId: string;
  baseRev: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (): Promise<void> => {
      if (kind === "folder") {
        await api.createSharedFolder(shareId, {
          parentId: folderId,
          name: name.trim(),
          baseRev,
        });
      } else {
        await api.createSharedBookmark(shareId, {
          folderId,
          url: url.trim(),
          ...(name.trim() ? { title: name.trim() } : {}),
          baseRev,
        });
      }
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) =>
      setErr(
        isConflict(e)
          ? t("common.conflict")
          : e instanceof ApiError
            ? e.message
            : t("common.error"),
      ),
  });

  const ready = kind === "folder" ? name.trim().length > 0 : url.trim().length > 0;
  const input =
    "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

  return (
    <Modal
      title={
        kind === "folder"
          ? t("sharedEdit.newFolderTitle")
          : t("sharedEdit.newBookmarkTitle")
      }
      onClose={onClose}
    >
      <div className="space-y-2">
        {kind === "bookmark" && (
          <input
            autoFocus
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("bookmark.fieldUrl")}
            className={input}
          />
        )}
        <input
          autoFocus={kind === "folder"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            kind === "folder"
              ? t("folder.fieldFolderName")
              : t("bookmark.fieldTitle")
          }
          className={input}
        />
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
            disabled={!ready || create.isPending}
            onClick={() => create.mutate()}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {create.isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Remove a node from a shared folder. Same two-step story as creating one. */
export function SharedDeleteButton({
  shareId,
  nodeId,
  label,
  baseRev,
  onDone,
}: {
  shareId: string;
  nodeId: string;
  label: string;
  baseRev: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const remove = useMutation({
    mutationFn: () => api.deleteSharedNode(shareId, nodeId, baseRev),
    onSuccess: onDone,
    onError: async (e) =>
      dlg.alert(
        isConflict(e)
          ? t("common.conflict")
          : e instanceof Error
            ? e.message
            : t("common.error"),
      ),
  });
  return (
    <button
      type="button"
      title={t("sharedEdit.deleteNode")}
      aria-label={t("sharedEdit.deleteNode", { name: label })}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (
          !(await dlg.confirm({
            message: t("sharedEdit.confirmDelete", { name: label }),
            danger: true,
          }))
        )
          return;
        remove.mutate();
      }}
      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
