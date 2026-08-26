import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Color from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import ImageExt from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createLowlight } from "lowlight";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Code2,
  Eraser,
  Keyboard,
  Search,
  Sigma,
  Smile,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table as TableIcon,
  Workflow,
  ClipboardCopy,
  Code,
  Eye,
  EyeOff,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Info,
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
import type { DbTemplate } from "@awesome-bookmarks/shared";
import {
  groupedActionsFor,
  type EditorActionContext,
} from "../lib/editorActions.js";
import { RICH_COLORS } from "../lib/richColors.js";
import { Callout, CALLOUT_KINDS, type CalloutKind } from "../lib/richCallout.js";
import { DiagramBlock } from "../lib/richDiagram.js";
import { MathBlock, MathInline } from "../lib/richMath.js";
import { ColoredUnderline, RICH_MARKS } from "../lib/richMarks.js";
import { DatabaseBlock as DatabaseBlockNode } from "../lib/richDatabase.js";
import { EntityRef } from "../lib/richRefs.js";
import { dlg } from "./dialogs.js";
import { EditorFindReplace } from "./EditorFindReplace.js";
import { EditorSourceDialog } from "./EditorSourceDialog.js";
import { EditorMobileBar } from "./EditorMobileBar.js";
import { EmojiPicker } from "./EmojiPicker.js";
import { SlashMenu } from "./SlashMenu.js";
import { RefPicker, type PickedRef } from "./RefPicker.js";
import {
  DatabasePicker,
  type PickedDatabase,
} from "./DatabasePicker.js";
import { api } from "../api.js";
import { AnchoredPopover } from "./AnchoredPopover.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";


/**
 * The text between the caret and the `/` that opened the menu.
 *
 * Returns null when there is no longer a slash to filter under, which is what
 * closes the menu: deleting it, moving the caret off the line, or typing a
 * space (a slash in the middle of a sentence is a slash, not a command).
 */
function slashQueryAt(editor: Editor): string | null {
  const { $from, empty } = editor.state.selection;
  if (!empty) return null;
  const before = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    "\uFFFC",
  );
  const at = before.lastIndexOf("/");
  if (at === -1) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  // Only a slash that starts a word opens a menu, same rule as when it fired.
  const preceding = at === 0 ? "" : before[at - 1];
  if (preceding && !/\s/.test(preceding)) return null;
  return query;
}

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
  // Read once for the extension config, which is built before the editor and
  // does not re-read it: a note whose placeholder changed language mid-session
  // is not worth re-creating the editor for.
  const placeholderHint = t("richText.slashPlaceholder");
  const [redactSensitive, setRedactSensitive] = useState(false);
  const [maximised, setMaximised] = useState(false);
  const [picking, setPicking] = useState<"entity" | "asset" | null>(null);
  const [pickingDatabase, setPickingDatabase] = useState(false);
  const [finding, setFinding] = useState(false);
  const [emoji, setEmoji] = useState(false);
  /** The formula or diagram whose source is being written. */
  const [source, setSource] = useState<{
    kind: "mathInline" | "mathBlock" | "diagram";
    initial: string;
  } | null>(null);
  /** Open while a `/` is being typed: what follows filters the menu. */
  const [slash, setSlash] = useState<{
    query: string;
    at: { x: number; y: number };
  } | null>(null);
  /**
   * The file input the slash menu opens.
   *
   * A second one, next to the toolbar's: a file input has to be in the tree to
   * be clicked, the toolbar's belongs to the toolbar, and reaching into
   * another component's ref to fake a click is worse than one more hidden
   * input.
   */
  const slashImage = useRef<HTMLInputElement>(null);
  /** The emoji panel hangs off the toolbar's button, wherever it ends up. */
  const emojiAnchor = useRef<HTMLSpanElement>(null);
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

  /**
   * The highlighter starts empty and learns its grammars in the background.
   *
   * `lowlight`'s common set is six hundred kilobytes of language definitions.
   * Bundled with the app it made the main script forty per cent heavier for
   * everyone, including the majority of pages that never open an editor. So
   * the instance is created empty, the grammars are registered when they
   * arrive, and the editor is nudged to repaint. Until then a code block is
   * black and white, which is what it was yesterday.
   */
  const lowlight = useMemo(() => createLowlight(), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Replaced below by the highlighting one, which is the same node with
        // a language attribute and a paint job.
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      // Checklists. `nested` because a checklist that cannot have a sub-item
      // is a list of one level pretending to be an outline.
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      MathInline,
      MathBlock,
      DiagramBlock,
      Callout,
      CharacterCount,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "paragraph" ? placeholderHint : "",
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      // TextStyle is the span the other two hang their styles on.
      TextStyle,
      Color,
      FontFamily,
      ColoredUnderline,
      ImageExt.configure({ allowBase64: true }),
      EntityRef,
      DatabaseBlockNode,
      ...RICH_MARKS,
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      setSlash((open) => {
        if (!open) return open;
        const query = slashQueryAt(editor);
        // The slash was deleted, or the caret walked away from it.
        return query === null ? null : { ...open, query };
      });
    },
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
        if (text !== "@" && text !== "#" && text !== "/" && text !== ":") {
          return false;
        }
        const before = from > 0 ? view.state.doc.textBetween(from - 1, from) : "";
        if (before && !/\s/.test(before)) return false;
        if (text === "/") {
          // The slash *stays* in the text and the menu filters on what follows
          // it, so typing "/tab" narrows and Escape leaves a normal slash
          // behind. The other triggers consume their character because their
          // pickers are dialogs, not a filter over the text you are typing.
          const box = view.coordsAtPos(from);
          setSlash({ query: "", at: { x: box.left, y: box.bottom } });
          return false;
        }
        if (text === ":") {
          setEmoji(true);
          return true;
        }
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
  const createDatabase = async (template: DbTemplate) => {
    try {
      const db = await api.createDatabase(t("db.newName"), template);
      embed(db.id, db.name, null);
    } catch (e) {
      await dlg.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const applyDatabase = (picked: PickedDatabase) =>
    embed(picked.id, picked.name, picked.viewId);

  /**
   * Asked for as text, because that is what a formula and a diagram are.
   *
   * A dialog with a live preview would be nicer and is a different piece of
   * work; a prompt gets the source in, and the source is what both of these
   * store. Editing one again reopens it with what it said.
   */
  const askMath = (block: boolean) => {
    if (!editor) return;
    setSource({
      kind: block ? "mathBlock" : "mathInline",
      initial:
        (editor.getAttributes(block ? "mathBlock" : "mathInline")
          .latex as string) ?? "",
    });
  };

  const askDiagram = () => {
    if (!editor) return;
    setSource({
      kind: "diagram",
      initial:
        (editor.getAttributes("diagramBlock").source as string) ||
        "graph TD;\n  A[Inicio] --> B[Fin];",
    });
  };

  /**
   * What every surface (toolbar, `/` menu, phone panel) needs in order to run
   * an action that opens something else. Built once and handed to all three,
   * so an action cannot behave differently depending on where it was pressed.
   */
  const actionContext: EditorActionContext = {
    onPickRef: setPicking,
    onInsertDatabase: () => setPickingDatabase(true),
    onInsertImage: () => slashImage.current?.click(),
    onInsertMath: askMath,
    onInsertDiagram: askDiagram,
    onEmoji: () => setEmoji(true),
    onLink: () => {
      if (!editor) return;
      const prev = editor.getAttributes("link").href as string | undefined;
      const url = prompt(t("richText.linkPrompt"), prev ?? "https://");
      if (url === null) return;
      if (url === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    },
    close: () => setSlash(null),
  };

  /**
   * Delete the `/` and whatever was typed after it, then run the action.
   *
   * Both in the same transaction as the command itself, so a single undo puts
   * back exactly what was there rather than leaving the trigger behind.
   */
  const runSlash = (run: () => void) => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset);
    const at = before.lastIndexOf("/");
    setSlash(null);
    if (at >= 0) {
      const from = $from.start() + at;
      editor.chain().focus().deleteRange({ from, to: $from.pos }).run();
    }
    run();
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { common } = await import("lowlight");
      if (cancelled) return;
      lowlight.register(common);
      // An empty transaction is enough: the plugin recomputes its decorations
      // from the instance it already holds.
      editor?.view.dispatch(editor.state.tr);
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, lowlight]);

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
        ctx={actionContext}
        emojiAnchor={emojiAnchor}
        redactSensitive={redactSensitive}
        onToggleRedact={() => setRedactSensitive((r) => !r)}
        maximised={maximised}
        onToggleMaximise={() => toggleMaximised(!maximised)}
        finding={finding}
        onToggleFind={() => setFinding((v) => !v)}
      />
      {finding && (
        <EditorFindReplace editor={editor} onClose={() => setFinding(false)} />
      )}
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
      {/* The status line: how much is written, and — when the caret is in a
          code block — which grammar is colouring it. SiYuan puts document
          stats in the same place, and the language picker has nowhere better
          to live: it belongs to one block, not to the whole toolbar. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 px-2 py-1 text-[11px] text-slate-400 dark:border-slate-700">
        {editor.isActive("codeBlock") && (
          <select
            value={(editor.getAttributes("codeBlock").language as string) ?? ""}
            aria-label={t("richText.codeLanguage")}
            onChange={(e) =>
              editor
                .chain()
                .focus()
                .updateAttributes("codeBlock", { language: e.target.value })
                .run()
            }
            className="h-5 rounded border border-slate-300 bg-transparent px-1 text-[11px] dark:border-slate-600"
          >
            <option value="">auto</option>
            {CODE_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto">
          {t("richText.words", {
            words: editor.storage.characterCount.words(),
            chars: editor.storage.characterCount.characters(),
          })}
        </span>
      </div>
      <EditorMobileBar editor={editor} ctx={actionContext} />
      {pickingDatabase && (
        <DatabasePicker
          onPick={applyDatabase}
          onCreate={(template) => void createDatabase(template)}
          onClose={() => setPickingDatabase(false)}
        />
      )}
      {slash && editor && (
        <SlashMenu
          editor={editor}
          ctx={actionContext}
          query={slash.query}
          at={slash.at}
          onPicked={runSlash}
          onClose={() => setSlash(null)}
        />
      )}

      {source && editor && (
        <EditorSourceDialog
          title={
            source.kind === "diagram"
              ? t("richText.diagram")
              : t("richText.mathBlock")
          }
          hint={
            source.kind === "diagram"
              ? t("richText.diagramPrompt")
              : t("richText.mathPrompt")
          }
          initial={source.initial}
          rows={source.kind === "diagram" ? 8 : 3}
          onClose={() => setSource(null)}
          onSave={(text) => {
            const kind = source.kind;
            setSource(null);
            if (kind === "diagram") {
              editor.chain().focus().insertDiagram(text).run();
            } else if (kind === "mathBlock") {
              editor.chain().focus().insertMathBlock(text).run();
            } else {
              editor.chain().focus().insertMath(text).run();
            }
          }}
        />
      )}

      {emoji && (
        /* Anchored to the toolbar's button and portalled out of the dialog:
           the picker's own placement assumes a positioned parent and no
           scrolling ancestor, and the editor gives it neither. */
        <AnchoredPopover
          anchor={emojiAnchor}
          onClose={() => setEmoji(false)}
          width={288}
        >
          <EmojiPicker
            plain
            onPick={(e) => {
              setEmoji(false);
              editor?.chain().focus().insertContent(e).run();
            }}
            onClose={() => setEmoji(false)}
          />
        </AnchoredPopover>
      )}

      {picking && (
        <RefPicker
          mode={picking}
          onPick={applyRef}
          onClose={() => setPicking(null)}
        />
      )}
      <input
        ref={slashImage}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void insertImage(f);
        }}
      />

      {maximised && actions && (
        <div className="shrink-0 border-t border-slate-200 p-2 dark:border-slate-700">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * The languages offered for a code block.
 *
 * The ones `lowlight`'s common set already knows, which is what the renderer
 * loads: offering a grammar that is not there would colour nothing and look
 * like a bug in the block rather than a missing import.
 */
const CODE_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "go",
  "graphql",
  "html",
  "ini",
  "java",
  "javascript",
  "json",
  "kotlin",
  "less",
  "lua",
  "makefile",
  "markdown",
  "objectivec",
  "perl",
  "php",
  "python",
  "r",
  "ruby",
  "rust",
  "scss",
  "shell",
  "sql",
  "swift",
  "typescript",
  "vbnet",
  "xml",
  "yaml",
];

const FONTS: { key: "sans" | "serif" | "mono"; css: string }[] = [
  { key: "sans", css: "ui-sans-serif, system-ui, sans-serif" },
  { key: "serif", css: "Georgia, 'Times New Roman', serif" },
  { key: "mono", css: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

/**
 * The desktop toolbar.
 *
 * Most of it is rendered from the shared action list, so a block added once is
 * here, in the `/` menu and in the phone's panel without three edits. What
 * stays hand-written is the handful of controls that are not a single command
 * — the two colour palettes, the callout kinds, the font select, find, redact
 * and maximise — because each owns a popover or a piece of state, and forcing
 * them into the list would mean a `kind` field and a switch wherever it is
 * read: the abstraction earning nothing.
 */
function Toolbar({
  editor,
  ctx,
  emojiAnchor,
  redactSensitive,
  onToggleRedact,
  maximised,
  onToggleMaximise,
  finding,
  onToggleFind,
}: {
  editor: Editor;
  ctx: EditorActionContext;
  /** The emoji panel hangs off its button, wherever the list puts it. */
  emojiAnchor: React.RefObject<HTMLSpanElement>;
  redactSensitive: boolean;
  onToggleRedact: () => void;
  maximised: boolean;
  onToggleMaximise: () => void;
  finding: boolean;
  onToggleFind: () => void;
}) {
  const { t } = useTranslation();
  const [showColors, setShowColors] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const [showCallouts, setShowCallouts] = useState(false);
  const colorAnchor = useRef<HTMLSpanElement>(null);
  const highlightAnchor = useRef<HTMLSpanElement>(null);
  const calloutAnchor = useRef<HTMLSpanElement>(null);

  const groups = groupedActionsFor("toolbar");
  const renderGroup = (group: string) => {
    const found = groups.find((g) => g.group === group);
    if (!found) return null;
    return found.items.map((action) => {
      const Icon = action.icon;
      const button = (
        <Btn
          key={action.id}
          active={action.isActive?.(editor) ?? false}
          onClick={() => action.run(editor, ctx)}
          title={t(action.label as "richText.bold")}
        >
          <Icon className="h-3 w-3" />
        </Btn>
      );
      // The emoji panel is anchored to its own button, and the button's place
      // in the row is decided by the list rather than by this file.
      return action.id === "emoji" ? (
        <span key={action.id} ref={emojiAnchor} className="inline-flex">
          {button}
        </span>
      ) : (
        button
      );
    });
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
      {renderGroup("text")}

      {/* Colour of the letters and colour of the line under them, in one
          panel: a fixed palette rather than a wheel — notes want "make this
          red", not colorimetry. */}
      <span ref={colorAnchor} className="inline-flex">
        <Btn
          active={
            !!editor.getAttributes("textStyle").color ||
            !!editor.getAttributes("underline").color
          }
          onClick={() => setShowColors((v) => !v)}
          title={t("richText.colors")}
        >
          <Palette className="h-3 w-3" />
        </Btn>
        {showColors && (
          <AnchoredPopover
            anchor={colorAnchor}
            onClose={() => setShowColors(false)}
            width={232}
          >
            <span className="block p-1">
              <SectionLabel>{t("richText.colorSectionText")}</SectionLabel>
              <span className="flex flex-wrap items-center gap-1">
                {RICH_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-label={c.solid}
                    onClick={() => {
                      editor.chain().focus().setColor(c.solid).run();
                      setShowColors(false);
                    }}
                    className="h-5 w-5 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: c.solid }}
                  />
                ))}
              </span>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowColors(false);
                }}
                className={CLEAR_BTN}
              >
                {t("richText.clearColor")}
              </button>

              <SectionLabel>{t("richText.colorSectionUnderline")}</SectionLabel>
              <span className="flex flex-wrap items-center gap-1">
                {RICH_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-label={t("richText.underlineIn", {
                      color: t(`richText.colorName.${c.key}` as const),
                    })}
                    // Underlines and colours in one go: picking a colour with
                    // nothing underlined yet would otherwise set a colour on a
                    // line that is not there, and look like it did nothing.
                    onClick={() => {
                      editor
                        .chain()
                        .focus()
                        .setMark("underline", { color: c.solid })
                        .run();
                      setShowColors(false);
                    }}
                    className="flex h-5 w-5 items-end justify-center rounded border border-slate-200 pb-0.5 dark:border-slate-600"
                  >
                    <span
                      className="block h-[3px] w-3 rounded-full"
                      style={{ backgroundColor: c.solid }}
                    />
                  </button>
                ))}
              </span>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setMark("underline", { color: null }).run();
                  setShowColors(false);
                }}
                className={CLEAR_BTN}
              >
                {t("richText.plainUnderline")}
              </button>
            </span>
          </AnchoredPopover>
        )}
      </span>

      {/* Highlighter. Its own control rather than a third row in the panel
          above: this one paints behind the text. */}
      <span ref={highlightAnchor} className="inline-flex">
        <Btn
          active={editor.isActive("highlight")}
          onClick={() => setShowHighlight((v) => !v)}
          title={t("richText.highlight")}
        >
          <Highlighter className="h-3 w-3" />
        </Btn>
        {showHighlight && (
          <AnchoredPopover
            anchor={highlightAnchor}
            onClose={() => setShowHighlight(false)}
            width={232}
          >
            <span className="block p-1">
              <span className="flex flex-wrap items-center gap-1">
                {RICH_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-label={t("richText.highlightIn", {
                      color: t(`richText.colorName.${c.key}` as const),
                    })}
                    onClick={() => {
                      editor.chain().focus().setHighlight(c.soft).run();
                      setShowHighlight(false);
                    }}
                    className="h-5 w-5 rounded ring-1 ring-black/10"
                    style={{ backgroundColor: c.soft }}
                  />
                ))}
              </span>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetHighlight().run();
                  setShowHighlight(false);
                }}
                className={CLEAR_BTN}
              >
                {t("richText.clearHighlight")}
              </button>
            </span>
          </AnchoredPopover>
        )}
      </span>

      <Sep />
      {renderGroup("blocks")}

      {/* The five kinds of callout behind one button: five buttons in the row
          would be a fifth of the toolbar spent on one block. */}
      <span ref={calloutAnchor} className="inline-flex">
        <Btn
          active={editor.isActive("callout")}
          onClick={() => setShowCallouts((v) => !v)}
          title={t("richText.callout")}
        >
          <Info className="h-3 w-3" />
        </Btn>
        {showCallouts && (
          <AnchoredPopover
            anchor={calloutAnchor}
            onClose={() => setShowCallouts(false)}
            width={188}
          >
            <span className="block p-1">
              {CALLOUT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    editor.chain().focus().toggleCallout(kind).run();
                    setShowCallouts(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    editor.isActive("callout", { kind }) ? "font-medium" : ""
                  }`}
                >
                  <span className={`ab-callout-dot ab-callout-${kind}`} />
                  {t(`richText.calloutKind.${kind}` as "richText.calloutKind.info")}
                </button>
              ))}
            </span>
          </AnchoredPopover>
        )}
      </span>

      <Sep />
      {renderGroup("insert")}

      <Sep />
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
      {renderGroup("align")}

      <Sep />
      <Btn active={finding} onClick={onToggleFind} title={t("richText.findReplace")}>
        <Search className="h-3 w-3" />
      </Btn>
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
      // Pressing a toolbar button must not take the caret out of the text.
      //
      // Without this the click blurs the editor and every command has to
      // restore the selection through TipTap's `focus()`, which defers the
      // real DOM focus to a `requestAnimationFrame`. That is a race, and under
      // load it loses: the command lands on an editor that has no selection
      // yet and quietly does nothing. The phone's bar has always done this;
      // the desktop one was relying on the restore.
      onMouseDown={(e) => e.preventDefault()}
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

const CLEAR_BTN =
  "mt-1 w-full rounded border border-slate-300 px-1 py-0.5 text-[10px] dark:border-slate-600";

/** Names the row of swatches under it. Two rows without labels are a guess. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 mt-1 block text-[10px] uppercase tracking-wide text-slate-500 first:mt-0 dark:text-slate-400">
      {children}
    </span>
  );
}
