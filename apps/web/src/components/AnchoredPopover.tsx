import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A panel pinned to an element, rendered outside every container it sits in.
 *
 * An absolutely positioned dropdown is clipped by any ancestor that scrolls,
 * and no `z-index` helps: the element is not painted behind anything, it is cut
 * off. The trap that produces it is quiet — `overflow-x: auto` cannot coexist
 * with `overflow-y: visible`, so a wrapper added to let a wide table scroll
 * sideways silently starts clipping vertically as well, and a dropdown that
 * worked for a year loses its last option.
 *
 * So it goes in a portal on `document.body` with `position: fixed`, measured
 * from the anchor. That is outside every `overflow` in the page by
 * construction, rather than by hoping no ancestor grows one.
 *
 * The price of leaving the flow is that nothing moves it any more, so it is
 * repositioned on scroll and resize. The scroll listener captures, because
 * scroll does not bubble and the container doing the scrolling is exactly the
 * one this is escaping.
 */
export function AnchoredPopover({
  anchor,
  onClose,
  width = 208,
  children,
}: {
  anchor: React.RefObject<HTMLElement>;
  onClose: () => void;
  /** Pixels. Fixed positioning has no parent to take a width from. */
  width?: number;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    maxHeight: number;
    up: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const gap = 4;
      const below = window.innerHeight - a.bottom - gap;
      const above = a.top - gap;
      // Flip up only when below is genuinely too small *and* up is better:
      // flipping on a near-tie makes the panel jump around while you scroll.
      const up = below < 160 && above > below;
      setPos({
        left: Math.max(gap, Math.min(a.left, window.innerWidth - width - gap)),
        top: up ? a.top - gap : a.bottom + gap,
        maxHeight: Math.max(96, Math.min(224, up ? above : below)),
        up,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, width]);

  useLayoutEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The panel is no longer a descendant of the anchor, so "outside" has to
      // name both or the first click inside the list would close it.
      if (panel.current?.contains(target)) return;
      if (anchor.current?.contains(target)) return;
      onClose();
    };
    // Escape closes this panel and stops there. Captured, so it runs before
    // the dialog's own Escape handler and can keep the event from reaching it:
    // dismissing a palette by closing the whole editor underneath it takes the
    // unsaved text with it, which is a steep price for changing your mind
    // about a colour.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={panel}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width,
        maxHeight: pos.maxHeight,
        ...(pos.up ? { transform: "translateY(-100%)" } : {}),
      }}
      className="z-50 overflow-y-auto rounded border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      {children}
    </div>,
    document.body,
  );
}
