import type { Editor } from "@tiptap/react";
import { ArrowLeftRight, ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Find, and replace, inside the note being edited.
 *
 * The browser's own find does not reach here in any useful way: it cannot
 * replace, it scrolls the page rather than the editor, and in a note that is
 * itself inside a scrolling dialog it lands nowhere. A note long enough to
 * need the maximise button is long enough to need this.
 *
 * It works on the document's text positions rather than on the DOM, which is
 * what makes replacing safe: a match found by walking rendered HTML would
 * happily rewrite the middle of a reference chip or the source of a formula.
 */
interface Match {
  from: number;
  to: number;
}

function findMatches(editor: Editor, needle: string): Match[] {
  if (!needle) return [];
  const out: Match[] = [];
  const lower = needle.toLowerCase();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let at = text.indexOf(lower);
    while (at !== -1) {
      out.push({ from: pos + at, to: pos + at + needle.length });
      at = text.indexOf(lower, at + needle.length);
    }
  });
  return out;
}

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
  // Bumped after every edit so the matches are recomputed: the document has
  // moved underneath them and stale positions replace the wrong text.
  const [revision, setRevision] = useState(0);

  const matches = useMemo(
    () => findMatches(editor, needle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, needle, revision],
  );

  const go = (to: number) => {
    const match = matches[to];
    if (!match) return;
    setIndex(to);
    editor
      .chain()
      .focus()
      .setTextSelection({ from: match.from, to: match.to })
      .scrollIntoView()
      .run();
  };

  useEffect(() => {
    if (matches.length === 0) return;
    go(Math.min(index, matches.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.length]);

  const replaceOne = () => {
    const match = matches[index];
    if (!match) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: match.from, to: match.to }, replacement)
      .run();
    setRevision((r) => r + 1);
  };

  /**
   * All of them, from the end backwards.
   *
   * Replacing forwards invalidates every position after the first change as
   * soon as the replacement is a different length from what it replaced. Going
   * backwards means the positions still ahead are the ones not touched yet.
   */
  const replaceAll = () => {
    const chain = editor.chain().focus();
    for (const match of [...matches].reverse()) {
      chain.insertContentAt({ from: match.from, to: match.to }, replacement);
    }
    chain.run();
    setRevision((r) => r + 1);
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
            go((index + 1) % Math.max(matches.length, 1));
          }
          if (e.key === "Escape") onClose();
        }}
        className="h-6 w-32 rounded border border-slate-300 bg-white px-1.5 text-xs outline-none dark:border-slate-600 dark:bg-slate-900"
      />
      <span className="w-16 shrink-0 text-center text-[11px] text-slate-400">
        {matches.length === 0
          ? t("richText.noMatches")
          : `${index + 1}/${matches.length}`}
      </span>
      <button
        type="button"
        onClick={() => go((index - 1 + matches.length) % Math.max(matches.length, 1))}
        title={t("richText.findPrev")}
        aria-label={t("richText.findPrev")}
        className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => go((index + 1) % Math.max(matches.length, 1))}
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
        disabled={matches.length === 0}
        className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] disabled:opacity-40 dark:border-slate-600"
      >
        {t("richText.replace")}
      </button>
      <button
        type="button"
        onClick={replaceAll}
        disabled={matches.length === 0}
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
