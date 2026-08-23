import { expect, test } from "@playwright/test";
import { createFolder, seedSpanish, signup } from "../fixtures/app.js";

/**
 * Icons below the fold are not fetched until they are needed.
 *
 * Every card in the grid carries a favicon, and the favicon job sets one on
 * nearly every bookmark, so a folder with a few hundred of them used to open
 * every one of those requests at once — including the ones several screens
 * down that the reader may never scroll to.
 *
 * The bound asserted is loose on purpose. How many images get fetched depends
 * on card size, view mode and the browser's lookahead, so pinning a number
 * would make this a test of Chromium's heuristics. What it has to catch is the
 * attribute going missing, and without it the count is every single one.
 *
 * Measured at the time of writing: 108 of 150, so about a quarter fewer. Worth
 * having and free, but not the order-of-magnitude the eager count suggests.
 */

/** The smallest possible PNG, so the test measures requests and not bytes. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex",
);

/**
 * Enough cards that the tail is genuinely far away.
 *
 * Chromium does not defer an image simply because it is below the fold: it
 * loads anything within roughly 1250px of the viewport. Forty small cards make
 * a page about 1700px tall, so *every* icon sits inside that margin and lazy
 * loading correctly does nothing. The saving only exists on the folders that
 * prompted this — the ones with a couple of hundred bookmarks — and a test
 * that used forty would have reported the feature as broken.
 */
const COUNT = 150;

test("los iconos de tarjetas fuera de pantalla no se piden al abrir la carpeta", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "lazy.icons.e2e@example.com",
    nickname: "lazyicons",
    password: "LazyIcons28xxxxx",
  });
  await createFolder(page, "Muchos");
  const folders = await (await page.request.get("/api/folders")).json();
  const folder = folders.find((f: { name: string }) => f.name === "Muchos");

  // Enough cards that most of them are well below the fold.
  for (let i = 0; i < COUNT; i++) {
    const b = await (
      await page.request.post("/api/bookmarks", {
        data: {
          folderId: folder.id,
          url: `https://ejemplo-${i}.invalid/`,
          title: `Marcador ${i}`,
          fetchSnapshot: false,
        },
      })
    ).json();
    // An icon has to exist for a card to render an <img> at all.
    const up = await page.request.post(`/api/bookmarks/${b.id}/icon`, {
      multipart: {
        file: { name: "i.png", mimeType: "image/png", buffer: PNG },
      },
    });
    expect(up.ok(), await up.text()).toBeTruthy();
  }

  const asked = new Set<string>();
  page.on("request", (r) => {
    const u = r.url();
    if (/\/api\/bookmarks\/[^/]+\/icon/.test(u)) asked.add(u);
  });

  await page.goto(`/folder/${folder.id}`);
  await expect(page.getByText("Marcador 0").first()).toBeVisible({
    timeout: 20_000,
  });
  // Give anything eager time to be requested before counting.
  await page.waitForTimeout(1500);

  const onOpen = asked.size;
  // eslint-disable-next-line no-console
  console.log(`icons requested on open: ${onOpen} of ${COUNT}`);
  expect(onOpen).toBeGreaterThan(0); // the cards do show icons
  // Without `loading="lazy"` this is exactly COUNT.
  expect(onOpen).toBeLessThan(COUNT - 10);

  // And they do arrive when scrolled to, which is the half that makes this an
  // optimisation rather than a missing feature.
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = main.scrollHeight;
  });
  await expect(async () => {
    expect(asked.size).toBeGreaterThan(onOpen);
  }).toPass({ timeout: 15_000 });

  await ctx.close();
});
