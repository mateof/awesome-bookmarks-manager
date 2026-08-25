import { Mark, mergeAttributes } from "@tiptap/core";
import UnderlineExt from "@tiptap/extension-underline";

/**
 * Marks for the kind of note this editor is actually used for: snippets you
 * need to hand to something else, values you would rather not have on screen
 * while someone is standing behind you, and the two ways of marking a passage
 * you want to find again — a coloured underline and a highlighter.
 *
 * They are plain `<span>`s (or the `<u>` that was already there) carrying a
 * data attribute. That matters: the HTML is stored encrypted, re-sanitised on
 * the server and rendered in several places (the app, public panels, shared
 * views), so the marker has to survive a sanitiser that strips anything it
 * does not recognise. A data attribute is the least exotic thing that does,
 * and it carries the colour itself, so the mark still knows what it was even
 * if some renderer along the way drops the inline `style`.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    copyable: {
      toggleCopyable: () => ReturnType;
    };
    spoiler: {
      toggleSpoiler: () => ReturnType;
    };
    highlight: {
      setHighlight: (color: string) => ReturnType;
      unsetHighlight: () => ReturnType;
    };
  }
}

export const COPYABLE_ATTR = "data-copyable";
export const SPOILER_ATTR = "data-spoiler";
export const HIGHLIGHT_ATTR = "data-highlight";
export const UNDERLINE_ATTR = "data-underline";

/** Click to copy the text to the clipboard. */
export const Copyable = Mark.create({
  name: "copyable",
  // Nested marks would produce ambiguous click targets, and "copy this bit"
  // is not something you meaningfully do twice over the same text.
  excludes: "copyable",

  parseHTML() {
    return [{ tag: `span[${COPYABLE_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        [COPYABLE_ATTR]: "true",
        class: "ab-copyable",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleCopyable:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});

/** Hidden until clicked; clicking again also copies it. */
export const Spoiler = Mark.create({
  name: "spoiler",
  excludes: "spoiler",

  parseHTML() {
    return [{ tag: `span[${SPOILER_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        [SPOILER_ATTR]: "true",
        class: "ab-spoiler",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleSpoiler:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});

/**
 * Highlighter pen.
 *
 * The colours are deliberately translucent. A note is read in the app in light
 * and in dark mode, and inside panels whose templates set their own
 * background, so an opaque pastel yellow would be right in exactly one of
 * those and unreadable in the rest: pale text on a pale block. A translucent
 * wash keeps whatever is underneath, so it darkens a dark page and lightens a
 * light one, and the text on top stays the colour it already was.
 */
export const Highlight = Mark.create({
  name: "highlight",

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) =>
          el.getAttribute(HIGHLIGHT_ATTR) || el.style.backgroundColor || null,
        renderHTML: (attrs) =>
          attrs.color
            ? {
                [HIGHLIGHT_ATTR]: attrs.color as string,
                style: `background-color: ${attrs.color}`,
              }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[${HIGHLIGHT_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "ab-highlight" }), 0];
  },

  addCommands() {
    return {
      setHighlight:
        (color: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

/**
 * The underline you already had, now able to carry a colour of its own.
 *
 * Extending rather than replacing keeps every note ever written: a plain `<u>`
 * still parses, and only gains a colour when someone picks one. The colour is
 * `text-decoration-color`, so it paints the line and leaves the letters alone
 * — which is the point of underlining in a colour rather than colouring the
 * text.
 */
export const ColoredUnderline = UnderlineExt.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: null,
        parseHTML: (el) =>
          el.getAttribute(UNDERLINE_ATTR) || el.style.textDecorationColor || null,
        renderHTML: (attrs) =>
          attrs.color
            ? {
                [UNDERLINE_ATTR]: attrs.color as string,
                style: `text-decoration-color: ${attrs.color}`,
              }
            : {},
      },
    };
  },
});

export const RICH_MARKS = [Copyable, Spoiler, Highlight];
