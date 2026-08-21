import sanitizeHtml from "sanitize-html";

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
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    // The copyable/spoiler markers ride on spans as data attributes; without
    // these they would be stripped on the way in and the marks would silently
    // stop working after a round-trip through the server.
    span: ["class", "style", "data-copyable", "data-spoiler"],
    "*": ["class", "style"],
  },
  // `style` being an allowed *attribute* is not enough: sanitize-html parses
  // its declarations and keeps only the ones listed here, so without this the
  // editor's text colour and font family survive the client and silently die
  // on the way through the server.
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/],
      "font-family": [/^[\w\s,'"-]{1,120}$/],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "data"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "noopener noreferrer",
        target: attribs.target ?? "_blank",
      },
    }),
  },
};

export function sanitizeRichText(html: string | null | undefined): string | null {
  if (!html) return null;
  return sanitizeHtml(html, OPTIONS);
}
