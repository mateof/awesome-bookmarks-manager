import type { TemplateConfig } from "@awesome-bookmarks/shared";
import { Info } from "lucide-react";

/**
 * The panel's "there is text here" affordance and the shape it opens.
 *
 * Its own module because both the card layouts and the tree layouts need it,
 * and having the tree layouts import it from PanelRenderer (which imports
 * them) would be a cycle.
 */

/** Rich text to show in the panel's modal, whatever it belongs to. */
export interface PanelDesc {
  title: string;
  html: string;
  /** Present for a bookmark, absent for a folder. */
  url?: string;
}

export function stripHtml(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * The "there is text here" affordance, for a bookmark or a folder alike.
 *
 * Only rendered when the description has actual text: an empty paragraph left
 * behind by the editor is not worth an icon that opens an empty modal.
 */
export function InfoButton({
  title,
  html,
  url,
  template,
  onDesc,
}: {
  title: string;
  html: string | null;
  /** Only a bookmark has one; the modal shows the link when it is there. */
  url?: string;
  template: TemplateConfig;
  onDesc: (d: PanelDesc) => void;
}) {
  if (!html || stripHtml(html).length === 0) return null;
  return (
    <button
      type="button"
      title="Ver el texto"
      aria-label={`Ver el texto de ${title}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDesc({ title, html, ...(url ? { url } : {}) });
      }}
      style={{ flexShrink: 0, display: "inline-flex", background: "transparent", border: "none", cursor: "pointer", color: template.theme.muted, padding: 2, fontFamily: "inherit" }}
    >
      <Info size={16} />
    </button>
  );
}
