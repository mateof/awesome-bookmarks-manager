import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The grid view (like list/large/mosaic) now has a per-card drag handle with
 * touch-action: none, so bookmarks can be reordered there too — including on
 * mobile, where whole-card dragging fought with scrolling.
 */
const user = {
  email: "hertha.ayrton@example.com",
  nickname: "herthaa",
  password: "ElectricArc1899xx",
};

test("modo rejilla: reordenar bookmarks con el tirador de la tarjeta", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  // Narrow so the grid is a single column (as on a phone): the cards stack and
  // the drag is a vertical reorder.
  await page.setViewportSize({ width: 700, height: 900 });
  await signup(page, user);
  const req = page.request;

  await req.post("/api/bookmarks", {
    data: { url: "https://a.example/", title: "AAAgrid", fetchSnapshot: false },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://b.example/", title: "BBBgrid", fetchSnapshot: false },
  });

  await page.goto("/"); // grid is the default view

  const aCard = page
    .locator("div.group.relative")
    .filter({ hasText: "AAAgrid" })
    .first();
  const bCard = page
    .locator("div.group.relative")
    .filter({ hasText: "BBBgrid" })
    .first();
  const handle = aCard.getByRole("button", {
    name: "Arrastrar para reordenar",
  });
  await expect(handle).toBeVisible();

  const hb = await handle.boundingBox();
  const bb = await bCard.boundingBox();
  if (!hb || !bb) throw new Error("missing bounding boxes");

  const hx = hb.x + hb.width / 2;
  const hy = hb.y + hb.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx, hy + 8, { steps: 4 });
  // B spans the full width, so dropping straight down lands over it.
  await page.mouse.move(hx, bb.y + bb.height / 2, { steps: 16 });
  await page.mouse.move(hx, bb.y + bb.height / 2 + 4, { steps: 4 });
  await page.mouse.up();

  await expect(async () => {
    const bms = await (await req.get("/api/bookmarks")).json();
    expect(bms[0].title).toBe("BBBgrid");
  }).toPass({ timeout: 8000 });
});
