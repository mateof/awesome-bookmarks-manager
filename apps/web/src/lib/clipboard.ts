/** Copy plain text to the clipboard. Resolves to whether it succeeded. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Copy a bookmark as a "nice" link: a Markdown `[title](url)` in text/plain and
 * a clickable `<a>` in text/html, so it pastes as Markdown into a plain editor
 * and as a real hyperlink into docs/email. Falls back to plain Markdown.
 */
export async function copyRichLink(
  title: string,
  url: string,
): Promise<boolean> {
  const label = title.trim() || url;
  const md = `[${label}](${url})`;
  try {
    if (
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard &&
      "write" in navigator.clipboard
    ) {
      const html = `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([md], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return true;
    }
  } catch {
    // Fall through to plain-text Markdown.
  }
  return copyText(md);
}
