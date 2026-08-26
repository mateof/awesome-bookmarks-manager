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

  it("keeps a checklist, with its ticks", () => {
    const html = sanitizeRichText(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">' +
        "<div><p>Comprar pan</p></div></li></ul>",
    );
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
  });

  it("keeps a code block's language, which is what colours it", () => {
    const html = sanitizeRichText(
      '<pre><code class="language-python">print(1)</code></pre>',
    );
    expect(html).toContain('class="language-python"');
  });

  it("keeps the source of a formula and of a diagram", () => {
    const html = sanitizeRichText(
      '<p><span data-math="E = mc^2">E = mc^2</span></p>' +
        '<div data-math-block="\\int_0^1 x">…</div>' +
        '<div data-mermaid="graph TD; A-->B;">…</div>',
    );
    expect(html).toContain("data-math=");
    expect(html).toContain("data-math-block=");
    expect(html).toContain("data-mermaid=");
  });

  it("keeps a table's spans and a paragraph's alignment", () => {
    const html = sanitizeRichText(
      '<table><tbody><tr><td colspan="2" rowspan="1">x</td></tr></tbody></table>' +
        '<p style="text-align: center">centrado</p>',
    );
    expect(html).toContain('colspan="2"');
    expect(html).toContain("text-align:center");
  });

  it("keeps sub, sup and kbd", () => {
    const html = sanitizeRichText(
      "<p>H<sub>2</sub>O, x<sup>2</sup>, <kbd>Ctrl</kbd></p>",
    );
    expect(html).toContain("<sub>");
    expect(html).toContain("<sup>");
    expect(html).toContain("<kbd>");
  });

  it("keeps a callout, and what kind it is", () => {
    const html = sanitizeRichText(
      '<div data-callout="warning" class="ab-callout ab-callout-warning">' +
        "<p>Ojo con esto</p></div>",
    );
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain("ab-callout-warning");
  });

  it("still refuses a form control, checklist or not", () => {
    // The tick is an attribute and the box is drawn in CSS on purpose: text
    // that arrives from a share has no business carrying inputs.
    const html = sanitizeRichText(
      '<ul data-type="taskList"><li><input type="checkbox" checked> x</li></ul>',
    );
    expect(html).not.toContain("<input");
  });

  it("still strips scripts and javascript: links", () => {
    const html = sanitizeRichText(
      '<p><script>alert(1)</script><a href="javascript:alert(1)">x</a></p>',
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("javascript:");
  });
});
