import { useEffect } from "react";

/**
 * "First click selects the whole value, second click places the caret."
 *
 * Installed once at the app root as two delegated listeners instead of touching
 * every field. Scope is deliberate:
 *
 * - Only single-line <input>s whose value is normally *replaced* (text, search,
 *   url, email, tel, number). Textareas and the rich-text editor are excluded:
 *   selecting a whole description on a stray click means the next keystroke
 *   wipes it, and input undo is unreliable across browsers.
 * - Passwords are excluded (no benefit, and it can trip up password managers).
 * - Mouse only. On touch, selecting everything on each tap pops the selection
 *   handles and the clipboard menu, which gets in the way.
 * - Opt out per field with `data-no-select-all`.
 *
 * It runs on pointerup, not focus: the browser places the caret on pointerdown,
 * so selecting at focus time would immediately be undone by the release.
 * Dragging to select a fragment is detected by pointer travel and left alone.
 */

const ELIGIBLE_TYPES = new Set(["text", "search", "url", "email", "tel", "number"]);

/** Pointer travel (px) above which the gesture counts as a drag-select. */
const DRAG_THRESHOLD = 5;

function isEligible(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement)) return false;
  if (target.disabled || target.readOnly) return false;
  if (target.dataset.noSelectAll !== undefined) return false;
  return ELIGIBLE_TYPES.has(target.type);
}

export function useSelectAllOnFirstClick() {
  useEffect(() => {
    let pending: HTMLInputElement | null = null;
    let startX = 0;
    let startY = 0;

    const onPointerDown = (e: PointerEvent) => {
      pending = null;
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if (!isEligible(e.target)) return;
      // Already focused => this is the "second click": let it place the caret.
      if (document.activeElement === e.target) return;
      pending = e.target;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      const el = pending;
      pending = null;
      if (!el || e.target !== el) return;
      // The user dragged: keep the fragment they selected.
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > DRAG_THRESHOLD) return;
      el.select();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
    };
  }, []);
}
