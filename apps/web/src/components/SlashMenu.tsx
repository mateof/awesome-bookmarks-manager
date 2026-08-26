import type { Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  actionsFor,
  type EditorAction,
  type EditorActionContext,
} from "../lib/editorActions.js";

/**
 * The `/` menu: everything this editor can insert, from the keyboard.
 *
 * A toolbar is a good place to *find* a feature once and a bad place to reach
 * one while typing: your hands are on the keys, the button is three inches
 * away, and half of what this editor inserts (a table, a formula, a diagram)
 * has no obvious icon anyway.
 *
 * The list itself comes from `editorActions`, shared with the toolbar and with
 * the phone's panel, so a block added once shows up in all three.
 *
 * Two columns and as tall as it needs: a single column of sixteen items is a
 * scroll for something whose whole point is seeing what there is.
 */

/** Matches on the label and on a list of words, so "todo" finds the checklist. */
function score(query: string, label: string, keywords: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 0;
  if (l.includes(q)) return 1;
  if (keywords.includes(q)) return 2;
  return null;
}

export function SlashMenu({
  editor,
  ctx,
  query,
  at,
  onPicked,
  onClose,
}: {
  editor: Editor;
  ctx: EditorActionContext;
  query: string;
  /** Where the caret was when the slash was typed, in viewport coordinates. */
  at: { x: number; y: number };
  /** Called before the action runs, so the trigger text can be removed. */
  onPicked: (run: () => void) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const items = actionsFor("slash").map((a) => ({
      action: a,
      label: t(a.label as "richText.bold"),
    }));
    return items
      .map((x) => ({ ...x, s: score(query, x.label, x.action.keywords) }))
      .filter((x): x is typeof x & { s: number } => x.s !== null)
      .sort((a, b) => a.s - b.s);
  }, [query, t]);

  useEffect(() => setCursor(0), [query]);

  const pick = (action: EditorAction) => {
    onPicked(() => action.run(editor, ctx));
  };

  /**
   * The keys are captured on the document rather than bound to the editor.
   *
   * ProseMirror owns the keyboard while you are typing in it, and an arrow key
   * that reaches it moves the caret instead of the selection in this list. The
   * menu is only open while it is open, so the capture is short-lived.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        setCursor((c) => Math.min(c + (e.key === "ArrowDown" ? 2 : 1), shown.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        setCursor((c) => Math.max(c - (e.key === "ArrowUp" ? 2 : 1), 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        const item = shown[cursor];
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        pick(item.action);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, cursor, onClose]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (shown.length === 0) return null;

  // Wide enough for two columns, and never wider than the window: on a narrow
  // screen this has to stop being two columns rather than run off the edge.
  const WIDTH = Math.min(520, window.innerWidth - 16);
  const left = Math.max(8, Math.min(at.x, window.innerWidth - WIDTH - 8));
  // Tall menus flip above the caret when there is no room below, which there
  // usually is not when you are typing near the bottom of a dialog.
  const height = Math.min(shown.length * 20 + 80, window.innerHeight * 0.7);
  const below = at.y + height < window.innerHeight;

  return createPortal(
    <div
      ref={listRef}
      data-testid="slash-menu"
      style={{
        position: "fixed",
        left,
        top: below ? at.y + 20 : undefined,
        bottom: below ? undefined : window.innerHeight - at.y + 8,
        width: WIDTH,
        maxHeight: "70vh",
      }}
      className="z-[70] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
        {t("richText.slashHint")}
      </div>
      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {shown.map(({ action, label }, i) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              data-idx={i}
              onMouseMove={() => setCursor(i)}
              // The mouse is pressed before the click lands, and pressing
              // anywhere outside the editor takes the selection with it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(action)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                i === cursor ? "bg-slate-100 dark:bg-slate-800" : ""
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
