import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The "Tabla detalle" (table) view has a per-row drag handle so bookmarks can
 * be reordered (they weren't sortable at all before). We assert the handle
 * exists, opts out of touch scrolling, and starts a drag (the row enters
 * dnd-kit's dragging state); the reorder itself is the shared onDragEnd.
 */
const user = {
  email: "sophie.wilson@example.com",
  nickname: "sophiew",
  password: "AcornARMDesign1985",
};

test("modo tabla: la fila tiene un tirador táctil que inicia el arrastre", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  await req.post("/api/bookmarks", {
    data: { url: "https://a.example/", title: "AAArow", fetchSnapshot: false },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://b.example/", title: "BBBrow", fetchSnapshot: false },
  });

  await page.evaluate(() => localStorage.setItem("viewMode", "table"));
  await page.goto("/");

  const aRow = page.locator("tr", { hasText: "AAArow" });
  const handle = aRow.getByLabel("Arrastrar para reordenar");
  await expect(handle).toBeVisible();

  const touchAction = await handle.evaluate(
    (el) => getComputedStyle(el).touchAction,
  );
  expect(touchAction).toBe("none");

  const hb = await handle.boundingBox();
  if (!hb) throw new Error("missing handle box");
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 24, {
    steps: 8,
  });
  await expect(async () => {
    const op = await aRow.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(op)).toBeLessThan(0.9);
  }).toPass({ timeout: 2000 });
  await page.mouse.up();
});
