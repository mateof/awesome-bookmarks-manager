import type { Editor } from "@tiptap/react";
import { ArrowLeftRight, ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { findKey, type FindMatch } from "../lib/editorFind.js";

/**
 * Find, and replace, inside the note being edited.
 *
 * The browser's own find does not reach here in any useful way: it cannot
 * replace, it scrolls the page rather than the editor, and in a note that is
 * itself inside a scrolling dialog it lands nowhere.
 *
 * **Typing here never moves the focus.** The first version selected each match
 * in the editor and called `focus()` so it would be visible, which meant the
 * caret was yanked out of this box after two or three letters and the search
 * ran on half a word. The matches are drawn by a decoration instead (see
 * `lib/editorFind.ts`): the editor shows them without being focused and
 * without its selection moving.
 *
 * Replacing is the one thing that does touch the document, because it is an
 * edit. It also works on positions rather than on rendered HTML: a match found
 * by walking the DOM would happily rewrite the middle of a reference chip or
 * the source of a formula.
 */
export function EditorFindReplace({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [needle, setNeedle] = useState("");
  const [replacement, setReplacement] = useState("");
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);

  /** Push the query into the plugin and read back how many it found. */
  const search = useCallback(
    (query: string, current: number) => {
      editor.view.dispatch(
        editor.state.tr.setMeta(findKey, { query, current }),
      );
      const state = findKey.getState(editor.state);
      setCount(state?.matches.length ?? 0);
      setIndex(state?.current ?? 0);
      return state?.matches ?? [];
    },
    [editor],
  );

  useEffect(() => {
    search(needle, 0);
  }, [needle, search]);

  // The highlights belong to the bar: leaving them behind would be a note
  // permanently painted yellow from a search somebody closed an hour ago.
  useEffect(
    () => () => {
      editor.view.dispatch(
        editor.state.tr.setMeta(findKey, { query: "", current: 0 }),
      );
    },
    [editor],
  );

  const matches = (): FindMatch[] => findKey.getState(editor.state)?.matches ?? [];

  const go = (to: number) => {
    const all = matches();
    if (all.length === 0) return;
    const wrapped = (to + all.length) % all.length;
    search(needle, wrapped);
    // Scrolled to without focusing: `scrollIntoView` on the view moves the
    // container, `focus()` would move the caret out of this box again.
    const match = all[wrapped];
    if (match) {
      const dom = editor.view.domAtPos(match.from);
      const node = dom.node as HTMLElement;
      (node.nodeType === 1 ? node : node.parentElement)?.scrollIntoView({
        block: "center",
      });
    }
  };

  const replaceOne = () => {
    const all = matches();
    const match = all[index];
    if (!match) return;
    editor
      .chain()
      .insertContentAt({ from: match.from, to: match.to }, replacement)
      .run();
    search(needle, index);
  };

  /**
   * All of them, from the end backwards.
   *
   * Replacing forwards invalidates every position after the first change as
   * soon as the replacement is a different length from what it replaced. Going
   * backwards means the positions still ahead are the ones not touched yet.
   */
  const replaceAll = () => {
    const chain = editor.chain();
    for (const match of [...matches()].reverse()) {
      chain.insertContentAt({ from: match.from, to: match.to }, replacement);
    }
    chain.run();
    search(needle, 0);
  };

  return (
    <div
      data-testid="editor-find"
      className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-1 py-1 dark:border-slate-700 dark:bg-slate-800"
    >
      <input
        value={needle}
        autoFocus
        onChange={(e) => setNeedle(e.target.value)}
        placeholder={t("richText.find")}
        aria-label={t("richText.find")}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            go(e.shiftKey ? index - 1 : index + 1);
          }
          if (e.key === "Escape") onClose();
        }}
        className="h-6 w-32 rounded border border-slate-300 bg-white px-1.5 text-xs outline-none dark:border-slate-600 dark:bg-slate-900"
      />
      <span className="w-16 shrink-0 text-center text-[11px] text-slate-400">
        {count === 0 ? t("richText.noMatches") : `${index + 1}/${count}`}
      </span>
      <button
        type="button"
        onClick={() => go(index - 1)}
        title={t("richText.findPrev")}
        aria-label={t("richText.findPrev")}
        className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        title={t("richText.findNext")}
        aria-label={t("richText.findNext")}
        className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <input
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        placeholder={t("richText.replaceWith")}
        aria-label={t("richText.replaceWith")}
        className="h-6 w-32 rounded border border-slate-300 bg-white px-1.5 text-xs outline-none dark:border-slate-600 dark:bg-slate-900"
      />
      <button
        type="button"
        onClick={replaceOne}
        disabled={count === 0}
        className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] disabled:opacity-40 dark:border-slate-600"
      >
        {t("richText.replace")}
      </button>
      <button
        type="button"
        onClick={replaceAll}
        disabled={count === 0}
        className="flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] disabled:opacity-40 dark:border-slate-600"
      >
        <ArrowLeftRight className="h-3 w-3" />
        {t("richText.replaceAll")}
      </button>
      <button
        type="button"
        onClick={onClose}
        title={t("common.close")}
        aria-label={t("common.close")}
        className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
