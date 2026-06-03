import DOMPurify from "dompurify";
import { useMemo } from "react";

interface Props {
  html: string;
  className?: string;
}

/**
 * Renders rich-text HTML coming from the API. The server already sanitizes,
 * but defense-in-depth: also sanitize on the client. Cheap and safe.
 */
export function RichTextView({ html, className }: Props) {
  const safe = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ADD_ATTR: ["target", "rel"],
      }),
    [html],
  );
  return (
    <div
      className={`prose prose-sm max-w-none dark:prose-invert ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
