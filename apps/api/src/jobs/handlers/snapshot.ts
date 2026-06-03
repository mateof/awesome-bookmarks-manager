import { aeadEncrypt } from "@awesome-bookmarks/crypto";
import { and, eq, isNull } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { chromium, type Browser } from "playwright-core";
import { openField, sealField } from "../../auth/encryption.js";
import { getDb } from "../../db/client.js";
import { bookmarks } from "../../db/schema.js";
import { upsertSnapshotIndex } from "../../search/service.js";
import {
  bookmarkBlobDir,
  writeBlob,
} from "../../storage/blobs.js";
import { join } from "node:path";
import { NotFound } from "../../util/errors.js";

let browserSingleton: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserSingleton) return browserSingleton;
  // `CHROMIUM_PATH` lets the production image point Playwright at the
  // system Chromium binary (Debian's `chromium` package) instead of
  // shipping the full Playwright bundle of 3 browsers. In dev it's unset
  // and Playwright falls back to whatever `playwright install chromium`
  // dropped under `~/.cache/ms-playwright`.
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  browserSingleton = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath,
  });
  return browserSingleton;
}

export async function closeBrowser() {
  if (browserSingleton) {
    await browserSingleton.close();
    browserSingleton = null;
  }
}

interface SnapshotResult {
  html: string;
  screenshot: Buffer;
  text: string;
  title?: string;
}

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 AwesomeBookmarks/0.1";

const GOTO_TIMEOUT_MS = 15_000;
const NETWORK_IDLE_TIMEOUT_MS = 3_000;
const SCREENSHOT_TIMEOUT_MS = 8_000;

async function captureWithPlaywright(url: string): Promise<SnapshotResult> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: USER_AGENT,
  });
  const page = await ctx.newPage();

  // Block heavy / blocking resources to speed up page load and reduce hangs.
  // Media (autoplay videos, audio) and fonts are the worst offenders for
  // network-idle delays. Beacons keep firing forever on some sites.
  await page.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "media" || t === "font") return route.abort();
    return route.continue();
  });

  try {
    // Two-phase load: domcontentloaded is reliable; networkidle is best-effort.
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_TIMEOUT_MS,
    });
    await page
      .waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS })
      .catch(() => {
        /* many sites never go fully idle — proceed anyway */
      });

    const title = await page.title().catch(() => "");
    const html = await page.content();

    // Viewport-only screenshot — fullPage screenshots stall on infinite-scroll
    // pages and produce huge images. Hard timeout in case Chromium hangs.
    const screenshot = await page.screenshot({
      fullPage: false,
      type: "png",
      timeout: SCREENSHOT_TIMEOUT_MS,
    });

    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const text = (article?.textContent ?? extractFallbackText(html)).trim();

    return { html, screenshot, text, title };
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
}

function extractFallbackText(html: string): string {
  const dom = new JSDOM(html);
  return dom.window.document.body?.textContent?.trim() ?? "";
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

  const result = await captureWithPlaywright(url);

  const dir = bookmarkBlobDir(userId, bookmarkId);

  const sealedHtml = sealField(dek, userId, "snapshot.html", result.html);
  const sealedScreenshot = aeadEncrypt(
    dek,
    result.screenshot,
    `${userId}|snapshot.screenshot`,
  );
  const sealedText = sealField(dek, userId, "snapshot.text", result.text);

  const htmlPath = await writeBlob(join(dir, "page.html.bin"), sealedHtml);
  const screenshotPath = await writeBlob(
    join(dir, "screenshot.png.bin"),
    sealedScreenshot,
  );
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
      snapshotScreenshotPath: screenshotPath,
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
