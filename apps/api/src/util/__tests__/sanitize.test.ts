import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "../sanitize.js";

/**
 * The server is the only thing every note passes through, in both directions,
 * so whatever it drops is gone for good — and it drops quietly. A mark that
 * looks perfect in the editor and comes back plain after a reload is the
 * failure this file is here to catch: the editor is not the authority on what
 * a note contains, this is.
 *
 * `allowedStyles` is the part that surprises: listing `style` as an allowed
 * *attribute* is not enough, because sanitize-html parses the declarations and
 * keeps only the properties named there.
 */
describe("sanitizeRichText", () => {
  it("keeps a highlight, colour and all", () => {
    const html = sanitizeRichText(
      '<p><span data-highlight="rgba(250, 204, 21, 0.42)" class="ab-highlight" style="background-color: rgba(250, 204, 21, 0.42)">marcado</span></p>',
    );
    expect(html).toContain("data-highlight");
    expect(html).toContain("background-color:rgba(250, 204, 21, 0.42)");
    expect(html).toContain("ab-highlight");
  });

  it("keeps a coloured underline", () => {
    const html = sanitizeRichText(
      '<p><u data-underline="#dc2626" style="text-decoration-color: #dc2626">subrayado</u></p>',
    );
    expect(html).toContain("<u");
    expect(html).toContain("data-underline");
    expect(html).toContain("text-decoration-color:#dc2626");
  });

  it("still keeps text colour and font, which share the same gate", () => {
    const html = sanitizeRichText(
      '<p><span style="color: #16a34a; font-family: Georgia, serif">verde</span></p>',
    );
    expect(html).toContain("color:#16a34a");
    expect(html).toContain("font-family");
  });

  it("drops a background that is not a colour", () => {
    // The point of the pattern: `background-color` is now allowed, so it has
    // to be allowed for colours only. A URL in there would fetch on render.
    const html = sanitizeRichText(
      '<p><span style="background-color: url(https://tracker.invalid/p.gif)">x</span></p>',
    );
    expect(html).not.toContain("tracker.invalid");
  });

  it("still strips scripts and javascript: links", () => {
    const html = sanitizeRichText(
      '<p><script>alert(1)</script><a href="javascript:alert(1)">x</a></p>',
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("javascript:");
  });
});
