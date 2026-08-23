import { useState } from "react";

/**
 * A bookmark's site icon, with a coloured letter tile when there is none.
 *
 * Lives on its own because both the panel's card layouts and its tree layouts
 * need it, and a second copy would be a second set of fallback rules.
 */
export function Favicon({
  url,
  title,
  accent,
  size = 22,
}: {
  url: string;
  /** Used for the fallback letter, so it matches what the card shows. */
  title?: string;
  accent: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  let host = "";
  let origin = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    origin = u.origin;
  } catch {
    // ignore
  }
  // Prefer the bookmark's name: "Hacker News" reads as H, not as the N of
  // news.ycombinator.com. The host is only a fallback for untitled entries.
  const source = title?.trim() || host || url || "?";
  const letter = [...source.replace(/^https?:\/\//, "").replace(/^www\./, "")][0] ?? "?";
  if (failed || !origin) {
    return (
      <span style={{ width: size, height: size, borderRadius: 6, background: accent, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, fontWeight: 700, flexShrink: 0 }}>{letter.toUpperCase()}</span>
    );
  }
  return <img src={`${origin}/favicon.ico`} alt="" loading="lazy" decoding="async" width={size} height={size} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />;
}
