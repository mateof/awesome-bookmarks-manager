import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearFind, focusFind, highlightFind } from "../lib/findInDom.js";

/**
 * Find inside a note you are reading.
 *
 * The browser's own find is not an answer here: the note lives inside a dialog
 * that scrolls on its own, so Ctrl+F scrolls the page behind it, and on a
 * phone there is no Ctrl+F at all. A long note is exactly the one you open
 * full screen, and exactly the one where you are looking for one line.
 *
 * It highlights as you type and never moves the focus out of the box — the
 * same rule the editor's find had to learn: a search that jumps away after the
 * third character is a search you cannot finish typing into.
 */
export function ReadFindBar({
  container,
  onClose,
}: {
  container: React.RefObject<HTMLElement | null>;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-highlighted on every keystroke, and cleaned up when the bar goes away:
  // leaving `<mark>` elements behind would change what a later copy-paste of
  // the note produces.
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const found = highlightFind(root, query);
    setCount(found);
    setIndex(0);
    if (found > 0) focusFind(root, 0);
    return () => clearFind(root);
  }, [query, container]);

  const go = (next: number) => {
    const root = container.current;
    if (!root || count === 0) return;
    const wrapped = (next + count) % count;
    setIndex(wrapped);
    focusFind(root, wrapped);
  };

  return (
    <div
      data-testid="read-find"
      className="flex shrink-0 items-center gap-1 rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            go(e.shiftKey ? index - 1 : index + 1);
          }
          if (e.key === "Escape" && onClose) onClose();
        }}
        placeholder={t("richText.find")}
        aria-label={t("richText.find")}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <span className="w-14 shrink-0 text-center text-[11px] text-slate-400">
        {count === 0 ? t("richText.noMatches") : `${index + 1}/${count}`}
      </span>
      <button
        type="button"
        onClick={() => go(index - 1)}
        title={t("richText.findPrev")}
        aria-label={t("richText.findPrev")}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        title={t("richText.findNext")}
        aria-label={t("richText.findNext")}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          title={t("common.close")}
          aria-label={t("common.close")}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
