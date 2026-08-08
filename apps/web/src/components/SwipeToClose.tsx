import { useRef, useState } from "react";

/**
 * Wraps a panel so a left swipe dismisses it (in addition to any close
 * button). The panel follows the finger and, past a threshold on release,
 * calls onClose; otherwise it snaps back. Vertical drags are left alone so
 * inner scrolling still works.
 */
export function SwipeToClose({
  onClose,
  className,
  children,
}: {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"none" | "h" | "v">("none");

  const onTouchStart = (e: React.TouchEvent) => {
    const tp = e.touches[0];
    if (!tp) return;
    start.current = { x: tp.clientX, y: tp.clientY };
    axis.current = "none";
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    const tp = e.touches[0];
    if (!s || !tp) return;
    const ddx = tp.clientX - s.x;
    const ddy = tp.clientY - s.y;
    if (axis.current === "none") {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
      if (axis.current === "h") setDragging(true);
    }
    if (axis.current === "h" && ddx < 0) setDx(ddx);
  };

  const end = () => {
    start.current = null;
    if (axis.current === "h") {
      setDragging(false);
      const shouldClose = dx < -80;
      setDx(0);
      if (shouldClose) onClose();
    }
    axis.current = "none";
  };

  return (
    <div
      className={className}
      style={{
        transform: dx ? `translateX(${dx}px)` : undefined,
        opacity: dx < 0 ? Math.max(0.5, 1 + dx / 500) : undefined,
        transition: dragging ? "none" : "transform .2s ease, opacity .2s ease",
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={end}
      onTouchCancel={end}
    >
      {children}
    </div>
  );
}
