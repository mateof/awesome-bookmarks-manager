/**
 * Finding text in a note that has already been rendered.
 *
 * The editor searches the document's own positions, which is the only safe way
 * to *replace* something. This is the read side, where there is no document to
 * ask: the note is HTML in the page. So it walks the text nodes and wraps the
 * matches in `<mark>`.
 *
 * Two things it deliberately does not touch:
 *
 * **Rendered output.** A formula is a tree of KaTeX spans and a diagram is an
 * SVG; both were built from a source that no longer resembles what is on
 * screen, and wrapping half a `<mspace>` in a `<mark>` breaks the drawing for
 * a match nobody was looking for.
 *
 * **The stored HTML.** Everything here happens on the live DOM of a view. The
 * note is not being edited, and a search that dirtied it would be a search
 * that can lose data.
 */

const MARK = "ab-find";
const CURRENT = "ab-find-current";

/** Undo a previous highlight, leaving the text exactly as it was. */
export function clearFind(root: HTMLElement): void {
  for (const el of [...root.querySelectorAll(`mark.${MARK}`)]) {
    const parent = el.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(el.textContent ?? ""), el);
    // Rejoin the split text nodes, or the next search would not find a match
    // that straddles where this one ended.
    parent.normalize();
  }
}

/** Wrap every match. Returns how many there are. */
export function highlightFind(root: HTMLElement, query: string): number {
  clearFind(root);
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(".katex, svg, .ab-find")) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Collected first and edited after: replacing a node while the walker is
  // standing on it is how half a document goes missing.
  const targets: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    targets.push(node as Text);
    node = walker.nextNode();
  }

  let count = 0;
  for (const text of targets) {
    const value = text.nodeValue ?? "";
    const lower = value.toLowerCase();
    if (!lower.includes(needle)) continue;

    const frag = document.createDocumentFragment();
    let at = 0;
    for (;;) {
      const found = lower.indexOf(needle, at);
      if (found === -1) break;
      if (found > at) frag.append(value.slice(at, found));
      const mark = document.createElement("mark");
      mark.className = MARK;
      mark.textContent = value.slice(found, found + needle.length);
      frag.append(mark);
      at = found + needle.length;
      count++;
    }
    if (at < value.length) frag.append(value.slice(at));
    text.parentNode?.replaceChild(frag, text);
  }
  return count;
}

/** Mark one of the matches as the current one and scroll it into view. */
export function focusFind(root: HTMLElement, index: number): void {
  const marks = [...root.querySelectorAll<HTMLElement>(`mark.${MARK}`)];
  marks.forEach((m, i) => m.classList.toggle(CURRENT, i === index));
  marks[index]?.scrollIntoView({ block: "center", behavior: "smooth" });
}
