import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { bindInteractiveMarks } from "../lib/interactiveMarks.js";
import { sanitizeNote } from "../lib/purify.js";
import {
  bindCodeCopy,
  collectOutline,
  renderCode,
  renderDiagrams,
  renderMath,
  wrapTables,
  type OutlineEntry,
} from "../lib/richRender.js";
import { useRefChips } from "./RefChips.js";
import { useDatabaseBlocks } from "./RichTextDatabases.js";

interface Props {
  html: string;
  className?: string;
  /**
   * Called with the note's headings once it has been drawn, for a table of
   * contents. Only the full-screen view asks: an outline beside a note that is
   * capped at 200 pixels would be taller than what it indexes.
   */
  onOutline?: (entries: OutlineEntry[]) => void;
  /**
   * Called with the whole note's HTML when a checkbox is ticked here.
   *
   * A checklist you can only tick by opening the editor is half a checklist:
   * the whole point of one is that ticking is the cheapest thing you do to it.
   * Given only when there is somewhere to save it, which is what also makes it
   * read-only in a shared copy or a public panel.
   */
  onTaskToggle?: (html: string) => void;
}

/**
 * Renders rich-text HTML coming from the API. The server already sanitizes,
 * but defense-in-depth: also sanitize on the client. Cheap and safe.
 *
 * The copyable/spoiler markers are data attributes on spans. DOMPurify keeps
 * `data-*` by default, so naming them here is not what makes them survive; it
 * records that they are load-bearing, so a future `USE_PROFILES` (which turns
 * that default off) does not quietly strip the marks.
 */
export function RichTextView({
  html,
  className,
  onOutline,
  onTaskToggle,
}: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const safe = useMemo(() => sanitizeNote(html), [html]);

  /**
   * Everything that is stored as source and drawn as something else.
   *
   * After the sanitiser and on the live DOM, in one place, so a formula
   * renders the same in a note, in the full-screen dialog and in a panel. The
   * two async ones load their libraries on demand and are fire-and-forget: a
   * note is readable before its diagrams are drawn, and blocking the text on a
   * two-megabyte import would be the wrong trade.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    wrapTables(el);
    void renderMath(el);
    void renderCode(el);
    void renderDiagrams(el);
    onOutline?.(collectOutline(el, "ab"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safe]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return bindCodeCopy(el, t("richText.copyCode"), t("richText.copiedCode"));
  }, [safe, t]);

  /**
   * Ticking a box.
   *
   * The DOM is edited in place and the container's own HTML is what gets
   * saved, so nothing has to reconstruct the note from a model it does not
   * have. The rest of the note is untouched by construction: one attribute on
   * one list item changes.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el || !onTaskToggle) return;
    el.dataset.abTasks = "1";
    const onClick = (e: MouseEvent) => {
      // `li[data-checked]` and not `li[data-type=taskItem]`: the editor marks
      // the *list* with a type and the *item* with its tick, and a selector
      // written from the wrong half matches nothing at all.
      const item = (e.target as HTMLElement).closest?.(
        "li[data-checked]",
      ) as HTMLElement | null;
      if (!item || !el.contains(item)) return;
      // Only the box, never the text: a note full of links inside checklist
      // items would become impossible to click through otherwise.
      const box = (e.target as HTMLElement).closest("label, input");
      const onBox =
        !!box || (e.offsetX <= 20 && e.target === item);
      if (!onBox) return;
      e.preventDefault();
      item.setAttribute(
        "data-checked",
        item.getAttribute("data-checked") === "true" ? "false" : "true",
      );
      onTaskToggle(el.innerHTML);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [safe, onTaskToggle]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return bindInteractiveMarks(el, {
      copy: t("richText.clickToCopy"),
      reveal: t("richText.clickToReveal"),
      copied: t("richText.copied"),
    });
  }, [t]);

  // Reference chips get their titles, their tooltip and their click behaviour
  // here; it returns the hover card, which portals to the body.
  const tooltip = useRefChips(ref, safe);
  // Embedded databases become real components, portalled into the placeholder
  // divs the note carries.
  const databases = useDatabaseBlocks(ref, safe);

  return (
    <>
    <div
      ref={ref}
      className={`prose prose-sm max-w-none dark:prose-invert ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
    {tooltip}
    {databases}
    </>
  );
}
