import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Formulas, inline and on their own line.
 *
 * The LaTeX source is what is stored; the rendering happens when the note is
 * drawn. That is the only arrangement that survives this app's shape: the HTML
 * goes through a sanitiser on the way in and is rendered in four places (the
 * editor, the note, a public panel, a group's copy), and storing KaTeX's
 * output would mean storing a wall of nested spans that any sanitiser is right
 * to be suspicious of, in every one of those copies, forever.
 *
 * So: a `<span data-math>` and a `<div data-math-block>` carrying the source as
 * text, and one renderer that turns them into formulas wherever they land. A
 * note read somewhere that has not learned about maths still shows the source,
 * which is the honest degradation for something written as `E = mc^2`.
 */

export const MATH_ATTR = "data-math";
export const MATH_BLOCK_ATTR = "data-math-block";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      insertMath: (latex: string) => ReturnType;
      insertMathBlock: (latex: string) => ReturnType;
    };
  }
}

/** `$…$`: a formula in the middle of a sentence. */
export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  // Selectable and atomic: a formula is edited as a whole through its dialog,
  // not by putting a caret in the middle of `\frac`.
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        // In the text, not in the attribute: see the note on the diagram node.
        // A sanitiser that meets `-->` or `]>` inside an attribute value drops
        // the attribute, and LaTeX is not immune to either.
        parseHTML: (el) => el.textContent || "",
        renderHTML: () => ({ [MATH_ATTR]: "1" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[${MATH_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "ab-math" }),
      (node.attrs.latex as string) || "",
    ];
  },

  renderText({ node }) {
    return `$${(node.attrs.latex as string) || ""}$`;
  },

  addCommands() {
    return {
      insertMath:
        (latex: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
      /**
       * Inserted **after the block the caret is in**, at the top level.
       *
       * `insertContent` puts the node where the selection is, and a selection
       * inside a code block or a table cell cannot hold a block node: the
       * insertion is dropped without a word. Placing it after the enclosing
       * block is the answer that works from anywhere, and it is also where
       * somebody who asked for a formula while writing code expects it.
       */
      insertMathBlock:
        (latex: string) =>
        ({ commands, state }) =>
          commands.insertContentAt(state.selection.$to.after(1), {
            type: "mathBlock",
            attrs: { latex },
          }),
    };
  },
});

/** `$$…$$`: a formula that gets its own line, centred. */
export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.textContent || "",
        renderHTML: () => ({ [MATH_BLOCK_ATTR]: "1" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${MATH_BLOCK_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "ab-math-block" }),
      (node.attrs.latex as string) || "",
    ];
  },

  renderText({ node }) {
    return `$$${(node.attrs.latex as string) || ""}$$`;
  },
});
