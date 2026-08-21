import type { Editor } from "@tiptap/react";
import {
  AtSign,
  Bold,
  ClipboardCopy,
  Code,
  Database,
  EyeOff,
  Heading1,
  Heading2,
  Heading3,
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
        <div className="grid max-h-[45vh] grid-cols-2 gap-2 overflow-y-auto border-b border-slate-700 p-3">
          <GridItem
            icon={<Heading1 className="h-4 w-4" />}
            label={t("richText.heading1")}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          />
          <GridItem
            icon={<Heading2 className="h-4 w-4" />}
            label={t("richText.heading")}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <GridItem
            icon={<Heading3 className="h-4 w-4" />}
            label={t("richText.heading3")}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          />
          <GridItem
            icon={<Quote className="h-4 w-4" />}
            label={t("richText.quote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <GridItem
            icon={<ListOrdered className="h-4 w-4" />}
            label={t("richText.orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <GridItem
            icon={<Minus className="h-4 w-4" />}
            label={t("richText.rule")}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          />
          <GridItem
            icon={<Strikethrough className="h-4 w-4" />}
            label={t("richText.strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
          <GridItem
            icon={<Code className="h-4 w-4" />}
            label={t("richText.code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <GridItem
            icon={<AtSign className="h-4 w-4" />}
            label={t("refs.insertEntity")}
            onClick={() => {
              setExpanded(false);
              onPickRef("entity");
            }}
          />
          <GridItem
            icon={<Paperclip className="h-4 w-4" />}
            label={t("refs.insertAsset")}
            onClick={() => {
              setExpanded(false);
              onPickRef("asset");
            }}
          />
          <GridItem
            icon={<Database className="h-4 w-4" />}
            label={t("db.insert")}
            onClick={() => {
              setExpanded(false);
              onInsertDatabase();
            }}
          />
          <GridItem
            icon={<ImagePlus className="h-4 w-4" />}
            label={t("richText.insertImage")}
            onClick={() => imgRef.current?.click()}
          />
          <GridItem
            icon={<LinkIcon className="h-4 w-4" />}
            label={t("richText.link")}
            onClick={() => {
              const url = prompt(t("richText.linkPrompt"), "https://");
              if (url)
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: url })
                  .run();
            }}
          />
          <GridItem
            icon={<Palette className="h-4 w-4" />}
            label={t("richText.textColor")}
            onClick={() => editor.chain().focus().setColor("#dc2626").run()}
          />
          <GridItem
            icon={<Type className="h-4 w-4" />}
            label={t("richText.fontMono")}
            onClick={() =>
              editor
                .chain()
                .focus()
                .setFontFamily("ui-monospace, SFMono-Regular, Menlo, monospace")
                .run()
            }
          />
          <GridItem
            icon={<ClipboardCopy className="h-4 w-4" />}
            label={t("richText.copyable")}
            onClick={() => editor.chain().focus().toggleCopyable().run()}
          />
          <GridItem
            icon={<EyeOff className="h-4 w-4" />}
            label={t("richText.spoiler")}
            onClick={() => editor.chain().focus().toggleSpoiler().run()}
          />
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
