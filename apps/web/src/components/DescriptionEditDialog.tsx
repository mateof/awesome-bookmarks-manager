import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isConflict } from "../api.js";
import { Modal } from "./Modal.js";
import { RichTextEditor } from "./RichTextEditor.js";

/**
 * Edit just the description of a folder or bookmark.
 *
 * Deliberately not the full edit dialog, which is already one click away from
 * the same page: opening the whole form to change a note means scrolling past
 * the name, the URL, the tags and the colours to reach the one field the
 * pencil was pointing at.
 *
 * It also sends *only* the description, with the rev the page was showing. A
 * partial update cannot clobber a field somebody else changed in the meantime,
 * and the rev turns a genuine conflict into a 409 rather than a silent
 * overwrite.
 */
export function DescriptionEditDialog({
  entity,
  id,
  title,
  html,
  baseRev,
  onClose,
  onSaved,
  save: saveOverride,
}: {
  entity: "folder" | "bookmark";
  id: string;
  /** Shown in the dialog header, so it is obvious what is being edited. */
  title: string;
  html: string;
  baseRev: number;
  onClose: () => void;
  onSaved: () => void;
  /** Where the text goes when the row is not this user's own — a share. */
  save?: (description: string | null) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(html);
  const [err, setErr] = useState<string | null>(null);
  const [maximised, setMaximised] = useState(false);

  const save = useMutation({
    // Returns void: the two calls give back different shapes (a Folder and a
    // Bookmark) and nothing here needs either, so discarding keeps the union
    // out of the mutation's type.
    mutationFn: async (): Promise<void> => {
      // An empty editor means "no description", not an empty paragraph: the
      // <p></p> TipTap leaves behind would keep the text block (and its
      // pencil) on screen with nothing in it.
      const description = value.replace(/<[^>]*>/g, "").trim() ? value : null;
      if (saveOverride) {
        await saveOverride(description);
        return;
      }
      const body = { description, baseRev };
      if (entity === "folder") await api.updateFolder(id, body);
      else await api.updateBookmark(id, body);
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

  const buttons = (
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
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {save.isPending ? t("common.saving") : t("common.save")}
      </button>
    </div>
  );

  return (
    <Modal
      title={t("richText.editTitle", { name: title })}
      onClose={onClose}
      size="lg"
      fill
    >
      {/* Fixed height, and the text is the only part that scrolls: the toolbar
          and the buttons stay put however long the note gets. The same buttons
          go to the editor so they are still there when it is maximised. */}
      <RichTextEditor
        value={value}
        onChange={setValue}
        fill
        actions={buttons}
        onMaximisedChange={setMaximised}
      />
      {!maximised && (
        <div className="shrink-0 space-y-2">
          {err && <div className="text-sm text-red-600">{err}</div>}
          {buttons}
        </div>
      )}
    </Modal>
  );
}
