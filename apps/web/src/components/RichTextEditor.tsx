import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Eye,
  EyeOff,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/**
 * Rich-text editor for folder/bookmark descriptions.
 * The user explicitly wants to use this for free-form notes including
 * passwords, usernames, etc. — content is server-side encrypted at rest.
 * Use the eye toggle to redact sensitive fields when shoulder-surfing.
 */
export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const { t } = useTranslation();
  const [redactSensitive, setRedactSensitive] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
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
      className={`rounded border border-slate-300 dark:border-slate-700 ${
        redactSensitive ? "[&_.tiptap_*]:blur-sm" : ""
      }`}
    >
      <Toolbar
        editor={editor}
        redactSensitive={redactSensitive}
        onToggleRedact={() => setRedactSensitive((r) => !r)}
      />
      <div className="p-2">
        <EditorContent
          editor={editor}
          className="tiptap"
          aria-label={placeholder ?? t("richText.descriptionAria")}
        />
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  redactSensitive,
  onToggleRedact,
}: {
  editor: Editor;
  redactSensitive: boolean;
  onToggleRedact: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
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
