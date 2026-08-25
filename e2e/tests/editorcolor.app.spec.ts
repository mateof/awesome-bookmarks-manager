import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The text-colour palette is not cut off by the dialog it opens in.
 *
 * Same shape as the select dropdown in a table cell: an absolutely positioned
 * panel inside a container that scrolls, clipped rather than covered, so no
 * `z-index` was ever going to help. Here the container is the description
 * dialog, and what got cut was the right-hand colours and the "clear" button.
 *
 * The assertion is that the **last** control is clickable and does its job. A
 * clipped element still reports a box, so asking whether it is visible answers
 * yes; what fails is putting the pointer on it.
 */
test("la paleta de color del editor se ve entera y se puede usar", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.color.e2e@example.com",
    nickname: "editorcolor",
    password: "EditorColor28xxx",
  });

  const folder = await (
    await page.request.post("/api/folders", {
      data: { name: "Multipaís", description: "<p>Wiki Multipais</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Color del texto" }).click();

  // Outside the dialog by construction, which is what stops the clipping.
  const escaped = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll("body > div")).find(
      (d) =>
        getComputedStyle(d).position === "fixed" &&
        d.querySelectorAll("button").length > 5,
    );
    return !!panel;
  });
  expect(escaped).toBe(true);

  // The control furthest from the anchor, and the one the clipping swallowed.
  const clear = page.getByRole("button", { name: "Quitar color" });
  await expect(clear).toBeVisible();
  await clear.click();
  // It closes after acting, so the palette is not left hanging over the text.
  await expect(clear).toHaveCount(0);

  // And a colour actually applies, so the panel is wired to the editor and not
  // merely rendered somewhere reachable.
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Color del texto" }).click();
  await page.getByRole("button", { name: "#dc2626" }).click();
  await expect(editor.locator("[style*='color']").first()).toBeVisible();

  await ctx.close();
});
