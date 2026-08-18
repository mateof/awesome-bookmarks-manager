import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RichTextView } from "./RichTextView.js";

/**
 * A description that stays out of the way until you want it.
 *
 * A folder's notes sit above its contents, so a long one pushes every bookmark
 * below the fold and turns "open the folder" into "scroll to find anything".
 * This clamps the text to a few lines and offers to unfold it.
 *
 * The button only appears when the text actually overflows: a two-line note
 * should not grow a control that does nothing. Height is measured rather than
 * guessed from character count, because the content is rich text — an image or
 * a table takes far more room than its length suggests.
 */

/** Below this much overflow the clamp is not worth a control. */
const OVERFLOW_TOLERANCE = 8;

interface Props {
  html: string;
  /** Clamp height in pixels while collapsed. */
  collapsedHeight?: number;
  /**
   * Tailwind gradient origin for the fade, which has to match whatever the
   * text sits on. Defaults to the page background; pass the card's colour when
   * used inside one, or the fade shows as a grey smear.
   */
  fadeFrom?: string;
  className?: string;
}

export function CollapsibleRichText({
  html,
  collapsedHeight = 160,
  fadeFrom = "from-slate-50 dark:from-slate-950",
  className,
}: Props) {
  const { t } = useTranslation();
  const innerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const regionId = useId();

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

  // Moving to another folder reuses this component; without a reset the new
  // description would inherit the previous one's unfolded state.
  useEffect(() => {
    setExpanded(false);
  }, [html]);

  const overflows =
    contentHeight !== null &&
    contentHeight > collapsedHeight + OVERFLOW_TOLERANCE;

  // Until the first measurement lands, render unclamped: a brief flash of the
  // whole text is better than clipping a short description that never needed
  // clamping in the first place.
  const clamp = overflows && !expanded;

  return (
    <div className={className}>
      <div
        id={regionId}
        data-testid="collapsible-text"
        className="relative overflow-hidden motion-safe:transition-[max-height] motion-safe:duration-200"
        style={{
          maxHeight: contentHeight === null
            ? undefined
            : clamp
              ? collapsedHeight
              : contentHeight,
        }}
      >
        <div ref={innerRef}>
          <RichTextView html={html} />
        </div>
        {clamp && (
          // Fades the cut instead of slicing a line in half, so it reads as
          // "there is more" rather than as a rendering bug.
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent ${fadeFrom}`}
          />
        )}
      </div>

      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={regionId}
          className="mt-1 inline-flex items-center gap-1 rounded text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> {t("common.showLess")}
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> {t("common.showMore")}
            </>
          )}
        </button>
      )}
    </div>
  );
}
