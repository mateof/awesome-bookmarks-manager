import createDOMPurify from "dompurify";

/**
 * A sanitiser of our own, not the shared one.
 *
 * DOMPurify's default export is a **global instance**, and hooks registered on
 * it apply to every call anywhere in the bundle. Mermaid registers two of them
 * (`beforeSanitizeAttributes` and `afterSanitizeAttributes`) the moment it
 * loads, to police the SVG it generates. From then on the app's own notes are
 * sanitised by a library's private rules, and attributes it has no opinion
 * about are quietly dropped.
 *
 * That is not a hypothetical: it is how `data-mermaid` came to be stripped out
 * of the very notes that carry a diagram, while `data-db-id` on the same
 * element survived. The diagram rendered in the editor, saved correctly,
 * arrived from the server intact, and vanished on the way into the page.
 *
 * So the app gets an instance nothing else can reach into. Anything that wants
 * to sanitise something for its own purposes can keep using the global one.
 */
export const notePurify = createDOMPurify(window);

/** The data attributes the app's own blocks and marks are built from. */
export const NOTE_DATA_ATTRS = [
  "target",
  "rel",
  "data-copyable",
  "data-spoiler",
  "data-highlight",
  "data-underline",
  "data-math",
  "data-math-block",
  "data-mermaid",
  "data-checked",
  "data-type",
  "data-ref",
  "data-ref-id",
  "data-ref-slug",
  "data-db-id",
  "data-db-name",
  "data-db-block",
  "data-db-view",
  "data-db-height",
  "data-db-mode",
];

/** Sanitise a note for rendering, keeping everything the app draws from. */
export function sanitizeNote(html: string): string {
  return notePurify.sanitize(html, { ADD_ATTR: NOTE_DATA_ATTRS });
}
