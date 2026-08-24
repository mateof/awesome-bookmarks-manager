import { FileText, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsibleRichText } from "./CollapsibleRichText.js";
import { EntitySection, SectionAction } from "./EntitySection.js";

/**
 * The note on a folder or bookmark, with its own way in.
 *
 * The section used to disappear entirely when the note was empty, which meant
 * the only route to writing a first one was the kebab menu's "Edit", and that
 * opens the whole entity dialog — every field, to type one. Worse, it made the
 * feature invisible: nothing on the page said a note was even possible.
 *
 * So the section is always there when you may write, and says so. The button is
 * the same one in both states and only its label changes, because "add" and
 * "edit" are the same act from where the reader sits.
 */
export function DescriptionSection({
  html,
  canEdit,
  onEdit,
}: {
  html: string | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const has = !!html && html.trim().length > 0;

  // Nothing written and nothing you could do about it: the heading would be a
  // label on an empty space.
  if (!has && !canEdit) return null;

  return (
    <EntitySection
      icon={<FileText className="h-3.5 w-3.5" />}
      title={t("description.heading")}
      // Only when there is nothing yet. With a note written, the pencil that
      // appears over the text is already the way in and sits next to what it
      // edits; a second button in the header would be the same act twice.
      action={
        canEdit && !has ? (
          <SectionAction onClick={onEdit} icon={<Plus className="h-3 w-3" />}>
            {t("description.add")}
          </SectionAction>
        ) : undefined
      }
    >
      {has ? (
        <CollapsibleRichText
          html={html!}
          {...(canEdit ? { onEdit } : {})}
        />
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded border border-dashed border-slate-300 px-3 py-2 text-left text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-700 dark:hover:text-slate-300"
        >
          {t("description.empty")}
        </button>
      )}
    </EntitySection>
  );
}
