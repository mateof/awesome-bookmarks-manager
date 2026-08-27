import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Highlighting the matches of a search **without touching the selection**.
 *
 * The first version moved the editor's selection to each match and called
 * `focus()` so you could see it. That is why typing in the search box was
 * impossible: every keystroke recomputed the matches and pulled the focus back
 * into the text, so the box lost the caret after two or three letters and the
 * search ran on whatever fragment had made it in.
 *
 * A decoration draws over the document without being part of it: no selection
 * moves, no focus moves, and the highlight survives the editor not being
 * focused at all — which is the normal state while you are typing a query.
 *
 * The selection is still used for one thing, and only on demand: replacing.
 * That is an edit, and an edit belongs in the document.
 */

export const findKey = new PluginKey<FindState>("abFind");

export interface FindMatch {
  from: number;
  to: number;
}

export interface FindState {
  matches: FindMatch[];
  /** Which match is the current one, drawn in a stronger colour. */
  current: number;
  decorations: DecorationSet;
}

function build(doc: import("@tiptap/pm/model").Node, query: string): FindMatch[] {
  const out: FindMatch[] = [];
  const needle = query.toLowerCase();
  if (!needle) return out;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let at = text.indexOf(needle);
    while (at !== -1) {
      out.push({ from: pos + at, to: pos + at + needle.length });
      at = text.indexOf(needle, at + needle.length);
    }
  });
  return out;
}

function decorate(
  doc: import("@tiptap/pm/model").Node,
  matches: FindMatch[],
  current: number,
): DecorationSet {
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === current ? "ab-find ab-find-current" : "ab-find",
      }),
    ),
  );
}

/** What a caller sends to change the search. */
export interface FindMeta {
  query: string;
  current: number;
}

export const EditorFind = Extension.create({
  name: "abFind",

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({
            matches: [],
            current: 0,
            decorations: DecorationSet.empty,
          }),
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(findKey) as FindMeta | undefined;
            if (meta) {
              const matches = build(newState.doc, meta.query);
              const current = matches.length
                ? Math.min(Math.max(meta.current, 0), matches.length - 1)
                : 0;
              return {
                matches,
                current,
                decorations: decorate(newState.doc, matches, current),
              };
            }
            if (!tr.docChanged) return value;
            // The document moved under the highlights: map them along rather
            // than dropping them, so replacing one match does not clear the
            // rest.
            const matches = value.matches
              .map((m) => ({
                from: tr.mapping.map(m.from),
                to: tr.mapping.map(m.to),
              }))
              .filter((m) => m.to > m.from);
            return {
              matches,
              current: Math.min(value.current, Math.max(matches.length - 1, 0)),
              decorations: decorate(newState.doc, matches, value.current),
            };
          },
        },
        props: {
          decorations(state) {
            return findKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
