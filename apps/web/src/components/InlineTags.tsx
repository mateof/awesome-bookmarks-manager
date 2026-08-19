import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Tag as TagIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { TagChipList } from "./TagChip.js";
import { TagPicker } from "./TagPicker.js";

/**
 * A folder's or bookmark's tags, shown and edited where you are already
 * looking at them.
 *
 * Before this, the detail of a folder showed no tags at all and a bookmark's
 * were read-only: adding one meant opening the edit dialog, finding the field
 * among the name, URL and colours, and saving the whole form.
 *
 * Saves on every change rather than behind a confirm, like the favourite star
 * next to it: adding a tag is a single-field, instantly-visible edit, and a
 * dialog around it would defeat the point.
 *
 * It deliberately sends no `baseRev`. The description editor does send one,
 * because there a stale overwrite loses paragraphs of writing; here the field
 * is a set of ids the user is looking at, and refusing an add because someone
 * changed the folder's colour elsewhere would cost more than the race it
 * prevents.
 */
export function InlineTags({
  entity,
  id,
  tagIds,
  onSaved,
}: {
  entity: "folder" | "bookmark";
  id: string;
  tagIds: string[];
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });

  const save = useMutation({
    mutationFn: async (next: string[]): Promise<void> => {
      if (entity === "folder") await api.updateFolder(id, { tagIds: next });
      else await api.updateBookmark(id, { tagIds: next });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      onSaved();
    },
  });

  if (editing) {
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TagPicker value={tagIds} onChange={(next) => save.mutate(next)} />
        </div>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-1 flex shrink-0 items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Check className="h-3.5 w-3.5" /> {t("common.done")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tagIds.length > 0 ? (
        <TagChipList tagIds={tagIds} allTags={tagsQ.data ?? []} asLink />
      ) : (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <TagIcon className="h-3.5 w-3.5" /> {t("tags.noneYet")}
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={t("tags.addHere")}
        className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:hover:text-slate-100"
      >
        <Plus className="h-3 w-3" /> {t("tags.addHere")}
      </button>
    </div>
  );
}
