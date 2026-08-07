import { and, eq, isNull } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { request } from "undici";
import { openField, sealField } from "../../auth/encryption.js";
import { getDb } from "../../db/client.js";
import { bookmarks } from "../../db/schema.js";
import { upsertSnapshotIndex } from "../../search/service.js";
import { bookmarkBlobDir, writeBlob } from "../../storage/blobs.js";
import { join } from "node:path";
import { NotFound } from "../../util/errors.js";

/**
 * Snapshots are "Wallabag style": a plain HTTP fetch plus a Readability
 * extraction of the readable article. No headless browser, so the runtime
 * image ships no Chromium (that was ~500 MB of the old image). The cost is
 * that JS-rendered / SPA pages capture only their initial HTML, and there is
 * no pixel screenshot anymore.
 */

interface SnapshotResult {
  html: string;
  text: string;
  title?: string;
}

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 AwesomeBookmarks/0.1";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 MB is plenty for an article

async function fetchHtml(url: string): Promise<string> {
  const res = await request(url, {
    method: "GET",
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "*",
    },
    maxRedirections: 5,
    headersTimeout: FETCH_TIMEOUT_MS,
    bodyTimeout: FETCH_TIMEOUT_MS,
  });

  const ctype = String(res.headers["content-type"] ?? "");
  if (res.statusCode >= 400) {
    res.body.destroy();
    throw new Error(`HTTP ${res.statusCode}`);
  }
  if (ctype && !/text\/html|application\/xhtml|application\/xml|text\/plain/i.test(ctype)) {
    res.body.destroy();
    throw new Error(`Unsupported content-type: ${ctype}`);
  }

  // Read with a hard size cap so a runaway response can't exhaust memory.
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_HTML_BYTES) {
      res.body.destroy();
      break;
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks);

  const charset = /charset=["']?([\w-]+)/i.exec(ctype)?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(raw);
  } catch {
    return raw.toString("utf8");
  }
}

/**
 * Wrap Readability's clean article HTML in a minimal, self-contained reader
 * document so the sandboxed iframe shows something legible (Readability's
 * `.content` is an unstyled fragment). Follows the viewer's OS colour scheme.
 */
function readerDoc(title: string | undefined, contentHtml: string): string {
  const safeTitle = (title ?? "").replace(/[<>&]/g, "");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><style>
:root{color-scheme:light dark}
body{max-width:42rem;margin:2rem auto;padding:0 1rem;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1e293b;background:#fff}
img{max-width:100%;height:auto}
a{color:#2563eb}
pre{white-space:pre-wrap;overflow-x:auto}
h1,h2,h3{line-height:1.25}
@media(prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}a{color:#60a5fa}}
</style></head><body>${contentHtml}</body></html>`;
}

function extractFallbackText(html: string): string {
  const dom = new JSDOM(html);
  return dom.window.document.body?.textContent?.trim() ?? "";
}

async function captureSnapshot(url: string): Promise<SnapshotResult> {
  const rawHtml = await fetchHtml(url);
  const dom = new JSDOM(rawHtml, { url });
  const docTitle = dom.window.document.title || "";

  // Readability mutates the document, so read the title first (done above).
  let article: ReturnType<Readability["parse"]> = null;
  try {
    article = new Readability(dom.window.document).parse();
  } catch {
    article = null;
  }

  const articleHtml = article?.content?.trim();
  const html = articleHtml
    ? readerDoc(article?.title ?? docTitle, articleHtml)
    : rawHtml;
  const text = (article?.textContent ?? extractFallbackText(rawHtml)).trim();
  const title =
    (article?.title && article.title.trim()) || docTitle || undefined;

  return { html, text, title };
}

interface SnapshotPayload {
  bookmarkId: string;
}

export async function runSnapshotJob(
  userId: string,
  dek: Buffer,
  payload: SnapshotPayload,
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
  const url = openField(dek, userId, "bookmark.url", Buffer.from(row.urlCt));

  // Mark as running so the UI shows progress instead of staying on "pending"
  getDb()
    .update(bookmarks)
    .set({ snapshotStatus: "running", snapshotError: null })
    .where(eq(bookmarks.id, bookmarkId))
    .run();

  const result = await captureSnapshot(url);

  const dir = bookmarkBlobDir(userId, bookmarkId);

  const sealedHtml = sealField(dek, userId, "snapshot.html", result.html);
  const sealedText = sealField(dek, userId, "snapshot.text", result.text);

  const htmlPath = await writeBlob(join(dir, "page.html.bin"), sealedHtml);
  const textPath = await writeBlob(join(dir, "text.bin"), sealedText);

  // If we captured a usable title and the bookmark still has the URL as title
  // (the case for quick-add or when the user didn't set one), update it.
  let titleUpdate: { titleCt: Buffer } | undefined;
  if (result.title && result.title.trim().length > 0) {
    const currentTitle = openField(
      dek,
      userId,
      "bookmark.title",
      Buffer.from(row.titleCt),
    );
    if (currentTitle === url) {
      titleUpdate = {
        titleCt: sealField(dek, userId, "bookmark.title", result.title.trim()),
      };
    }
  }

  getDb()
    .update(bookmarks)
    .set({
      snapshotHtmlPath: htmlPath,
      // No browser means no pixel screenshot; clear any stale one from an
      // earlier capture so the UI doesn't offer a mismatched image.
      snapshotScreenshotPath: null,
      snapshotTextPath: textPath,
      ...(titleUpdate ?? {}),
      snapshotStatus: "ready",
      snapshotError: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bookmarks.id, bookmarkId))
    .run();

  upsertSnapshotIndex(userId, bookmarkId, result.text);
}

export function markSnapshotError(bookmarkId: string, message?: string) {
  getDb()
    .update(bookmarks)
    .set({
      snapshotStatus: "error",
      snapshotError: message ? message.slice(0, 1024) : null,
    })
    .where(eq(bookmarks.id, bookmarkId))
    .run();
}
