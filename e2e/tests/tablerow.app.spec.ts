import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Detail-table view: a folder row's actions used to stack, because the kebab's
 * root is a <div> and that cell had no flex container (the bookmark rows did).
 * The result was a taller row with the 3 dots hanging under the star.
 *
 * Both are right-aligned now, so the kebab sits in the same column on every
 * row whether or not the row also has an "open URL" action.
 */
const user = {
  email: "table.row.actions.e2e@example.com",
  nickname: "tablerowactions",
  password: "ActionsInOneLine26x",
};

test("tabla detalle: las acciones de una carpeta van en línea", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  await req.post("/api/folders", { data: { name: "Cocina" } });
  await req.post("/api/bookmarks", {
    data: { url: "https://x.example/", title: "Un enlace", fetchSnapshot: false },
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Tabla detalle" }).click();
  const folderRow = page.getByRole("row").filter({ hasText: "Cocina" });
  await expect(folderRow).toBeVisible();

  // Same line: the star and the kebab share a vertical centre.
  const star = await folderRow.getByRole("button", { name: /favorit/i }).boundingBox();
  const kebab = await folderRow
    .getByRole("button", { name: "Más acciones" })
    .boundingBox();
  expect(star).not.toBeNull();
  expect(kebab).not.toBeNull();
  const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
  expect(Math.abs(centre(star!) - centre(kebab!))).toBeLessThan(4);
  expect(kebab!.x).toBeGreaterThan(star!.x);

  // Same column as a bookmark's kebab, which has one action more to its left.
  const bookmarkKebab = await page
    .getByRole("row")
    .filter({ hasText: "Un enlace" })
    .getByRole("button", { name: "Más acciones" })
    .boundingBox();
  expect(Math.abs(kebab!.x - bookmarkKebab!.x)).toBeLessThan(2);

  // A bookmark with no snapshot shows a dash, not the raw status "NONE".
  const bookmarkRow = page.getByRole("row").filter({ hasText: "Un enlace" });
  await expect(bookmarkRow).not.toContainText("none", { ignoreCase: true });
});
