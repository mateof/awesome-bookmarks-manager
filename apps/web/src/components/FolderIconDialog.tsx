import type { Folder } from "@awesome-bookmarks/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { IconPicker } from "./IconPicker.js";
import { Modal } from "./Modal.js";

/**
 * Change a folder's icon straight from the sidebar tree, without opening the
 * whole folder editor. Uses the same picker as the edit dialog, so uploads,
 * URLs, the glyph library and emojis all work here too.
 */
export function FolderIconDialog({
  folder,
  onClose,
}: {
  folder: Folder;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["folders"] });
    qc.invalidateQueries({ queryKey: ["folder", folder.id] });
  };

  return (
    <Modal title={t("sidebar.changeIconTitle", { name: folder.name })} onClose={onClose} size="md">
      <IconPicker
        currentUrl={
          folder.iconBlobPath
            ? api.folderIconUrl(folder.aliasOf ?? folder.id, folder.updatedAt)
            : null
        }
        fallbackLabel={folder.name}
        onPick={async (file) => {
          await api.uploadFolderIcon(folder.aliasOf ?? folder.id, file);
          refresh();
        }}
      />
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
        >
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}
