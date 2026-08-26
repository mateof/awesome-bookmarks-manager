import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AtSign,
  Bold,
  CheckSquare,
  ClipboardCopy,
  Code,
  Code2,
  Database,
  Eraser,
  EyeOff,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Info,
  Italic,
  Keyboard,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Quote,
  Sigma,
  Smile,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * Everything the editor can do, once.
 *
 * There are three ways into this editor — the toolbar on a desktop, the `/`
 * menu while typing, and the "+" panel over a phone's keyboard — and they used
 * to be three hand-written lists. That is not a tidiness problem, it is a
 * failure mode with a track record: the phone's list was written when there
 * were nine things to insert and stayed at nine while the editor gained
 * tables, checklists, code blocks, formulas, diagrams and callouts. Half the
 * editor was unreachable from a phone for three versions, with no error and no
 * empty state — nothing to notice.
 *
 * So the list lives here and each surface says which parts it shows. Adding a
 * block is now one entry, and forgetting a surface takes deliberate effort.
 *
 * What is **not** here is the handful of controls that are not a single
 * action: the colour palettes, the font and code-language selects, the find
 * bar, the redact toggle and the maximise button. Each owns state or a popover
 * of its own, and squeezing them into this shape would mean a `kind` field and
 * a switch at every call site, which is the abstraction earning nothing.
 */

export type EditorActionGroup = "text" | "blocks" | "insert" | "align";

/** The things a surface has to hand an action that opens something else. */
export interface EditorActionContext {
  onPickRef: (mode: "entity" | "asset") => void;
  onInsertDatabase: () => void;
  onInsertImage: () => void;
  onInsertMath: (block: boolean) => void;
  onInsertDiagram: () => void;
  onEmoji: () => void;
  onLink: () => void;
  /** Close the surface, for the ones that open a dialog of their own. */
  close: () => void;
}

export interface EditorAction {
  id: string;
  group: EditorActionGroup;
  /** i18n key, resolved by whoever renders it. */
  label: string;
  /** Extra words the `/` menu matches on, so "todo" finds the checklist. */
  keywords: string;
  icon: LucideIcon;
  /** Which surfaces show it. A few make sense in some and not in others. */
  surfaces: { toolbar?: boolean; slash?: boolean; mobile?: boolean };
  isActive?: (editor: Editor) => boolean;
  run: (editor: Editor, ctx: EditorActionContext) => void;
}

const ALL: EditorAction[] = [
  // --- marks ---------------------------------------------------------------
  {
    id: "bold",
    group: "text",
    label: "richText.bold",
    keywords: "negrita bold fuerte",
    icon: Bold,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: "italic",
    group: "text",
    label: "richText.italic",
    keywords: "cursiva italic",
    icon: Italic,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    id: "strike",
    group: "text",
    label: "richText.strike",
    keywords: "tachado strike",
    icon: Strikethrough,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("strike"),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    id: "code",
    group: "text",
    label: "richText.code",
    keywords: "codigo en linea inline code",
    icon: Code,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("code"),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    id: "underline",
    group: "text",
    label: "richText.underline",
    keywords: "subrayado underline",
    icon: UnderlineIcon,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("underline"),
    run: (e) => e.chain().focus().toggleUnderline().run(),
  },
  {
    id: "superscript",
    group: "text",
    label: "richText.superscript",
    keywords: "superindice exponente",
    icon: SupIcon,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("superscript"),
    run: (e) => e.chain().focus().toggleSuperscript().run(),
  },
  {
    id: "subscript",
    group: "text",
    label: "richText.subscript",
    keywords: "subindice",
    icon: SubIcon,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("subscript"),
    run: (e) => e.chain().focus().toggleSubscript().run(),
  },
  {
    id: "kbd",
    group: "text",
    label: "richText.kbd",
    keywords: "tecla teclado kbd",
    icon: Keyboard,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("kbd"),
    run: (e) => e.chain().focus().toggleKbd().run(),
  },
  {
    id: "copyable",
    group: "text",
    label: "richText.copyable",
    keywords: "copiable copiar clic",
    icon: ClipboardCopy,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("copyable"),
    run: (e) => e.chain().focus().toggleCopyable().run(),
  },
  {
    id: "spoiler",
    group: "text",
    label: "richText.spoiler",
    keywords: "oculto spoiler tapado",
    icon: EyeOff,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("spoiler"),
    run: (e) => e.chain().focus().toggleSpoiler().run(),
  },
  {
    id: "clearFormat",
    group: "text",
    label: "richText.clearFormat",
    keywords: "quitar formato limpiar",
    icon: Eraser,
    surfaces: { toolbar: true, mobile: true },
    // Marks only: turning a heading back into a paragraph is a different
    // decision and one people rarely mean by "clear formatting".
    run: (e) => e.chain().focus().unsetAllMarks().run(),
  },
  {
    id: "highlight",
    group: "text",
    label: "richText.highlight",
    keywords: "resaltar marcador",
    icon: Highlighter,
    // The toolbar has the palette of colours instead; this is the one-tap
    // version for a phone, where a grid of swatches over the keyboard is a
    // lot of screen for a decision most notes make once.
    surfaces: { mobile: true },
    isActive: (e) => e.isActive("highlight"),
    run: (e) =>
      e.isActive("highlight")
        ? e.chain().focus().unsetHighlight().run()
        : e.chain().focus().setHighlight("rgba(250, 204, 21, 0.42)").run(),
  },

  // --- blocks --------------------------------------------------------------
  {
    id: "h1",
    group: "blocks",
    label: "richText.heading1",
    keywords: "titulo grande h1 heading",
    icon: Heading1,
    surfaces: { toolbar: true, slash: true, mobile: true },
    isActive: (e) => e.isActive("heading", { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    group: "blocks",
    label: "richText.heading",
    keywords: "titulo h2 heading",
    icon: Heading2,
    surfaces: { toolbar: true, slash: true, mobile: true },
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    group: "blocks",
    label: "richText.heading3",
    keywords: "titulo pequeno h3 heading",
    icon: Heading3,
    surfaces: { toolbar: true, slash: true, mobile: true },
    isActive: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "bulletList",
    group: "blocks",
    label: "richText.list",
    keywords: "lista bullet ul puntos",
    icon: List,
    surfaces: { toolbar: true, slash: true, mobile: true },
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "orderedList",
    group: "blocks",
    label: "richText.orderedList",
    keywords: "lista numerada ordered ol",
    icon: ListOrdered,
    surfaces: { toolbar: true, slash: true, mobile: true },
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "taskList",
    group: "blocks",
    label: "richText.taskList",
    keywords: "tareas checklist todo casillas pendientes",
    icon: CheckSquare,
    surfaces: { toolbar: true, slash: true, mobile: true },
    isActive: (e) => e.isActive("taskList"),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: "blockquote",
    group: "blocks",
    label: "richText.quote",
    keywords: "cita quote",
    icon: Quote,
    surfaces: { toolbar: true, slash: true, mobile: true },
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "callout",
    group: "blocks",
    label: "richText.callout",
    keywords: "aviso nota callout destacado atencion",
    icon: Info,
    // The toolbar offers the five kinds behind one button; here it is the one
    // people mean when they say "a callout".
    surfaces: { slash: true, mobile: true },
    isActive: (e) => e.isActive("callout"),
    run: (e) => e.chain().focus().toggleCallout("info").run(),
  },
  {
    id: "codeBlock",
    group: "blocks",
    label: "richText.codeBlock",
    keywords: "codigo bloque code",
    icon: Code2,
    surfaces: { toolbar: true, slash: true, mobile: true },
    isActive: (e) => e.isActive("codeBlock"),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "table",
    group: "blocks",
    label: "richText.table",
    keywords: "tabla table cuadro filas columnas",
    icon: TableIcon,
    surfaces: { toolbar: true, slash: true, mobile: true },
    isActive: (e) => e.isActive("table"),
    run: (e) =>
      e.isActive("table")
        ? e.chain().focus().deleteTable().run()
        : e
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
  },
  {
    id: "rule",
    group: "blocks",
    label: "richText.rule",
    keywords: "separador linea hr regla",
    icon: Minus,
    surfaces: { toolbar: true, slash: true, mobile: true },
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },

  // --- things that open something else -------------------------------------
  {
    id: "link",
    group: "insert",
    label: "richText.link",
    keywords: "enlace link url",
    icon: LinkIcon,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive("link"),
    run: (_e, ctx) => ctx.onLink(),
  },
  {
    id: "entityRef",
    group: "insert",
    label: "refs.insertEntity",
    keywords: "referencia carpeta bookmark arroba",
    icon: AtSign,
    surfaces: { toolbar: true, slash: true, mobile: true },
    run: (_e, ctx) => {
      ctx.close();
      ctx.onPickRef("entity");
    },
  },
  {
    id: "assetRef",
    group: "insert",
    label: "refs.insertAsset",
    keywords: "referencia adjunto fichero almohadilla",
    icon: Paperclip,
    surfaces: { toolbar: true, slash: true, mobile: true },
    run: (_e, ctx) => {
      ctx.close();
      ctx.onPickRef("asset");
    },
  },
  {
    id: "database",
    group: "insert",
    label: "db.insert",
    keywords: "base de datos tabla db rejilla",
    icon: Database,
    surfaces: { toolbar: true, slash: true, mobile: true },
    run: (_e, ctx) => {
      ctx.close();
      ctx.onInsertDatabase();
    },
  },
  {
    id: "math",
    group: "insert",
    label: "richText.mathBlock",
    keywords: "formula matematicas latex ecuacion katex",
    icon: Sigma,
    surfaces: { toolbar: true, slash: true, mobile: true },
    run: (_e, ctx) => {
      ctx.close();
      ctx.onInsertMath(true);
    },
  },
  {
    id: "diagram",
    group: "insert",
    label: "richText.diagram",
    keywords: "diagrama mermaid grafico flujo esquema",
    icon: Workflow,
    surfaces: { toolbar: true, slash: true, mobile: true },
    run: (_e, ctx) => {
      ctx.close();
      ctx.onInsertDiagram();
    },
  },
  {
    id: "image",
    group: "insert",
    label: "richText.insertImage",
    keywords: "imagen foto image captura",
    icon: ImageIcon,
    surfaces: { toolbar: true, slash: true, mobile: true },
    run: (_e, ctx) => ctx.onInsertImage(),
  },
  {
    id: "emoji",
    group: "insert",
    label: "richText.emoji",
    keywords: "emoji emoticono cara simbolo",
    icon: Smile,
    surfaces: { toolbar: true, slash: true, mobile: true },
    run: (_e, ctx) => {
      ctx.close();
      ctx.onEmoji();
    },
  },

  // --- alignment -----------------------------------------------------------
  {
    id: "alignLeft",
    group: "align",
    label: "richText.alignLeft",
    keywords: "alinear izquierda",
    icon: AlignLeft,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive({ textAlign: "left" }),
    run: (e) => e.chain().focus().setTextAlign("left").run(),
  },
  {
    id: "alignCenter",
    group: "align",
    label: "richText.alignCenter",
    keywords: "centrar centro",
    icon: AlignCenter,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive({ textAlign: "center" }),
    run: (e) => e.chain().focus().setTextAlign("center").run(),
  },
  {
    id: "alignRight",
    group: "align",
    label: "richText.alignRight",
    keywords: "alinear derecha",
    icon: AlignRight,
    surfaces: { toolbar: true, mobile: true },
    isActive: (e) => e.isActive({ textAlign: "right" }),
    run: (e) => e.chain().focus().setTextAlign("right").run(),
  },
];

/** The actions one surface shows, in the order they were declared. */
export function actionsFor(
  surface: "toolbar" | "slash" | "mobile",
): EditorAction[] {
  return ALL.filter((a) => a.surfaces[surface]);
}

/** The same, split into its groups, for a surface that shows headings. */
export function groupedActionsFor(
  surface: "toolbar" | "slash" | "mobile",
): { group: EditorActionGroup; label: string; items: EditorAction[] }[] {
  const titles: Record<EditorActionGroup, string> = {
    text: "richText.groupText",
    blocks: "richText.groupBlocks",
    insert: "richText.groupInsert",
    align: "richText.groupAlign",
  };
  const order: EditorActionGroup[] = ["text", "blocks", "insert", "align"];
  return order
    .map((group) => ({
      group,
      label: titles[group],
      items: actionsFor(surface).filter((a) => a.group === group),
    }))
    .filter((g) => g.items.length > 0);
}
