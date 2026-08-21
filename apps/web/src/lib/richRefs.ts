import { Node, mergeAttributes } from "@tiptap/core";
import {
  REF_ID_ATTR,
  REF_SLUG_ATTR,
  REF_TYPE_ATTR,
  type RefType,
} from "@awesome-bookmarks/shared";

/**
 * A reference chip: a pointer to another folder, another bookmark, or a file
 * attached somewhere in the account.
 *
 * Modelled as an **atom** node rather than a mark. A mark would let you put the
 * caret in the middle of the label and edit it, which would leave a chip whose
 * text no longer matches what it points at. An atom is a single indivisible
 * thing: you insert it or you delete it.
 *
 * It renders as a plain `<a>` with data attributes because the HTML has to
 * survive the server's sanitiser and be rendered outside the editor too (the
 * app, panels, shared views). A custom element would be stripped.
 *
 * The label is stored alongside the id on purpose. It means the note still
 * reads correctly before the chips resolve, and still says something useful if
 * the target is later deleted, instead of collapsing into an empty box.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    entityRef: {
      insertRef: (attrs: {
        refType: RefType;
        refId?: string | null;
        refSlug?: string | null;
        label: string;
      }) => ReturnType;
    };
  }
}

export const REF_CLASS = "ab-ref";

export const EntityRef = Node.create({
  name: "entityRef",
  inline: true,
  group: "inline",
  atom: true,
  // Selectable so it can be picked and deleted as a unit.
  selectable: true,

  addAttributes() {
    return {
      refType: {
        default: "bookmark" as RefType,
        parseHTML: (el) => el.getAttribute(REF_TYPE_ATTR),
        renderHTML: (attrs) => ({ [REF_TYPE_ATTR]: attrs.refType as string }),
      },
      refId: {
        default: null,
        parseHTML: (el) => el.getAttribute(REF_ID_ATTR),
        renderHTML: (attrs) =>
          attrs.refId ? { [REF_ID_ATTR]: attrs.refId as string } : {},
      },
      refSlug: {
        default: null,
        parseHTML: (el) => el.getAttribute(REF_SLUG_ATTR),
        renderHTML: (attrs) =>
          attrs.refSlug ? { [REF_SLUG_ATTR]: attrs.refSlug as string } : {},
      },
      label: {
        default: "",
        parseHTML: (el) => el.textContent ?? "",
        // The label is the anchor's text, not an attribute: it must stay
        // readable when the HTML is shown somewhere that knows nothing about
        // references, such as a plain-text export.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `a[${REF_TYPE_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, { class: REF_CLASS }),
      (node.attrs.label as string) || (node.attrs.refSlug as string) || "…",
    ];
  },

  renderText({ node }) {
    return (node.attrs.label as string) || "";
  },

  addCommands() {
    return {
      insertRef:
        (attrs) =>
        ({ chain }) =>
          // No .focus() here: TipTap's focus command is deferred to a rAF, and
          // the caller needs focus to be real by the time this returns.
          chain()
            .insertContent([
              { type: this.name, attrs },
              // A trailing space, or the caret stays glued to the chip and the
              // next character typed looks like part of it.
              { type: "text", text: " " },
            ])
            .run(),
    };
  },
});
