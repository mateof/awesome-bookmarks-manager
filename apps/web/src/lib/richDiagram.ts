import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A diagram written as text.
 *
 * Same arrangement as the formulas next door, for the same reasons: the
 * **source** is what gets stored, and the picture is drawn when the note is
 * read. Storing Mermaid's output would mean putting a few kilobytes of
 * generated SVG into an encrypted field, into every shared copy, and through a
 * sanitiser that has every right to distrust an SVG.
 *
 * The renderer loads Mermaid on demand. It is a couple of megabytes, and a
 * library that big has no business being in the bundle of a page that mostly
 * shows bookmarks: notes with a diagram in them are the minority, and they are
 * the only ones that should pay for it.
 */

export const DIAGRAM_ATTR = "data-mermaid";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    diagram: {
      insertDiagram: (source: string) => ReturnType;
    };
  }
}

export const DiagramBlock = Node.create({
  name: "diagramBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: "",
        // Read from the **text**, never from the attribute.
        //
        // The attribute is a marker with a fixed value, and that is not
        // tidiness: DOMPurify drops any attribute whose value contains `-->`,
        // because that sequence can close an HTML comment and is a known mXSS
        // vector. `-->` is Mermaid's arrow. Storing the source in the
        // attribute meant every diagram with an arrow in it — which is every
        // diagram — lost its source on the way into the page, while the
        // element and its class survived, so it looked like a rendering bug.
        parseHTML: (el) => el.textContent || "",
        renderHTML: () => ({ [DIAGRAM_ATTR]: "1" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${DIAGRAM_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes, node }) {
    // The source also goes in as text, so a reader that knows nothing about
    // this still shows what the diagram says rather than an empty box.
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "ab-diagram" }),
      (node.attrs.source as string) || "",
    ];
  },

  renderText({ node }) {
    return (node.attrs.source as string) || "";
  },

  addCommands() {
    return {
      // After the enclosing block, for the same reason as the formula next
      // door: a caret inside a code block or a table cell cannot hold one of
      // these, and the insertion would vanish silently.
      insertDiagram:
        (source: string) =>
        ({ commands, state }) =>
          commands.insertContentAt(state.selection.$to.after(1), {
            type: this.name,
            attrs: { source },
          }),
    };
  },
});
