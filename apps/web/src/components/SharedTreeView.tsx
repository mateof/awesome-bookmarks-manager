import { ArrowUp, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type { SharedFolderPayload } from "./SharedNodeEditor.js";

/**
 * The inside of a group share, browsed one folder at a time.
 *
 * Where you are inside it and how you walk back out. The cards themselves are
 * the app's own grid (see SharedGrid): a shared folder you can edit should not
 * look like a lesser version of your own, and the only way to keep that true
 * is to render it with the same components.
 */

/** Resolve the folder node reached by walking `path` (node ids) from root. */
function resolvePath(
  root: SharedFolderPayload,
  path: string[],
): { node: SharedFolderPayload; trail: SharedFolderPayload[] } {
  let node = root;
  const trail: SharedFolderPayload[] = [];
  for (const id of path) {
    const next = node.subfolders.find((f) => f.id === id);
    if (!next) break;
    trail.push(next);
    node = next;
  }
  return { node, trail };
}

/**
 * Where you are inside a share, kept in the URL rather than in component
 * state: a refresh (or a shared link, or the browser's back button) used to
 * drop you back at the root of the share, which is not what any other folder
 * view does.
 *
 * Every move is derived from `trail`, not from the raw ids, so a path that no
 * longer resolves (a subfolder the owner moved or deleted since) collapses to
 * the deepest folder that still exists instead of leaving dead ids behind.
 */
export function useSharedPath(root: SharedFolderPayload) {
  const [params, setParams] = useSearchParams();
  const path = (params.get("p") ?? "").split(".").filter(Boolean);
  const { node, trail } = resolvePath(root, path);

  const set = (ids: string[]) => {
    const next = new URLSearchParams(params);
    if (ids.length > 0) next.set("p", ids.join("."));
    else next.delete("p");
    setParams(next);
  };
  const here = () => trail.map((f) => f.id);

  return {
    path,
    node,
    trail,
    inSubfolder: trail.length > 0,
    open: (id: string) => set([...here(), id]),
    goTo: (depth: number) => set(here().slice(0, depth)),
    up: () => set(here().slice(0, -1)),
  };
}

/** Back to the containing folder, matching the owner's view. */
export function UpLevelButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("folder.upLevel")}
      aria-label={t("folder.upLevel")}
      className="shrink-0 rounded border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}

/** The drill trail inside a share, as breadcrumb buttons. */
export function SharedTrail({
  trail,
  onGoTo,
}: {
  trail: SharedFolderPayload[];
  onGoTo: (depth: number) => void;
}) {
  return (
    <>
      {trail.map((f, i) => (
        <span key={f.id} className="inline-flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          <button
            type="button"
            onClick={() => onGoTo(i + 1)}
            className="hover:text-slate-900 dark:hover:text-slate-100"
          >
            {f.name}
          </button>
        </span>
      ))}
    </>
  );
}

