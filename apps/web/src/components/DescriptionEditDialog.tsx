import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [justSaved, setJustSaved] = useState(false);
  /**
   * Tracked in state rather than read from the prop, because saving without
   * closing bumps the row's revision. Keeping the original would make the
   * *second* save of the same sitting a spurious conflict against the change
   * this dialog itself had just made.
   */
  const [rev, setRev] = useState(baseRev);
  useEffect(() => setRev(baseRev), [baseRev]);

  const save = useMutation({
    mutationFn: async (close: boolean): Promise<boolean> => {
      // An empty editor means "no description", not an empty paragraph: the
      // <p></p> TipTap leaves behind would keep the text block (and its
      // pencil) on screen with nothing in it.
      const description = value.replace(/<[^>]*>/g, "").trim() ? value : null;
      if (saveOverride) {
        await saveOverride(description);
        return close;
      }
      const body = { description, baseRev: rev };
      const updated =
        entity === "folder"
          ? await api.updateFolder(id, body)
          : await api.updateBookmark(id, body);
      setRev(updated.rev);
      return close;
    },
    onSuccess: (close) => {
      setErr(null);
      onSaved();
      if (close) {
        onClose();
        return;
      }
      // A moment of feedback: without it, "Guardar" on a dialog that stays
      // open looks like a button that did nothing.
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1800);
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
    <div className="flex flex-wrap items-center justify-end gap-2">
      {justSaved && (
        <span className="mr-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          {t("richText.savedJustNow")}
        </span>
      )}
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
        onClick={() => save.mutate(false)}
        className="rounded border border-slate-400 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-500"
      >
        {save.isPending ? t("common.saving") : t("richText.saveKeepOpen")}
      </button>
      <button
        type="button"
        disabled={save.isPending}
        onClick={() => save.mutate(true)}
        className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {t("richText.saveAndClose")}
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
