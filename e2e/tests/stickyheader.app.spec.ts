import { expect, test } from "@playwright/test";
import { openFolder, seedSpanish, signup } from "../fixtures/app.js";

/**
 * The bar with the breadcrumb and the folder's controls stays put.
 *
 * They used to be two separate rows that scrolled away with everything else,
 * so changing the view mode or adding a bookmark from the bottom of a long
 * folder meant scrolling all the way back to the top first. Pinned, they cost
 * a strip of screen while you read; hidden on the way down and back at the
 * first hint of the way up, they cost nothing and are there when you reach.
 */
test("cabecera: se queda fija, se va al bajar y vuelve al subir", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "sticky.header.e2e@example.com",
    nickname: "stickyheader",
    password: "StickyHeader27xx",
  });
  const req = page.request;

  const padre = await (
    await req.post("/api/folders", { data: { name: "Larga" } })
  ).json();
  // Enough to scroll: the behaviour does not exist on a folder that fits.
  // Created at once rather than one after another — forty round trips in a row
  // spend the test's whole budget before it has looked at anything.
  await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      req.post("/api/bookmarks", {
        data: {
          url: `https://larga.example/${i + 1}`,
          title: `Enlace número ${i + 1}`,
          folderId: padre.id,
          fetchSnapshot: false,
        },
      }),
    ),
  );

  // Short rather than narrow: below the `lg` breakpoint the sidebar is in the
  // DOM but hidden, and the helpers that open a folder by its name click the
  // first match, which would then be the invisible one.
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto("/");
  await openFolder(page, "Larga");

  // The breadcrumb and the controls are in one strip now, not two rows.
  const bar = page.locator("div.sticky").first();
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Subir de nivel" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Más acciones" })).toBeVisible();

  const scroller = page.locator("main");
  const scrollerTop = (await scroller.boundingBox())?.y ?? 0;
  // Measured against the top of the scrolling area, not against where the bar
  // started: "pinned" means it stays up there, and comparing with its own
  // first position would also pass for a bar that simply had not moved yet.
  const distanceFromTop = async () =>
    ((await bar.boundingBox())?.y ?? 0) - scrollerTop;

  // A nudge, less than it takes to hide it: the page moves and the bar does
  // not go with it. That is what "fixed" has to mean before anything else.
  await scroller.evaluate((el) => el.scrollBy(0, 30));
  await expect.poll(async () => (await distanceFromTop()) < 40).toBe(true);

  // Deliberate downward scrolling and it gets out of the way, all of it.
  await scroller.evaluate((el) => el.scrollBy(0, 400));
  await expect.poll(async () => (await distanceFromTop()) < -20).toBe(true);

  // The smallest flick upwards brings it straight back, without having to
  // scroll to the top first.
  await scroller.evaluate((el) => el.scrollBy(0, -12));
  await expect.poll(async () => (await distanceFromTop()) < 40).toBe(true);
  await expect.poll(async () => (await distanceFromTop()) > -2).toBe(true);

  await ctx.close();
});
