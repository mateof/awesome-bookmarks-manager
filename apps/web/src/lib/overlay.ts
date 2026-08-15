import { useRef } from "react";

/**
 * Props for an overlay backdrop that dismisses on an outside click, but only
 * when the gesture *starts and ends* on the backdrop itself.
 *
 * Without this, selecting text inside a dialog and releasing the button over
 * the dimmed area closes it: the click event bubbles to the backdrop (it is the
 * common ancestor of press and release), so a naive `onClick={onClose}` fires
 * and the user loses whatever they were editing.
 */
export function useBackdropDismiss(onClose: () => void) {
  const pressedBackdrop = useRef(false);

  return {
    onMouseDown: (e: React.MouseEvent) => {
      pressedBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      const released = e.target === e.currentTarget;
      const pressed = pressedBackdrop.current;
      pressedBackdrop.current = false;
      if (released && pressed) onClose();
    },
  };
}
