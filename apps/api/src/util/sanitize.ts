import sanitizeHtml from "sanitize-html";

/** A colour and nothing else: `#rgb`…`#rrggbbaa`, `rgb()` or `rgba()`. */
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "p",
    "blockquote",
    "ul",
    "ol",
    "li",
    "code",
    "pre",
    "strong",
    "em",
    "u",
    "s",
    "a",
    "br",
    "hr",
    "span",
    "div",
    // Formulas and diagrams store their source as text inside a marker, and
    // these three carry meaning no other tag does: a key you press, and the
    // two halves of a chemical formula or an exponent.
    "kbd",
    "sub",
    "sup",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    // Reference chips are anchors carrying data attributes. Same reasoning as
    // the span markers below: unlisted attributes are stripped, so a reference
    // to another bookmark would come back from the server as plain text.
    a: [
      "href",
      "title",
      "target",
      "rel",
      "data-ref",
      "data-ref-id",
      "data-ref-slug",
    ],
    img: ["src", "alt", "title", "width", "height"],
    // The copyable/spoiler/highlight markers ride on spans as data attributes;
    // without these they would be stripped on the way in and the marks would
    // silently stop working after a round-trip through the server.
    span: [
      "class",
      "style",
      "data-copyable",
      "data-spoiler",
      "data-highlight",
      // The LaTeX source of an inline formula. The rendered formula is never
      // stored: it is built when the note is drawn, from this.
      "data-math",
    ],
    // Checklists are `li[data-checked]` inside `ul[data-type="taskList"]`, and
    // the box is drawn in CSS. Deliberately not an `<input>`: allowing form
    // controls in text that arrives from a share is a door this app has no
    // reason to open.
    ul: ["class", "data-type"],
    ol: ["class", "data-type", "start"],
    li: ["class", "data-type", "data-checked"],
    // The language class is what tells the renderer which grammar to colour
    // with, so it has to survive the round trip like any other content.
    code: ["class"],
    pre: ["class"],
    th: ["class", "style", "colspan", "rowspan", "colwidth"],
    td: ["class", "style", "colspan", "rowspan", "colwidth"],
    // A coloured underline is a `<u>` carrying its colour twice: in the style
    // that paints it and in the data attribute that survives a renderer which
    // drops styles.
    u: ["data-underline"],
    // An embedded database is a div holding only the id; the rows live in
    // their own tables and are fetched when the note renders.
    div: [
      "class",
      "style",
      "data-db-id",
      "data-db-name",
      "data-db-block",
      "data-db-view",
      "data-db-height",
      "data-db-mode",
      // Sources, same as the inline formula above: what is stored is the text
      // somebody wrote, never the picture built from it.
      "data-math-block",
      "data-mermaid",
      // Which kind of callout this is, as a word. A colour would not survive a
      // theme, a screen reader or a copy that lands somewhere else.
      "data-callout",
    ],
    "*": ["class", "style"],
  },
  // `style` being an allowed *attribute* is not enough: sanitize-html parses
  // its declarations and keeps only the ones listed here, so without this the
  // editor's text colour and font family survive the client and silently die
  // on the way through the server.
  allowedStyles: {
    "*": {
      color: COLOR,
      // The highlighter's wash and the colour of an underline. Colours only:
      // the patterns take a hex or an rgb()/rgba(), so nothing here can carry
      // a URL, and a declaration that does not match is dropped whole.
      "background-color": COLOR,
      "text-decoration-color": COLOR,
      "font-family": [/^[\w\s,'"-]{1,120}$/],
      // Written by the alignment buttons. A keyword list rather than a
      // pattern: there are four of them and no reason to accept a fifth.
      "text-align": [/^(left|center|right|justify)$/],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "data"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  transformTags: {
    a: (tagName, attribs) => {
      // A reference chip is not a link out: it has no href, and its click is
      // wired by the renderer. Forcing target/rel on it would leave a dangling
      // anchor that looks like an external link and does nothing.
      if (attribs["data-ref"]) return { tagName, attribs };
      return {
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer",
          target: attribs.target ?? "_blank",
        },
      };
    },
  },
};

export function sanitizeRichText(html: string | null | undefined): string | null {
  if (!html) return null;
  return sanitizeHtml(html, OPTIONS);
}
