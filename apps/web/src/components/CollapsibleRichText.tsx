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
  /**
   * Cap height in pixels.
   *
   * Lowered from 240 when the section gained a frame and a row of controls:
   * those cost about fifty pixels, and the whole point of the cap is what sits
   * *under* the note. Paying for the chrome out of the folder's own contents
   * would have quietly undone the thing the cap is for.
   */
  collapsedHeight?: number;
  className?: string;
  /**
   * When given, a pencil sits in the text's top-right corner. Present only
   * where the text is the reader's to change: a shared or public view passes
   * nothing and gets no button.
   */
  onEdit?: () => void;
  /** Saving a checkbox ticked in the note itself. */
  onTaskToggle?: (html: string) => void;
}

export function CollapsibleRichText({
  html,
  collapsedHeight = 200,
  className,
  onEdit,
  onTaskToggle,
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
   * One set of controls for every note, whatever is in it.
   *
   * These used to be two different behaviours: a note with a table folded and
   * unfolded in place, and a note of prose got a button that opened it in a
   * dialog. That was not a rule, it was two features landing a version apart,
   * and "this note is long" behaving in two ways depending on whether somebody
   * embedded a table is the kind of inconsistency you have to explain out loud.
   *
   * So both, always: **unfold here** and **open full screen**, and the choice
   * is the reader's. What does not change is the *default*, which stays
   * folded. Unfolding in place is exactly what the cap was introduced to stop
   * — a long note pushes the folder's own contents off the screen — and that
   * is still true; the difference is that it is now something you ask for
   * rather than something the note decides for you.
   */
  const hasDatabase = html.includes("data-db-id");
  const [unfolded, setUnfolded] = useState(false);
  // A different entity's note is a different decision: arriving somewhere new
  // starts folded again rather than inheriting what you did on the last one.
  useEffect(() => {
    setUnfolded(false);
  }, [pathname, html]);

  const tooTall =
    contentHeight !== null &&
    contentHeight > collapsedHeight + OVERFLOW_TOLERANCE;
  /** There is something behind the fold, so the controls have a job. */
  const foldable = hasDatabase || tooTall;
  const folded = foldable && !unfolded;

  return (
    <div className={`group relative ${className ?? ""}`}>
      {/* Always visible rather than hover-only: on a touch screen there is no
          hover to reveal them, and a control nobody finds is not a control. */}
      <span className="absolute right-0 top-0 z-10 flex items-center gap-1">
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
        /*
         * Folded prose scrolls inside the cap; a folded table does not.
         *
         * The one deliberate difference left, and it follows from the content:
         * you can read text in a 240px window, and a scrollable strip with a
         * grid in it invites you to work in a window far too small to work in.
         */
        className={
          folded && !hasDatabase
            ? "overflow-y-auto"
            : folded
              ? "overflow-hidden"
              : undefined
        }
        style={folded ? { maxHeight: collapsedHeight } : undefined}
      >
        <div ref={innerRef}>
          <RichTextView
            html={html}
            className={onEdit ? "[&>*:first-child]:pr-16" : undefined}
            {...(onTaskToggle ? { onTaskToggle } : {})}
          />
        </div>
      </div>

      {foldable && (
        <>
          {/* Fades the cut edge, so a folded note looks cut on purpose rather
              than clipped by accident. Click-through, or it would swallow the
              clicks meant for the text under it. Only over a table: text that
              scrolls is not cut, it is scrolled. */}
          {folded && hasDatabase && (
            <div className="pointer-events-none -mt-8 h-8 bg-gradient-to-b from-transparent to-white dark:to-slate-900" />
          )}
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setUnfolded((v) => !v)}
              aria-expanded={unfolded}
              className="flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              {folded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
              {folded ? t("richText.unfold") : t("richText.fold")}
            </button>
            {/* The dialog is the other half: unfolding here is for reading a
                bit more without leaving the page, and this is for reading it
                all without the page around it. */}
            <button
              type="button"
              onClick={() => setFull(true)}
              title={t("richText.viewFull")}
              aria-label={t("richText.viewFull")}
              className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
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
