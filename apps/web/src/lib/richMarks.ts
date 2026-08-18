import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Two marks for the kind of note this editor is actually used for: snippets
 * you need to hand to something else, and values you would rather not have on
 * screen while someone is standing behind you.
 *
 * Both are plain `<span>`s carrying a data attribute. That matters: the HTML
 * is stored encrypted, re-sanitised on the server and rendered in several
 * places (the app, public panels, shared views), so the marker has to survive
 * a sanitiser that strips anything it does not recognise. A data attribute on
 * a span is the least exotic thing that does.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    copyable: {
      toggleCopyable: () => ReturnType;
    };
    spoiler: {
      toggleSpoiler: () => ReturnType;
    };
  }
}

export const COPYABLE_ATTR = "data-copyable";
export const SPOILER_ATTR = "data-spoiler";

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

export const RICH_MARKS = [Copyable, Spoiler];
