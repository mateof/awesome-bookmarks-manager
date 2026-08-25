import { ChevronDown, ChevronUp, Maximize2, PencilLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Modal } from "./Modal.js";
import { RichTextView } from "./RichTextView.js";

/**
 * A description that stays out of the way until you want it.
 *
 * A folder's notes sit above its contents, so a long one pushes every bookmark
 * below the fold. The text is capped at a fixed height and scrolls *inside*
 * that cap — unfolding in place, which is what this used to do, just moved the
 * problem: the expanded text pushed the folder's contents down anyway. For
 * reading comfortably there is a maximise button that opens the whole text in
 * a full-screen dialog.
 *
 * The controls only appear when the text actually overflows: a two-line note
 * should not grow buttons that do nothing. Height is measured rather than
 * guessed from character count, because the content is rich text — an image
 * or a table takes far more room than its length suggests.
 */

/** Below this much overflow the cap is not worth a scrollbar. */
const OVERFLOW_TOLERANCE = 8;

interface Props {
  html: string;
  /** Cap height in pixels. */
  collapsedHeight?: number;
  className?: string;
  /**
   * When given, a pencil sits in the text's top-right corner. Present only
   * where the text is the reader's to change: a shared or public view passes
   * nothing and gets no button.
   */
  onEdit?: () => void;
}

export function CollapsibleRichText({
  html,
  collapsedHeight = 240,
  className,
  onEdit,
}: Props) {
  const { t } = useTranslation();
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const { pathname } = useLocation();

  /**
   * Close the full view when the page underneath changes.
   *
   * A note can link to another folder or bookmark, and following one from the
   * expanded view used to leave the overlay sitting on top of the page you had
   * just arrived at, still showing the note you came from. React Router keeps
   * this component mounted when only the route parameter changes, so nothing
   * unmounted the dialog and nothing reset the state.
   *
   * Keyed on the route rather than wired into the link handler on purpose: any
   * way of leaving the page should close it, and the reference chip is only the
   * one that made it obvious.
   */
  useEffect(() => {
    setFull(false);
  }, [pathname]);

  const measure = useCallback(() => {
    const el = innerRef.current;
    if (el) setContentHeight(el.scrollHeight);
  }, []);

  // Rich text settles late: fonts swap, images decode, embeds resize. A single
  // measurement on mount would be taken before any of that and get the answer
  // wrong, so keep watching the element instead.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, html]);

  /**
   * A note holding a database starts folded, and opens to its full height.
   *
   * These are the two halves of the same problem. A table is a component you
   * work with, so once it is open it must not be squeezed into 240 pixels of
   * scroll: that shows its header, hides every row and reads as broken. But
   * *always* open was worse in the other direction — a grid is tall, so any
   * folder with a table in its note pushed its own bookmarks off the screen,
   * every time you opened it, whether or not you came for the table.
   *
   * So: folded to a strip until asked, then uncapped. Prose keeps the plain
   * cap it always had, which is not the same gesture and does not need one.
   */
  const hasDatabase = html.includes("data-db-id");
  const [folded, setFolded] = useState(hasDatabase);
  // A different entity's note is a different decision: arriving somewhere new
  // should start folded again rather than inherit what you did on the last one.
  useEffect(() => {
    setFolded(hasDatabase);
  }, [pathname, hasDatabase]);

  const overflows =
    !hasDatabase &&
    contentHeight !== null &&
    contentHeight > collapsedHeight + OVERFLOW_TOLERANCE;

  return (
    <div className={`group relative ${className ?? ""}`}>
      {/* Always visible rather than hover-only: on a touch screen there is no
          hover to reveal them, and a control nobody finds is not a control. */}
      <span className="absolute right-0 top-0 z-10 flex items-center gap-1">
        {overflows && (
          <button
            type="button"
            onClick={() => setFull(true)}
            title={t("richText.viewFull")}
            aria-label={t("richText.viewFull")}
            className="rounded border border-slate-300 bg-white/80 p-1 text-slate-400 backdrop-blur hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title={t("richText.editText")}
            aria-label={t("richText.editText")}
            className="rounded border border-slate-300 bg-white/80 p-1 text-slate-400 backdrop-blur hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <PencilLine className="h-3.5 w-3.5" />
          </button>
        )}
      </span>

      <div
        data-testid="collapsible-text"
        // The scrollbar only appears when the cap actually bites, so a short
        // note renders exactly as before. Folded it is hidden instead of
        // scrolled: a strip you can scroll invites you to work in it, and this
        // one is a preview.
        className={
          folded ? "overflow-hidden" : overflows ? "overflow-y-auto" : undefined
        }
        style={
          folded || !hasDatabase ? { maxHeight: collapsedHeight } : undefined
        }
      >
        <div ref={innerRef}>
          <RichTextView
            html={html}
            className={onEdit || overflows ? "[&>*:first-child]:pr-16" : undefined}
          />
        </div>
      </div>

      {hasDatabase && (
        <>
          {/* Fades the cut edge, so a folded note looks cut on purpose rather
              than clipped by accident. Click-through, or it would swallow the
              clicks meant for the text under it. */}
          {folded && (
            <div className="pointer-events-none -mt-8 h-8 bg-gradient-to-b from-transparent to-white dark:to-slate-900" />
          )}
          <button
            type="button"
            onClick={() => setFolded((v) => !v)}
            aria-expanded={!folded}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-slate-200 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {folded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
            {folded ? t("richText.unfold") : t("richText.fold")}
          </button>
        </>
      )}

      {full && (
        <Modal
          title={t("richText.fullViewTitle")}
          onClose={() => setFull(false)}
          size="xl"
        >
          <RichTextView html={html} />
        </Modal>
      )}
    </div>
  );
}
