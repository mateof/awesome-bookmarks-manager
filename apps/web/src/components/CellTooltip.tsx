import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Reads out a cell that does not fit in its column.
 *
 * A column is narrow because most of its values are short; the one that is a
 * paragraph should not force every row to be tall. Widening or wrapping trades
 * the whole table for one cell, so the long value is shown on hover instead,
 * whole and wrapped, in a card over the grid.
 *
 * Two things make it behave rather than nag:
 *
 * It only appears when the text is **actually cut off**, measured on the
 * element at the moment you point at it (`scrollWidth > clientWidth`). A card
 * that pops up over values you can already read is noise, and a rule based on
 * character count would guess wrong on both sides.
 *
 * It waits. Crossing a wide table on the way to something else drags the
 * pointer over a dozen cells, and a tooltip on each of them would strobe.
 */
const DELAY_MS = 320;
const WIDTH = 340;

export function CellTooltip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);

  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setAt(null);
  };

  return (
    <span
      className="block min-w-0"
      onMouseEnter={(e) => {
        if (!text.trim()) return;
        // The measurable element is whatever is rendering the text: an input
        // for the editable kinds, a span for the rest.
        const host = e.currentTarget.querySelector<HTMLElement>("input, span");
        const cut = host ? host.scrollWidth > host.clientWidth + 1 : false;
        if (!cut) return;
        const box = e.currentTarget.getBoundingClientRect();
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(
          () => setAt({ x: box.left, y: box.bottom }),
          DELAY_MS,
        );
      }}
      onMouseLeave={cancel}
      // Typing in the cell dismisses it: you can see what you are writing, and
      // the card would sit on top of the row below.
      onFocusCapture={cancel}
    >
      {children}
      {at &&
        createPortal(
          <div
            role="tooltip"
            data-testid="cell-tooltip"
            style={{
              position: "fixed",
              left: Math.max(8, Math.min(at.x, window.innerWidth - WIDTH - 8)),
              top: at.y + 6 + 220 < window.innerHeight ? at.y + 6 : undefined,
              bottom:
                at.y + 6 + 220 < window.innerHeight
                  ? undefined
                  : window.innerHeight - at.y + 24,
              width: WIDTH,
            }}
            className="pointer-events-none z-[60] max-h-56 overflow-hidden whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
