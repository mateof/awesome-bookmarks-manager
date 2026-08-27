import { notePurify } from "./purify.js";
import { DIAGRAM_ATTR } from "./richDiagram.js";
import { MATH_ATTR, MATH_BLOCK_ATTR } from "./richMath.js";

/**
 * Turning the sources a note stores into what a reader sees: formulas,
 * diagrams and highlighted code.
 *
 * One implementation for every place a note is rendered (its own page, the
 * full-screen dialog, a public panel, a group's copy), because these are the
 * kind of thing that quietly renders in one place and not in another until
 * somebody notices six weeks later.
 *
 * Everything here runs **after** the HTML has been sanitised and works on the
 * live DOM, replacing the contents of the markers the editor left. Nothing
 * generated here is ever stored.
 */

/**
 * Draw every formula under `root`. Safe to call again on the same nodes.
 *
 * KaTeX and its stylesheet arrive on demand, like Mermaid below and for the
 * same reason: they are a quarter of a megabyte that a page of bookmarks has
 * no use for, and the notes with formulas in them are the minority that should
 * pay for it.
 */
export async function renderMath(root: HTMLElement): Promise<void> {
  const pending = [
    ...root.querySelectorAll<HTMLElement>(
      `span[${MATH_ATTR}], div[${MATH_BLOCK_ATTR}]`,
    ),
  ].filter((el) => el.dataset.abRendered !== "1");
  if (pending.length === 0) return;

  const [{ default: katex }] = await Promise.all([
    import("katex"),
    import("katex/dist/katex.min.css"),
  ]);

  const paint = (el: HTMLElement, display: boolean) => {
    if (el.dataset.abRendered === "1") return;
    // The source is the element's text: an attribute cannot hold it safely
    // (see the note in `richMath.ts`), and this is also what makes a note
    // readable by anything that does not know about formulas at all.
    const latex = el.textContent ?? "";
    if (!latex.trim()) return;
    try {
      el.innerHTML = katex.renderToString(latex, {
        displayMode: display,
        // Never throws and never trusts: a formula somebody pasted is input,
        // and `\href` or `\includegraphics` in a note that gets published is
        // not a feature anyone asked for.
        throwOnError: false,
        trust: false,
        output: "html",
      });
      el.dataset.abRendered = "1";
    } catch {
      // Leaves the source visible, which is the honest failure for something
      // that was typed as text in the first place.
    }
  };

  for (const el of root.querySelectorAll<HTMLElement>(`span[${MATH_ATTR}]`)) {
    paint(el, false);
  }
  for (const el of root.querySelectorAll<HTMLElement>(`div[${MATH_BLOCK_ATTR}]`)) {
    paint(el, true);
  }
}

/**
 * Draw every diagram under `root`, loading Mermaid the first time one appears.
 *
 * The generated SVG is sanitised before it goes into the page. Mermaid is not
 * hostile, but it is a compiler from user text to markup, and markup built
 * from user text is exactly the thing this app sanitises everywhere else.
 */
export async function renderDiagrams(root: HTMLElement): Promise<void> {
  const nodes = [
    ...root.querySelectorAll<HTMLElement>(`div[${DIAGRAM_ATTR}]`),
  ].filter((el) => el.dataset.abRendered !== "1");
  if (nodes.length === 0) return;

  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    // Follows the app, because a diagram is read on the same page as the text
    // around it and a white box in a dark note reads as a broken image.
    theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
    securityLevel: "strict",
  });

  for (const [i, el] of nodes.entries()) {
    const source = el.textContent ?? "";
    if (!source.trim()) continue;
    try {
      const { svg } = await mermaid.render(
        `ab-mermaid-${Date.now().toString(36)}-${i}`,
        source,
      );
      el.innerHTML = notePurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      });
      el.dataset.abRendered = "1";
    } catch (e) {
      // A diagram with a syntax error says so and keeps its source, rather
      // than leaving a blank rectangle nobody can debug.
      el.dataset.abRendered = "1";
      el.textContent = source;
      el.dataset.abError = e instanceof Error ? e.message.slice(0, 200) : "1";
    }
  }
}

/**
 * Colour the code blocks under `root`.
 *
 * Highlight.js through lowlight, loaded on demand like Mermaid: a language
 * grammar set is a few hundred kilobytes, and most notes have no code in them.
 * The class the editor stored (`language-ts`) is what picks the grammar; when
 * it is missing or unknown the block is left as it is, which is plain but
 * correct.
 */
export async function renderCode(root: HTMLElement): Promise<void> {
  const blocks = [
    ...root.querySelectorAll<HTMLElement>("pre code"),
  ].filter((el) => el.dataset.abRendered !== "1");
  if (blocks.length === 0) return;

  const { common, createLowlight } = await import("lowlight");
  const lowlight = createLowlight(common);

  for (const el of blocks) {
    const language = [...el.classList]
      .find((c) => c.startsWith("language-"))
      ?.slice("language-".length);
    const code = el.textContent ?? "";
    if (!code.trim()) continue;
    try {
      const tree =
        language && lowlight.registered(language)
          ? lowlight.highlight(language, code)
          : lowlight.highlightAuto(code);
      el.innerHTML = hastToHtml(tree);
      el.dataset.abRendered = "1";
    } catch {
      el.dataset.abRendered = "1";
    }
  }
}

/**
 * Put a copy button on every code block.
 *
 * Code in a note is there to be run somewhere else, so copying it is the whole
 * errand. The button is built here rather than stored in the HTML: it is
 * chrome, not content, and content is what gets encrypted and shared.
 */
export function bindCodeCopy(root: HTMLElement, label: string, done: string): () => void {
  const cleanups: (() => void)[] = [];
  for (const pre of root.querySelectorAll<HTMLElement>("pre")) {
    if (pre.dataset.abCopy === "1") continue;
    pre.dataset.abCopy = "1";
    pre.classList.add("ab-pre");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ab-code-copy";
    button.textContent = label;
    button.title = label;
    const onClick = async (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const text = pre.querySelector("code")?.textContent ?? "";
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = done;
        window.setTimeout(() => {
          button.textContent = label;
        }, 1200);
      } catch {
        /* A denied clipboard is not worth an error dialog. */
      }
    };
    button.addEventListener("click", onClick);
    pre.appendChild(button);
    cleanups.push(() => {
      button.removeEventListener("click", onClick);
      button.remove();
      delete pre.dataset.abCopy;
    });
  }
  return () => {
    for (const c of cleanups) c();
  };
}

/**
 * The little of hast that highlighting produces, as HTML.
 *
 * Written here rather than pulled in from `hast-util-to-html`, which is a
 * general serialiser for a general tree. What comes out of lowlight is spans
 * with class names wrapping text, three node shapes in total, and escaping the
 * text is the only part that has to be right.
 */
interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] | string };
  children?: HastNode[];
}

function hastToHtml(node: { children?: unknown[] } | HastNode): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const one = (n: HastNode): string => {
    if (n.type === "text") return escape(n.value ?? "");
    if (n.type === "element") {
      const raw = n.properties?.className;
      const cls = Array.isArray(raw) ? raw.join(" ") : (raw ?? "");
      const inner = (n.children ?? []).map(one).join("");
      // Only ever a span: anything else out of a highlighter would be a
      // surprise, and a surprise is not something to serialise blindly.
      return `<span${cls ? ` class="${escape(cls)}"` : ""}>${inner}</span>`;
    }
    return (n.children ?? []).map(one).join("");
  };
  return ((node.children ?? []) as HastNode[]).map(one).join("");
}

/**
 * Put every table in a box that scrolls sideways.
 *
 * A table cannot be both "as wide as its content needs" and "no wider than the
 * sheet it is in" — one of the two has to give, and making the table itself
 * the scroller does not work: its columns still get squeezed into the width of
 * the block. The wrapper is what lets the columns size to their content, so a
 * cell holding a paragraph gets a paragraph's width instead of becoming a
 * ribbon one word wide, and anything past the edge is reachable by scrolling.
 *
 * Done at render time rather than stored: it is presentation, and the stored
 * HTML is content. Idempotent, because these views re-render.
 */
export function wrapTables(root: HTMLElement): void {
  for (const table of [...root.querySelectorAll("table")]) {
    if (table.parentElement?.classList.contains("ab-table-scroll")) continue;
    const box = document.createElement("div");
    box.className = "ab-table-scroll";
    table.parentNode?.insertBefore(box, table);
    box.appendChild(table);
  }
}

/** Headings of a rendered note, for its table of contents. */
export interface OutlineEntry {
  id: string;
  level: number;
  text: string;
}

/**
 * Number the headings and hand back the list.
 *
 * Ids are assigned here rather than stored, so a note whose headings were
 * written years ago gets an outline without being rewritten, and two notes on
 * one page cannot collide.
 */
export function collectOutline(root: HTMLElement, prefix: string): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const headings = root.querySelectorAll<HTMLElement>("h1, h2, h3, h4");
  headings.forEach((el, i) => {
    const id = `${prefix}-h${i}`;
    el.id = id;
    out.push({
      id,
      level: Number(el.tagName.slice(1)),
      text: (el.textContent ?? "").trim(),
    });
  });
  return out.filter((e) => e.text);
}
