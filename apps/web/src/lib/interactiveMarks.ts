import { COPYABLE_ATTR, SPOILER_ATTR } from "./richMarks.js";

/**
 * Behaviour for the copyable and spoiler marks in rendered (non-editing) text.
 *
 * Delegated from one listener on the container rather than bound per element:
 * the HTML arrives as a sanitised string through `dangerouslySetInnerHTML`, so
 * there are no React nodes to attach handlers to, and the content is replaced
 * wholesale whenever the description changes.
 */

const COPIED_CLASS = "ab-copied";
const REVEALED_ATTR = "data-revealed";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; a self-hosted instance on plain
    // HTTP over the LAN is a perfectly ordinary way to run this, so fall back
    // to the old selection trick rather than silently doing nothing.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function flash(el: HTMLElement) {
  el.classList.add(COPIED_CLASS);
  window.setTimeout(() => el.classList.remove(COPIED_CLASS), 1200);
}

/**
 * Wire a rendered rich-text container. Returns the cleanup function.
 *
 * `copiedLabel` is what the element announces after a successful copy; it is
 * passed in so this stays free of i18n plumbing.
 */
export function bindInteractiveMarks(
  root: HTMLElement,
  labels: { copy: string; reveal: string; copied: string },
): () => void {
  const decorate = () => {
    for (const el of root.querySelectorAll<HTMLElement>(`[${COPYABLE_ATTR}]`)) {
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("title", labels.copy);
    }
    for (const el of root.querySelectorAll<HTMLElement>(`[${SPOILER_ATTR}]`)) {
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      if (!el.hasAttribute(REVEALED_ATTR)) el.setAttribute("title", labels.reveal);
    }
  };
  decorate();

  const act = async (target: HTMLElement) => {
    const spoiler = target.closest<HTMLElement>(`[${SPOILER_ATTR}]`);
    if (spoiler) {
      // First click reveals. Only once it is readable does clicking copy it —
      // copying something the user has not seen would be a surprise.
      if (spoiler.getAttribute(REVEALED_ATTR) !== "true") {
        spoiler.setAttribute(REVEALED_ATTR, "true");
        spoiler.setAttribute("title", labels.copy);
        return;
      }
      if (await copyText(spoiler.textContent ?? "")) {
        spoiler.setAttribute("title", labels.copied);
        flash(spoiler);
      }
      return;
    }

    const copyable = target.closest<HTMLElement>(`[${COPYABLE_ATTR}]`);
    if (copyable && (await copyText(copyable.textContent ?? ""))) {
      copyable.setAttribute("title", labels.copied);
      flash(copyable);
    }
  };

  const onClick = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (!target.closest(`[${COPYABLE_ATTR}], [${SPOILER_ATTR}]`)) return;
    // A mark can sit inside a link; copying should not also navigate.
    e.preventDefault();
    e.stopPropagation();
    void act(target);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target as HTMLElement | null;
    if (!target?.closest(`[${COPYABLE_ATTR}], [${SPOILER_ATTR}]`)) return;
    e.preventDefault();
    void act(target);
  };

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKey);

  // The container's HTML is swapped wholesale when the description changes,
  // which drops the attributes added above; re-apply them when that happens.
  const observer = new MutationObserver(decorate);
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKey);
    observer.disconnect();
  };
}
