import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { bindInteractiveMarks } from "../lib/interactiveMarks.js";
import { COPYABLE_ATTR, SPOILER_ATTR } from "../lib/richMarks.js";

interface Props {
  html: string;
  className?: string;
}

/**
 * Renders rich-text HTML coming from the API. The server already sanitizes,
 * but defense-in-depth: also sanitize on the client. Cheap and safe.
 *
 * The copyable/spoiler markers are data attributes on spans, so DOMPurify has
 * to be told to keep them — its default allow-list drops unknown `data-*`.
 */
export function RichTextView({ html, className }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const safe = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ADD_ATTR: ["target", "rel", COPYABLE_ATTR, SPOILER_ATTR],
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

  return (
    <div
      ref={ref}
      className={`prose prose-sm max-w-none dark:prose-invert ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
