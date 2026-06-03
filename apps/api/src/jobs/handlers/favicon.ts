import { aeadEncrypt } from "@awesome-bookmarks/crypto";
import { and, eq, isNull } from "drizzle-orm";
import { parse as parseHtml } from "node-html-parser";
import { join } from "node:path";
import { openField } from "../../auth/encryption.js";
import { getDb } from "../../db/client.js";
import { bookmarks } from "../../db/schema.js";
import { bookmarkBlobDir, writeBlob } from "../../storage/blobs.js";
import { NotFound } from "../../util/errors.js";

// Browser-like User-Agent — sites like marca.com filter unknown UAs and serve
// a 4xx anti-bot page that has no <link rel="icon">.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ACCEPT_LANGUAGE = "es-ES,es;q=0.9,en;q=0.8";

interface Payload {
  bookmarkId: string;
}

export async function runFaviconJob(
  userId: string,
  dek: Buffer,
  payload: Payload,
) {
  const { bookmarkId } = payload;
  const row = getDb()
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.id, bookmarkId),
        eq(bookmarks.userId, userId),
        isNull(bookmarks.deletedAt),
      ),
    )
    .get();
  if (!row) throw NotFound("Bookmark not found");
  if (row.iconBlobPath && row.iconBlobPath.endsWith("/user-icon.bin")) return;
  const url = openField(dek, userId, "bookmark.url", Buffer.from(row.urlCt));

  const result = await fetchFaviconBytes(url);
  if (!result) return;

  const sealed = aeadEncrypt(dek, result.bytes, `${userId}|bookmark.icon`);
  const path = await writeBlob(
    join(bookmarkBlobDir(userId, bookmarkId), "favicon.bin"),
    sealed,
  );
  getDb()
    .update(bookmarks)
    .set({ iconBlobPath: path })
    .where(eq(bookmarks.id, bookmarkId))
    .run();
}

/** Public helper used by the on-demand favicon fetch endpoint. */
export async function fetchFaviconBytes(
  pageUrl: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  // 1. Fetch the page (or just learn the redirect target). Use Node's fetch
  //    so we can read `response.url` after redirects — undici.request hides
  //    that, which broke /favicon.ico resolution for sites that redirect to
  //    a different host (e.g. www.example.com → example.com).
  const { html, finalUrl } = await fetchHtml(pageUrl);

  // 2. Build candidate list — declared icons first, then well-known defaults.
  const candidates = collectFromHtml(html, finalUrl);
  for (const dft of [
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
    "/favicon.png",
  ]) {
    try {
      candidates.push(new URL(dft, finalUrl).toString());
    } catch {
      /* malformed */
    }
  }

  // Dedup
  const seen = new Set<string>();
  const list = candidates.filter((u) => {
    if (!u || u.startsWith("data:") || seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  // 3. Try each candidate
  for (const u of list) {
    const res = await fetchIcon(u, finalUrl);
    if (res) return res;
  }

  // Useful operator-side trace when nothing works
  console.warn(
    `[favicon] no usable icon for ${pageUrl} (final=${finalUrl}, tried=${list.length} candidates)`,
  );
  return null;
}

async function fetchHtml(
  pageUrl: string,
): Promise<{ html: string | null; finalUrl: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(pageUrl, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "accept-language": ACCEPT_LANGUAGE,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
      },
    });
    if (!res.ok) {
      console.warn(`[favicon] page ${pageUrl} → ${res.status}`);
      return { html: null, finalUrl: res.url || pageUrl };
    }
    const text = await res.text();
    return { html: text, finalUrl: res.url || pageUrl };
  } catch (err) {
    console.warn(
      `[favicon] page fetch failed for ${pageUrl}:`,
      err instanceof Error ? err.message : err,
    );
    return { html: null, finalUrl: pageUrl };
  } finally {
    clearTimeout(timer);
  }
}

function collectFromHtml(
  html: string | null,
  baseUrl: string,
): string[] {
  if (!html) return [];
  const root = parseHtml(html, { lowerCaseTagName: true });
  const links = root.querySelectorAll("link");
  const out: string[] = [];
  for (const l of links) {
    const rel = (l.getAttribute("rel") ?? "").toLowerCase();
    if (
      !rel.includes("icon") &&
      rel !== "shortcut icon" &&
      !rel.includes("apple-touch-icon") &&
      !rel.includes("fluid-icon") &&
      !rel.includes("mask-icon")
    ) {
      continue;
    }
    const href = l.getAttribute("href");
    if (!href) continue;
    try {
      out.push(new URL(href, baseUrl).toString());
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

async function fetchIcon(
  iconUrl: string,
  refererUrl: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(iconUrl, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
        referer: refererUrl,
      },
    });
    if (!res.ok) {
      return null;
    }
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const ab = await res.arrayBuffer();
    const bytes = Buffer.from(ab);
    if (bytes.length === 0 || bytes.length > 1024 * 1024) return null;

    // Magic-byte sniff — many servers serve favicons as application/octet-stream.
    const guessed = guessContentType(bytes);
    if (!ct.startsWith("image/") && !guessed) {
      return null;
    }
    return { bytes, contentType: ct.startsWith("image/") ? ct : guessed };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function guessContentType(buf: Buffer): string {
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "GIF8")
    return "image/gif";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  // ICO signature: 00 00 01 00
  if (
    buf.length >= 4 &&
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    buf[2] === 0x01 &&
    buf[3] === 0x00
  )
    return "image/x-icon";
  // SVG: starts with "<?xml" or "<svg"
  const head = buf.subarray(0, 256).toString("utf8").trim().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg"))
    return "image/svg+xml";
  return "";
}
