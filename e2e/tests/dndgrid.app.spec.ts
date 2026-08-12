import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The grid view (like list/large/mosaic) now has a per-card drag handle with
 * touch-action: none, so bookmarks can be reordered there too — including on
 * mobile, where whole-card dragging fought with scrolling. We assert the
 * handle exists, opts out of touch scrolling, and actually starts a drag
 * (the card enters dnd-kit's dragging state). The reorder that follows is the
 * same shared onDragEnd used by every view.
 */
const user = {
  email: "hertha.ayrton@example.com",
  nickname: "herthaa",
  password: "ElectricArc1899xx",
};

test("modo rejilla: la tarjeta tiene un tirador táctil que inicia el arrastre", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
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
  const handle = aCard.getByRole("button", {
    name: "Arrastrar para reordenar",
  });
  await expect(handle).toBeVisible();

  // Mobile-capable: the handle opts out of touch scrolling.
  const touchAction = await handle.evaluate(
    (el) => getComputedStyle(el).touchAction,
  );
  expect(touchAction).toBe("none");

  // Pressing and moving the handle starts a drag: dnd-kit lowers the dragged
  // card's opacity.
  const hb = await handle.boundingBox();
  if (!hb) throw new Error("missing handle box");
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 24, {
    steps: 8,
  });
  await expect(async () => {
    const op = await aCard.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(op)).toBeLessThan(0.9);
  }).toPass({ timeout: 2000 });
  await page.mouse.up();
});
