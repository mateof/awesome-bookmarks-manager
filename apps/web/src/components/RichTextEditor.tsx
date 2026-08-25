import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import ImageExt from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import UnderlineExt from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  ClipboardCopy,
  Code,
  Eye,
  EyeOff,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  AtSign,
  Database,
  Palette,
  Paperclip,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
} from "lucide-react";
import { imageFileToDataUrl, isImageFile } from "../lib/pasteImage.js";
import { RICH_MARKS } from "../lib/richMarks.js";
import { DatabaseBlock as DatabaseBlockNode } from "../lib/richDatabase.js";
import { EntityRef } from "../lib/richRefs.js";
import { dlg } from "./dialogs.js";
import { EditorMobileBar } from "./EditorMobileBar.js";
import { RefPicker, type PickedRef } from "./RefPicker.js";
import {
  DatabasePicker,
  type PickedDatabase,
} from "./DatabasePicker.js";
import { api } from "../api.js";
import { AnchoredPopover } from "./AnchoredPopover.js";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /**
   * Take the height its container gives it and scroll the text inside, rather
   * than growing with the content. For a dialog whose whole job is this
   * editor: growing pushes the toolbar and the save button out of the dialog's
   * own scroll, which is the moment you most want them.
   */
  fill?: boolean;
  /**
   * Rendered at the bottom while maximised. The full-screen editor covers the
   * dialog it was opened from, buttons included, so without this you would
   * have to shrink it back just to save — which is exactly the friction the
   * maximise button was meant to remove.
   */
  actions?: React.ReactNode;
  /**
   * Told whenever the editor goes full screen, so the dialog around it can
   * stop rendering its own copy of `actions`: two identical save buttons in
   * the accessibility tree, one of them covered but still reachable by Tab, is
   * worse than the duplication looks.
   */
  onMaximisedChange?: (maximised: boolean) => void;
}

/**
 * Rich-text editor for folder/bookmark descriptions.
 * The user explicitly wants to use this for free-form notes including
 * passwords, usernames, etc. — content is server-side encrypted at rest.
 * Use the eye toggle to redact sensitive fields when shoulder-surfing.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  fill = false,
  actions,
  onMaximisedChange,
}: Props) {
  const { t } = useTranslation();
  const [redactSensitive, setRedactSensitive] = useState(false);
  const [maximised, setMaximised] = useState(false);
  const [picking, setPicking] = useState<"entity" | "asset" | null>(null);
  const [pickingDatabase, setPickingDatabase] = useState(false);
  const toggleMaximised = (next: boolean) => {
    setMaximised(next);
    onMaximisedChange?.(next);
  };

  // While maximised, Escape shrinks the editor rather than closing whatever
  // dialog it sits in — losing the text you were writing because you wanted
  // the small view back would be a nasty surprise. Captured so it runs before
  // the dialog's own handler.
  useEffect(() => {
    if (!maximised) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      toggleMaximised(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [maximised]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      // TextStyle is the span the other two hang their styles on.
      TextStyle,
      Color,
      FontFamily,
      UnderlineExt,
      ImageExt.configure({ allowBase64: true }),
      EntityRef,
      DatabaseBlockNode,
      ...RICH_MARKS,
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none dark:prose-invert min-h-[120px]",
        spellcheck: "false",
      },
      // Pasting or dropping an image inlines it (resized) instead of being
      // silently ignored. Text pastes fall through untouched.
      handlePaste: (_view, event) => {
        const file = [...(event.clipboardData?.items ?? [])]
          .map((it) => it.getAsFile())
          .find(isImageFile);
        if (!file) return false;
        event.preventDefault();
        void insertImage(file);
        return true;
      },
      // Typing "@" opens the folder/bookmark picker and "#" the file picker,
      // but only at a word boundary: an email address or a CSS colour in the
      // middle of a sentence must stay typeable. Returning true consumes the
      // character, so no stray trigger is left behind to delete later.
      handleTextInput: (view, from, _to, text) => {
        if (text !== "@" && text !== "#") return false;
        const before = from > 0 ? view.state.doc.textBetween(from - 1, from) : "";
        if (before && !/\s/.test(before)) return false;
        setPicking(text === "@" ? "entity" : "asset");
        return true;
      },
      handleDrop: (_view, event) => {
        const file = [...(event.dataTransfer?.files ?? [])].find(isImageFile);
        if (!file) return false;
        event.preventDefault();
        void insertImage(file);
        return true;
      },
    },
  });

  const insertImage = async (file: File) => {
    if (!editor) return;
    try {
      const src = await imageFileToDataUrl(file);
      // Collapse the selection first. `setImage` replaces whatever is
      // selected, and the file picker steals focus while ProseMirror keeps
      // the old selection stored — with "select all" active, picking an image
      // would silently replace the whole note.
      editor
        .chain()
        .focus()
        .setTextSelection(editor.state.selection.to)
        .setImage({ src })
        .run();
    } catch {
      await dlg.alert(t("richText.imageTooLarge"));
    }
  };

  const applyRef = (r: PickedRef) => {
    if (!editor) return;
    setPicking(null);
    editor
      .chain()
      .insertRef({
        refType: r.refType,
        refId: r.refId ?? null,
        refSlug: r.refSlug ?? null,
        label: r.label,
      })
      .run();
    // Focused directly through ProseMirror rather than with TipTap's focus()
    // command, which defers the real DOM focus to a requestAnimationFrame (it
    // has to, for React). Deferred is a race: keep typing immediately after
    // choosing and the next characters land nowhere, because the picker's
    // input has gone and the editor has not been given focus yet.
    editor.view.focus();
  };

  /**
   * Put a table into the note.
   *
   * Every embed gets its own id, minted here. Two notes showing the same table
   * are two embeds, and that is what lets each of them keep views of its own
   * without those showing up in the other.
   */
  const embed = (dbId: string, dbName: string, viewId: string | null) => {
    if (!editor) return;
    setPickingDatabase(false);
    editor
      .chain()
      .insertDatabase({ dbId, dbName, blockId: crypto.randomUUID(), viewId })
      .run();
    // Focused through ProseMirror directly: TipTap's focus() defers to a rAF,
    // and anything typed in between would land nowhere.
    editor.view.focus();
  };

  /**
   * Creating the table first and inserting the block second: the block is
   * nothing but an id, so there is no block to insert until the server has
   * given us one. If the call fails, the note is left exactly as it was
   * instead of carrying a pointer to nothing.
   */
  const createDatabase = async () => {
    try {
      const db = await api.createDatabase(t("db.newName"));
      embed(db.id, db.name, null);
    } catch (e) {
      await dlg.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const applyDatabase = (picked: PickedDatabase) =>
    embed(picked.id, picked.name, picked.viewId);

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) editor.commands.setContent(value || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return null;

  return (
    <div
      className={`border border-slate-300 dark:border-slate-700 ${
        redactSensitive ? "[&_.tiptap_*]:blur-sm" : ""
      } ${
        maximised
          ? // Fixed to the viewport, so it covers the dialog it was opened
            // from as well as the page behind it.
            "fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900"
          : `rounded ${fill ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""}`
      }`}
    >
      <Toolbar
        editor={editor}
        redactSensitive={redactSensitive}
        onToggleRedact={() => setRedactSensitive((r) => !r)}
        maximised={maximised}
        onToggleMaximise={() => toggleMaximised(!maximised)}
        onInsertImage={insertImage}
        onPickRef={setPicking}
        onInsertDatabase={() => setPickingDatabase(true)}
      />
      {/* With `fill`, this is the only thing that scrolls: the toolbar above
          and whatever the dialog puts below stay where they are. */}
      <div
        data-testid="editor-scroll"
        className={
          fill || maximised ? "min-h-0 flex-1 overflow-y-auto p-2" : "p-2"
        }
      >
        <EditorContent
          editor={editor}
          className="tiptap"
          aria-label={placeholder ?? t("richText.descriptionAria")}
        />
      </div>
      <EditorMobileBar
        editor={editor}
        onInsertImage={insertImage}
        onPickRef={setPicking}
        onInsertDatabase={() => setPickingDatabase(true)}
      />
      {pickingDatabase && (
        <DatabasePicker
          onPick={applyDatabase}
          onCreate={() => void createDatabase()}
          onClose={() => setPickingDatabase(false)}
        />
      )}
      {picking && (
        <RefPicker
          mode={picking}
          onPick={applyRef}
          onClose={() => setPicking(null)}
        />
      )}
      {maximised && actions && (
        <div className="shrink-0 border-t border-slate-200 p-2 dark:border-slate-700">
          {actions}
        </div>
      )}
    </div>
  );
}

const TEXT_COLORS = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#16a34a",
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#64748b",
];

const FONTS: { key: "sans" | "serif" | "mono"; css: string }[] = [
  { key: "sans", css: "ui-sans-serif, system-ui, sans-serif" },
  { key: "serif", css: "Georgia, 'Times New Roman', serif" },
  { key: "mono", css: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

function Toolbar({
  editor,
  redactSensitive,
  onToggleRedact,
  maximised,
  onToggleMaximise,
  onInsertImage,
  onPickRef,
  onInsertDatabase,
}: {
  editor: Editor;
  redactSensitive: boolean;
  onToggleRedact: () => void;
  maximised: boolean;
  onToggleMaximise: () => void;
  onInsertImage: (file: File) => Promise<void>;
  onPickRef: (mode: "entity" | "asset") => void;
  onInsertDatabase: () => void;
}) {
  const { t } = useTranslation();
  const [showColors, setShowColors] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const colorAnchor = useRef<HTMLSpanElement>(null);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
      <Btn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title={t("richText.bold")}
      >
        <Bold className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t("richText.italic")}
      >
        <Italic className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title={t("richText.strike")}
      >
        <Strikethrough className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title={t("richText.code")}
      >
        <Code className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title={t("richText.underline")}
      >
        <UnderlineIcon className="h-3 w-3" />
      </Btn>
      <Sep />
      <Btn
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title={t("richText.heading1")}
      >
        <Heading1 className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title={t("richText.heading")}
      >
        <Heading2 className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title={t("richText.heading3")}
      >
        <Heading3 className="h-3 w-3" />
      </Btn>
      <Btn
        active={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title={t("richText.rule")}
      >
        <Minus className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title={t("richText.list")}
      >
        <List className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title={t("richText.orderedList")}
      >
        <ListOrdered className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title={t("richText.quote")}
      >
        <Quote className="h-3 w-3" />
      </Btn>
      <Sep />
      <Btn
        active={editor.isActive("copyable")}
        onClick={() => editor.chain().focus().toggleCopyable().run()}
        title={t("richText.copyable")}
      >
        <ClipboardCopy className="h-3 w-3" />
      </Btn>
      <Btn
        active={editor.isActive("spoiler")}
        onClick={() => editor.chain().focus().toggleSpoiler().run()}
        title={t("richText.spoiler")}
      >
        <EyeOff className="h-3 w-3" />
      </Btn>
      <Sep />
      <Btn
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = prompt(t("richText.linkPrompt"), prev ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        title={t("richText.link")}
      >
        <LinkIcon className="h-3 w-3" />
      </Btn>
      <Btn
        active={false}
        onClick={() => onPickRef("entity")}
        title={t("refs.insertEntity")}
      >
        <AtSign className="h-3 w-3" />
      </Btn>
      <Btn
        active={false}
        onClick={() => onPickRef("asset")}
        title={t("refs.insertAsset")}
      >
        <Paperclip className="h-3 w-3" />
      </Btn>
      <Btn active={false} onClick={onInsertDatabase} title={t("db.insert")}>
        <Database className="h-3 w-3" />
      </Btn>
      <Sep />
      {/* Text colour: a fixed palette rather than a wheel — notes want "make
          this red", not colorimetry. */}
      <span ref={colorAnchor} className="inline-flex">
        <Btn
          active={!!editor.getAttributes("textStyle").color}
          onClick={() => setShowColors((v) => !v)}
          title={t("richText.textColor")}
        >
          <Palette className="h-3 w-3" />
        </Btn>
        {showColors && (
          /* In a portal, like every other panel that hangs off a control: the
             toolbar sits inside a dialog that scrolls, and an absolutely
             positioned palette was cut off at its edge. */
          <AnchoredPopover
            anchor={colorAnchor}
            onClose={() => setShowColors(false)}
            width={168}
          >
            <span className="flex flex-wrap items-center gap-1 p-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => {
                  editor.chain().focus().setColor(c).run();
                  setShowColors(false);
                }}
                className="h-5 w-5 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: c }}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setShowColors(false);
              }}
              className="mt-1 w-full rounded border border-slate-300 px-1 py-0.5 text-[10px] dark:border-slate-600"
            >
              {t("richText.clearColor")}
            </button>
            </span>
          </AnchoredPopover>
        )}
      </span>
      <select
        value={
          FONTS.find(
            (f) => f.css === editor.getAttributes("textStyle").fontFamily,
          )?.key ?? ""
        }
        onChange={(e) => {
          const f = FONTS.find((x) => x.key === e.target.value);
          if (f) editor.chain().focus().setFontFamily(f.css).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        title={t("richText.fontFamily")}
        aria-label={t("richText.fontFamily")}
        className="h-6 rounded border border-slate-300 bg-white px-1 text-[11px] dark:border-slate-600 dark:bg-slate-700"
      >
        <option value="">{t("richText.fontDefault")}</option>
        <option value="sans">{t("richText.fontSans")}</option>
        <option value="serif">{t("richText.fontSerif")}</option>
        <option value="mono">{t("richText.fontMono")}</option>
      </select>
      <Btn
        active={false}
        onClick={() => imgRef.current?.click()}
        title={t("richText.insertImage")}
      >
        <ImagePlus className="h-3 w-3" />
      </Btn>
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
      <Sep />
      <Btn
        active={redactSensitive}
        onClick={onToggleRedact}
        title={t("richText.redact")}
      >
        {redactSensitive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </Btn>
      {/* Pushed to the far end: it is about the window, not about the text. */}
      <button
        type="button"
        onClick={onToggleMaximise}
        title={maximised ? t("richText.restore") : t("richText.maximise")}
        aria-label={maximised ? t("richText.restore") : t("richText.maximise")}
        aria-pressed={maximised}
        className="ml-auto rounded p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        {maximised ? (
          <Minimize2 className="h-3 w-3" />
        ) : (
          <Maximize2 className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded p-1.5 ${
        active
          ? "bg-slate-200 dark:bg-slate-700"
          : "hover:bg-slate-100 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-600" />;
}
