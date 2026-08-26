import type { Editor } from "@tiptap/react";
import {
  CheckSquare,
  ChevronRight,
  Code2,
  Database,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  List,
  ListOrdered,
  Minus,
  Quote,
  Sigma,
  Table as TableIcon,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/**
 * The `/` menu: everything this editor can insert, from the keyboard.
 *
 * A toolbar is a good place to *find* a feature once and a bad place to reach
 * one while typing: your hands are on the keys, the button is three inches
 * away, and half of what this editor inserts (a table, a formula, a diagram)
 * has no obvious icon anyway. Every editor people are used to answers this the
 * same way, so the shape is not an invention worth arguing about.
 *
 * It is driven from the editor rather than being a component that owns state:
 * the trigger is a slash typed at the start of a word, the filter is whatever
 * follows it, and choosing an item deletes both before running the command, so
 * nothing of the trigger is left in the text.
 */
export interface SlashItem {
  id: string;
  label: string;
  keywords: string;
  icon: React.ReactNode;
  run: () => void;
}

export function useSlashItems(
  editor: Editor,
  actions: {
    onInsertImage: () => void;
    onInsertDatabase: () => void;
    onInsertMath: () => void;
    onInsertDiagram: () => void;
  },
): SlashItem[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      {
        id: "h1",
        label: t("richText.heading1"),
        keywords: "h1 titulo heading",
        icon: <Heading1 className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        label: t("richText.heading"),
        keywords: "h2 titulo heading",
        icon: <Heading2 className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "h3",
        label: t("richText.heading3"),
        keywords: "h3 titulo heading",
        icon: <Heading3 className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: "bullet",
        label: t("richText.list"),
        keywords: "lista bullet ul",
        icon: <List className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: "ordered",
        label: t("richText.orderedList"),
        keywords: "lista numerada ordered ol",
        icon: <ListOrdered className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: "task",
        label: t("richText.taskList"),
        keywords: "tareas checklist todo casillas",
        icon: <CheckSquare className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        id: "callout",
        label: t("richText.callout"),
        keywords: "aviso nota callout destacado atencion",
        icon: <Info className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleCallout("info").run(),
      },
      {
        id: "quote",
        label: t("richText.quote"),
        keywords: "cita quote",
        icon: <Quote className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "code",
        label: t("richText.codeBlock"),
        keywords: "codigo code bloque",
        icon: <Code2 className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: "table",
        label: t("richText.table"),
        keywords: "tabla table cuadro",
        icon: <TableIcon className="h-4 w-4" />,
        run: () =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
      },
      {
        id: "math",
        label: t("richText.mathBlock"),
        keywords: "formula matematicas latex ecuacion",
        icon: <Sigma className="h-4 w-4" />,
        run: actions.onInsertMath,
      },
      {
        id: "diagram",
        label: t("richText.diagram"),
        keywords: "diagrama mermaid grafico flujo",
        icon: <Workflow className="h-4 w-4" />,
        run: actions.onInsertDiagram,
      },
      {
        id: "rule",
        label: t("richText.rule"),
        keywords: "separador linea hr",
        icon: <Minus className="h-4 w-4" />,
        run: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        id: "image",
        label: t("richText.insertImage"),
        keywords: "imagen foto image",
        icon: <ImageIcon className="h-4 w-4" />,
        run: actions.onInsertImage,
      },
      {
        id: "database",
        label: t("db.insert"),
        keywords: "base de datos tabla db",
        icon: <Database className="h-4 w-4" />,
        run: actions.onInsertDatabase,
      },
    ],
    [editor, t, actions],
  );
}

/** Matches on the label and on a list of words, so "todo" finds the checklist. */
function score(query: string, item: SlashItem): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 0;
  if (label.includes(q)) return 1;
  if (item.keywords.includes(q)) return 2;
  return null;
}

export function SlashMenu({
  items,
  query,
  at,
  onPick,
  onClose,
}: {
  items: SlashItem[];
  query: string;
  /** Where the caret was when the slash was typed, in viewport coordinates. */
  at: { x: number; y: number };
  onPick: (item: SlashItem) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () =>
      items
        .map((item) => ({ item, s: score(query, item) }))
        .filter((x): x is { item: SlashItem; s: number } => x.s !== null)
        .sort((a, b) => a.s - b.s)
        .map((x) => x.item),
    [items, query],
  );

  useEffect(() => setCursor(0), [query]);

  /**
   * The keys are captured on the document rather than bound to the editor.
   *
   * ProseMirror owns the keyboard while you are typing in it, and an arrow key
   * that reaches it moves the caret instead of the selection in this list. The
   * menu is only open while it is open, so the capture is short-lived.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setCursor((c) => Math.min(c + 1, shown.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        const item = shown[cursor];
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        onPick(item);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [shown, cursor, onPick, onClose]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (shown.length === 0) return null;

  const WIDTH = 232;
  const left = Math.max(8, Math.min(at.x, window.innerWidth - WIDTH - 8));
  const below = at.y + 280 < window.innerHeight;

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
      }}
      className="z-[70] max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
        {t("richText.slashHint")}
      </div>
      {shown.map((item, i) => (
        <button
          key={item.id}
          type="button"
          data-idx={i}
          onMouseMove={() => setCursor(i)}
          // The mouse is pressed before the click lands, and pressing anywhere
          // outside the editor takes the selection with it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(item)}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
            i === cursor ? "bg-slate-100 dark:bg-slate-800" : ""
          }`}
        >
          <span className="shrink-0 text-slate-400">{item.icon}</span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {i === cursor && (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
}
