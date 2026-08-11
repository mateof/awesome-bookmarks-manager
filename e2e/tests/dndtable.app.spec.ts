import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Regression: in the "Tabla detalle" (table) view, rows were not sortable at
 * all (no dnd handle, no SortableContext), so bookmarks couldn't be reordered.
 * Each row now has a drag handle that reorders like the other views.
 */
const user = {
  email: "sophie.wilson@example.com",
  nickname: "sophiew",
  password: "AcornARMDesign1985",
};

test("modo tabla: reordenar bookmarks arrastrando el tirador", async ({
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
  const bRow = page.locator("tr", { hasText: "BBBrow" });
  await expect(aRow).toBeVisible();
  await expect(bRow).toBeVisible();

  // Sanity: initial order is A, then B.
  const initial = await (await req.get("/api/bookmarks")).json();
  expect(initial[0].title).toBe("AAArow");

  const handle = aRow.getByLabel("Arrastrar para reordenar");
  const hb = await handle.boundingBox();
  const bb = await bRow.boundingBox();
  if (!hb || !bb) throw new Error("missing bounding boxes");

  // Drag A's handle down onto B.
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 6);
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, {
    steps: 12,
  });
  await page.mouse.up();

  // The reorder persists: BBBrow now precedes AAArow.
  await expect(async () => {
    const bms = await (await req.get("/api/bookmarks")).json();
    expect(bms[0].title).toBe("BBBrow");
  }).toPass({ timeout: 8000 });
});
