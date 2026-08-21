import { Maximize2, PencilLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

  const overflows =
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
        // note renders exactly as before.
        className={overflows ? "overflow-y-auto" : undefined}
        style={{ maxHeight: collapsedHeight }}
      >
        <div ref={innerRef}>
          <RichTextView
            html={html}
            className={onEdit || overflows ? "[&>*:first-child]:pr-16" : undefined}
          />
        </div>
      </div>

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
