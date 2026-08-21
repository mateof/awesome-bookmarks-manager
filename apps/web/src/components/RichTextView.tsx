import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  REF_ID_ATTR,
  REF_SLUG_ATTR,
  REF_TYPE_ATTR,
} from "@awesome-bookmarks/shared";
import { bindInteractiveMarks } from "../lib/interactiveMarks.js";
import { COPYABLE_ATTR, SPOILER_ATTR } from "../lib/richMarks.js";
import { useRefChips } from "./RefChips.js";

interface Props {
  html: string;
  className?: string;
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
export function RichTextView({ html, className }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const safe = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ADD_ATTR: [
          "target",
          "rel",
          COPYABLE_ATTR,
          SPOILER_ATTR,
          REF_TYPE_ATTR,
          REF_ID_ATTR,
          REF_SLUG_ATTR,
        ],
      }),
    [html],
  );

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

  return (
    <>
    <div
      ref={ref}
      className={`prose prose-sm max-w-none dark:prose-invert ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
    {tooltip}
    </>
  );
}
