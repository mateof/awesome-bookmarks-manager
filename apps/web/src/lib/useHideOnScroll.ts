import { useEffect, useState, type RefObject } from "react";

/**
 * A bar that gets out of the way going down and comes back at the first hint
 * of going up.
 *
 * A toolbar pinned to the top is worth its space while you are working with it
 * and is a stolen strip of screen while you are reading a long folder — which
 * on a phone is most of the screen. Hiding it on the way down and bringing it
 * back on the way up is the compromise: it costs nothing when you are going
 * somewhere, and it is already there when you reach for it.
 *
 * The asymmetry is the whole design. Going down needs a few dozen pixels of
 * deliberate movement before the bar leaves, so that a nudge does not make it
 * flicker; coming back needs almost nothing, because wanting the bar back is
 * exactly why somebody scrolls up.
 */

/** Deliberate downward movement before the bar leaves. */
const HIDE_AFTER = 48;
/** Barely a flick: enough to survive trackpad jitter, no more. */
const SHOW_AFTER = 2;
/** Near the top the bar always shows; there is nothing to gain by hiding it. */
const ALWAYS_SHOWN_ABOVE = 64;

/** The nearest ancestor that actually scrolls; the app scrolls a div, not the window. */
function scrollParentOf(el: HTMLElement | null): HTMLElement | Window | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return el ? window : null;
}

const topOf = (target: HTMLElement | Window) =>
  target instanceof Window ? target.scrollY : target.scrollTop;

export function useHideOnScroll(ref: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Resolved after mount, and after the first paint has given the container
    // something to scroll: asked too early, every ancestor still measures as
    // not scrollable and the answer would be `window` forever.
    const target = scrollParentOf(ref.current);
    if (!target) return;

    let last = topOf(target);
    let down = 0;

    const onScroll = () => {
      const y = topOf(target);
      const delta = y - last;
      last = y;
      if (y <= ALWAYS_SHOWN_ABOVE) {
        down = 0;
        setHidden(false);
      } else if (delta <= -SHOW_AFTER) {
        down = 0;
        setHidden(false);
      } else if (delta > 0) {
        // Accumulated rather than compared one event at a time: a slow drag
        // arrives as a stream of two-pixel deltas, and none of them alone
        // would ever clear the threshold.
        down += delta;
        if (down >= HIDE_AFTER) setHidden(true);
      }
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [ref]);

  return hidden;
}
