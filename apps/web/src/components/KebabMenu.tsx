import { MoreVertical } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export interface KebabItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  items: KebabItem[];
  className?: string;
  align?: "left" | "right";
}

const MENU_WIDTH = 176; // ~ min-w 11rem
const ROW_HEIGHT = 34;

export function KebabMenu({ items, className = "", align = "right" }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the desktop dropdown from the button's viewport rect. It is
  // portalled to <body> with `position: fixed`, so no ancestor `overflow` can
  // clip it and no sibling card can paint over it (both were happening in the
  // grid and large-card layouts, which made the menu unclickable and let the
  // press fall through to the card's drag sensor).
  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    let left = align === "right" ? r.right - MENU_WIDTH : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
    const estH = items.length * ROW_HEIGHT + 12;
    let top = r.bottom + 4;
    if (top + estH > window.innerHeight - 8) {
      top = Math.max(8, r.top - estH - 4);
    }
    setPos({ top, left });
  }, [align, items.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current?.contains(target) ||
        menuRef.current?.contains(target) ||
        sheetRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Lock the page behind the bottom sheet on mobile (desktop keeps its
  // dropdown, which shouldn't lock scroll).
  useEffect(() => {
    if (!open || window.innerWidth >= 640) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const pick = (it: KebabItem) => {
    setOpen(false);
    it.onClick();
  };

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onClick={stop}
      // The card behind this menu is a @dnd-kit sortable; its drag sensor
      // starts on pointerdown. The menu and its portalled surfaces are React
      // descendants of this root, so their pointer events bubble up the React
      // tree to the drag listeners. Stop them here so interacting with the menu
      // never starts a drag.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={t("common.moreActions")}
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <>
          {/* Desktop: dropdown, portalled + fixed so it can't be clipped or
              covered by neighbouring cards. */}
          {createPortal(
            <div
              ref={menuRef}
              onClick={stop}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                width: MENU_WIDTH,
              }}
              className="fixed z-50 hidden rounded border border-slate-200 bg-white py-1 text-sm shadow-lg sm:block dark:border-slate-700 dark:bg-slate-800"
            >
              {items.map((it, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    pick(it);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    it.danger
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {it.icon}
                  <span>{it.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )}

          {/* Mobile: native-style bottom sheet, portalled so transformed card
              ancestors don't offset the fixed positioning. */}
          {createPortal(
            <div className="sm:hidden">
              <div
                className="fixed inset-0 z-40 bg-black/40 motion-safe:animate-[spotFade_.15s_ease-out]"
                onClick={(e) => {
                  stop(e);
                  setOpen(false);
                }}
              />
              <div
                ref={sheetRef}
                onClick={stop}
                role="menu"
                style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
                className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl motion-safe:animate-[sheetUp_.24s_ease-out] dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex justify-center pb-1 pt-2.5">
                  <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="max-h-[65vh] overflow-y-auto overscroll-contain px-2 py-1">
                  {items.map((it, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => {
                        stop(e);
                        pick(it);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-[15px] active:bg-slate-100 dark:active:bg-slate-800 ${
                        it.danger
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-800 dark:text-slate-100"
                      }`}
                    >
                      {it.icon}
                      <span>{it.label}</span>
                    </button>
                  ))}
                </div>
                <div className="px-2 pb-1 pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      stop(e);
                      setOpen(false);
                    }}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-center text-[15px] font-medium text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:active:bg-slate-700"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
