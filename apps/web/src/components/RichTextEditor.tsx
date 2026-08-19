import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  ClipboardCopy,
  Code,
  Eye,
  EyeOff,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  Maximize2,
  Minimize2,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import { RICH_MARKS } from "../lib/richMarks.js";
import { useEffect, useState } from "react";
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
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
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
    },
  });

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
      {maximised && actions && (
        <div className="shrink-0 border-t border-slate-200 p-2 dark:border-slate-700">
          {actions}
        </div>
      )}
    </div>
  );
}

function Toolbar({
  editor,
  redactSensitive,
  onToggleRedact,
  maximised,
  onToggleMaximise,
}: {
  editor: Editor;
  redactSensitive: boolean;
  onToggleRedact: () => void;
  maximised: boolean;
  onToggleMaximise: () => void;
}) {
  const { t } = useTranslation();
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
      <Sep />
      <Btn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title={t("richText.heading")}
      >
        <Heading2 className="h-3 w-3" />
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
