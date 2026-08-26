import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A paragraph that raises its voice: a note, a tip, a warning, a danger.
 *
 * The kind is a **word**, not a colour. A callout stored as "the green one"
 * cannot be restyled by a theme, cannot be read out by a screen reader and
 * means nothing in a copy that lands somewhere with a different palette; the
 * word survives all three. The colour is drawn from the kind in CSS.
 *
 * Content is `block+` rather than one paragraph on purpose. What people put in
 * a warning is a sentence *and* a list of what to do about it, and a callout
 * that can only hold one line pushes that list outside the box it belongs to.
 */

export const CALLOUT_ATTR = "data-callout";

export const CALLOUT_KINDS = ["note", "info", "tip", "warning", "danger"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selection, or change the kind when already inside one. */
      toggleCallout: (kind: CalloutKind) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "info" as CalloutKind,
        parseHTML: (el) => {
          const raw = el.getAttribute(CALLOUT_ATTR);
          return (CALLOUT_KINDS as readonly string[]).includes(raw ?? "")
            ? raw
            : "info";
        },
        renderHTML: (attrs) => ({ [CALLOUT_ATTR]: attrs.kind as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${CALLOUT_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `ab-callout ab-callout-${node.attrs.kind as string}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleCallout:
        (kind: CalloutKind) =>
        ({ editor, commands }) => {
          // Inside one already: change what it is rather than nesting a second
          // box inside the first, which is what a plain toggle would do.
          if (editor.isActive(this.name)) {
            if (editor.getAttributes(this.name).kind === kind) {
              return commands.lift(this.name);
            }
            return commands.updateAttributes(this.name, { kind });
          }
          return commands.wrapIn(this.name, { kind });
        },
    };
  },
});
