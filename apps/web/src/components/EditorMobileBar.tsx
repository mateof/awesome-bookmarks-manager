import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AtSign,
  Bold,
  CheckSquare,
  Code2,
  Eraser,
  Info,
  Keyboard,
  Sigma,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table as TableIcon,
  ClipboardCopy,
  Code,
  Database,
  EyeOff,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Palette,
  Paperclip,
  Pilcrow,
  Plus,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { DEFAULT_HIGHLIGHT } from "../lib/richColors.js";

/**
 * The editor toolbar, on a phone, sitting on top of the keyboard.
 *
 * On a small screen the desktop toolbar is useless the moment you start
 * typing: the keyboard covers the bottom half of the screen and the toolbar is
 * off past the top of it. So this is a separate bar, fixed to the viewport and
 * pushed up by exactly the height of the keyboard, holding the few things you
 * reach for constantly, with everything else one tap away behind a "+".
 *
 * The keyboard's height is not something the page is told directly. What the
 * browser does expose is `visualViewport`: the part of the window actually
 * visible. The difference between that and the layout viewport *is* the
 * keyboard, and it updates as the keyboard animates in and out.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/** True on a screen narrow enough that the bar is worth having. */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}


/**
 * What the "+" panel holds, in the order somebody looks for it.
 *
 * Defined outside the component and driven by data rather than written out as
 * JSX per item: this list is the one that fell behind for three versions while
 * the editor grew, and a list is far harder to forget to update than twenty
 * hand-written blocks.
 */
interface MobileAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
}

interface MobileHelpers {
  onPickRef: (mode: "entity" | "asset") => void;
  onInsertDatabase: () => void;
  onInsertImage: () => void;
  close: () => void;
}

const SECTIONS: {
  title: string;
  items: (editor: Editor, h: MobileHelpers) => MobileAction[];
}[] = [
  {
    title: "richText.groupText",
    items: (editor) => [
      {
        id: "bold",
        label: "richText.bold",
        icon: <Bold className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleBold().run(),
      },
      {
        id: "italic",
        label: "richText.italic",
        icon: <Italic className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        id: "strike",
        label: "richText.strike",
        icon: <Strikethrough className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleStrike().run(),
      },
      {
        id: "underline",
        label: "richText.underline",
        icon: <UnderlineIcon className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleUnderline().run(),
      },
      {
        id: "code",
        label: "richText.code",
        icon: <Code className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleCode().run(),
      },
      {
        id: "sup",
        label: "richText.superscript",
        icon: <SupIcon className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleSuperscript().run(),
      },
      {
        id: "sub",
        label: "richText.subscript",
        icon: <SubIcon className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleSubscript().run(),
      },
      {
        id: "kbd",
        label: "richText.kbd",
        icon: <Keyboard className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleKbd().run(),
      },
      {
        id: "color",
        label: "richText.textColor",
        icon: <Palette className="h-4 w-4" />,
        run: () => editor.chain().focus().setColor("#dc2626").run(),
      },
      {
        id: "highlight",
        label: "richText.highlight",
        icon: <Highlighter className="h-4 w-4" />,
        run: () =>
          editor.isActive("highlight")
            ? editor.chain().focus().unsetHighlight().run()
            : editor.chain().focus().setHighlight(DEFAULT_HIGHLIGHT).run(),
      },
      {
        id: "clear",
        label: "richText.clearFormat",
        icon: <Eraser className="h-4 w-4" />,
        run: () => editor.chain().focus().unsetAllMarks().run(),
      },
      {
        id: "mono",
        label: "richText.fontMono",
        icon: <Type className="h-4 w-4" />,
        run: () =>
          editor
            .chain()
            .focus()
            .setFontFamily("ui-monospace, SFMono-Regular, Menlo, monospace")
            .run(),
      },
    ],
  },
  {
    title: "richText.groupBlocks",
    items: (editor) => [
      {
        id: "h1",
        label: "richText.heading1",
        icon: <Heading1 className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        label: "richText.heading",
        icon: <Heading2 className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "h3",
        label: "richText.heading3",
        icon: <Heading3 className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: "bullet",
        label: "richText.list",
        icon: <List className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: "ordered",
        label: "richText.orderedList",
        icon: <ListOrdered className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: "task",
        label: "richText.taskList",
        icon: <CheckSquare className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        id: "quote",
        label: "richText.quote",
        icon: <Quote className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "callout",
        label: "richText.callout",
        icon: <Info className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleCallout("info").run(),
      },
      {
        id: "codeblock",
        label: "richText.codeBlock",
        icon: <Code2 className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: "table",
        label: "richText.table",
        icon: <TableIcon className="h-4 w-4" />,
        run: () =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
      },
      {
        id: "rule",
        label: "richText.rule",
        icon: <Minus className="h-4 w-4" />,
        run: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        id: "copyable",
        label: "richText.copyable",
        icon: <ClipboardCopy className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleCopyable().run(),
      },
      {
        id: "spoiler",
        label: "richText.spoiler",
        icon: <EyeOff className="h-4 w-4" />,
        run: () => editor.chain().focus().toggleSpoiler().run(),
      },
    ],
  },
  {
    title: "richText.groupInsert",
    items: (editor, h) => [
      {
        id: "link",
        label: "richText.link",
        icon: <LinkIcon className="h-4 w-4" />,
        run: () => {
          const url = prompt("https://");
          if (url)
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
        },
      },
      {
        id: "entity",
        label: "refs.insertEntity",
        icon: <AtSign className="h-4 w-4" />,
        run: () => {
          h.close();
          h.onPickRef("entity");
        },
      },
      {
        id: "asset",
        label: "refs.insertAsset",
        icon: <Paperclip className="h-4 w-4" />,
        run: () => {
          h.close();
          h.onPickRef("asset");
        },
      },
      {
        id: "database",
        label: "db.insert",
        icon: <Database className="h-4 w-4" />,
        run: () => {
          h.close();
          h.onInsertDatabase();
        },
      },
      {
        id: "image",
        label: "richText.insertImage",
        icon: <ImagePlus className="h-4 w-4" />,
        run: h.onInsertImage,
      },
    ],
  },
  {
    title: "richText.groupAlign",
    items: (editor) => [
      {
        id: "left",
        label: "richText.alignLeft",
        icon: <AlignLeft className="h-4 w-4" />,
        run: () => editor.chain().focus().setTextAlign("left").run(),
      },
      {
        id: "center",
        label: "richText.alignCenter",
        icon: <AlignCenter className="h-4 w-4" />,
        run: () => editor.chain().focus().setTextAlign("center").run(),
      },
      {
        id: "right",
        label: "richText.alignRight",
        icon: <AlignRight className="h-4 w-4" />,
        run: () => editor.chain().focus().setTextAlign("right").run(),
      },
    ],
  },
];

export function EditorMobileBar({
  editor,
  onInsertImage,
  onPickRef,
  onInsertDatabase,
}: {
  editor: Editor;
  onInsertImage: (file: File) => Promise<void>;
  onPickRef: (mode: "entity" | "asset") => void;
  onInsertDatabase: () => void;
}) {
  const { t } = useTranslation();
  const narrow = useIsNarrow();
  const inset = useKeyboardInset();
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);

  useEffect(() => {
    const onFocus = () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
      setFocused(true);
    };
    const onBlur = () => {
      // Tapping a button in this very bar blurs the editor for an instant on
      // some browsers even with the default prevented. Hiding immediately
      // would make the bar vanish under the finger that was using it.
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
      blurTimer.current = window.setTimeout(() => {
        setFocused(false);
        setExpanded(false);
      }, 220);
    };
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
    };
  }, [editor]);

  if (!narrow || !focused) return null;

  // Every control keeps focus in the text. Losing it would dismiss the
  // keyboard, and the bar would drop to the bottom of the screen mid-tap.
  const hold = (e: React.MouseEvent | React.TouchEvent) => e.preventDefault();

  const Item = ({
    icon,
    label,
    onClick,
    active,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    active?: boolean;
  }) => (
    <button
      type="button"
      onMouseDown={hold}
      onTouchStart={hold}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex shrink-0 items-center justify-center rounded p-2.5 ${
        active ? "bg-slate-700 text-white" : "text-slate-200"
      }`}
    >
      {icon}
    </button>
  );

  const GridItem = ({
    icon,
    label,
    onClick,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onMouseDown={hold}
      onTouchStart={hold}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-slate-700 px-3 py-3 text-left text-sm text-slate-100"
    >
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );

  return createPortal(
    <div
      data-testid="editor-mobile-bar"
      style={{ bottom: inset }}
      className="fixed inset-x-0 z-[70] border-t border-slate-700 bg-slate-900"
    >
      {expanded && (
        /*
         * Grouped, and complete.
         *
         * This grid used to be a flat list written when there were nine things
         * to insert, and it stayed that way while the editor grew tables,
         * checklists, code, formulas, diagrams and callouts: on a phone, half
         * the editor had quietly become unreachable. A flat list of twenty is
         * also unusable in its own right, so the sections are the fix for both
         * problems at once — you look for "a block" or "a format", not for
         * the twelfth item.
         */
        <div className="max-h-[55vh] overflow-y-auto border-b border-slate-700 p-3">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-3 last:mb-0">
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-slate-500">
                {t(section.title as "richText.groupText")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {section.items(editor, {
                  onPickRef,
                  onInsertDatabase,
                  onInsertImage: () => imgRef.current?.click(),
                  close: () => setExpanded(false),
                }).map((item) => (
                  <GridItem
                    key={item.id}
                    icon={item.icon}
                    label={t(item.label as "richText.bold")}
                    onClick={item.run}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-0.5 overflow-x-auto px-1 py-0.5">
        <Item
          icon={<Plus className="h-5 w-5" />}
          label={t("richText.moreActions")}
          active={expanded}
          onClick={() => setExpanded((v) => !v)}
        />
        <Item
          icon={<Pilcrow className="h-4 w-4" />}
          label={t("richText.heading")}
          active={editor.isActive("heading")}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <Item
          icon={<Bold className="h-4 w-4" />}
          label={t("richText.bold")}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <Item
          icon={<Italic className="h-4 w-4" />}
          label={t("richText.italic")}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <Item
          icon={<UnderlineIcon className="h-4 w-4" />}
          label={t("richText.underline")}
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <Item
          icon={<List className="h-4 w-4" />}
          label={t("richText.list")}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-700" />
        <Item
          icon={<Undo2 className="h-4 w-4" />}
          label={t("common.undo")}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <Item
          icon={<Redo2 className="h-4 w-4" />}
          label={t("common.redo")}
          onClick={() => editor.chain().focus().redo().run()}
        />
        <span className="ml-auto" />
        <Item
          icon={<X className="h-5 w-5" />}
          label={t("richText.closeToolbar")}
          // Blurring dismisses the keyboard, which is the honest way to put
          // this bar away: it exists to sit on top of a keyboard.
          onClick={() => editor.commands.blur()}
        />
      </div>

      <input
        ref={imgRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onInsertImage(f);
        }}
      />
    </div>,
    document.body,
  );
}
