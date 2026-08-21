import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The editor toolbar on a phone.
 *
 * On a narrow screen the ordinary toolbar scrolls out of reach the moment the
 * keyboard opens, so a separate bar is pinned to the viewport and pushed up by
 * the keyboard's height, with the rest of the actions behind a "+".
 *
 * A headless browser has no software keyboard, so what is testable here is the
 * part that does not depend on one: the bar appears on a narrow screen when
 * the editor takes focus, the "+" reveals the action grid, and the actions in
 * it actually reach the document. The keyboard offset itself comes from
 * `visualViewport`, which stays at zero without a real keyboard.
 */
test.use({ viewport: { width: 390, height: 780 } });

test("en pantalla estrecha la barra del editor sale sobre el teclado", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "mobile.bar.e2e@example.com",
    nickname: "mobilebar",
    password: "MobileToolbar26x",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "En el móvil", description: "<p>hola</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();

  const bar = page.getByTestId("editor-mobile-bar");
  // Not there until the text has focus: it exists to sit on a keyboard.
  await expect(bar).toHaveCount(0);

  const editor = page.locator(".tiptap.ProseMirror");
  await editor.click();
  await expect(editor).toBeFocused();
  await expect(bar).toBeVisible();

  // It is pinned to the viewport rather than flowing with the dialog.
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");

  // The "+" opens the grid of everything that does not fit on one row.
  await expect(bar.getByRole("button", { name: "Título grande" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Más acciones" }).click();
  const heading = bar.getByRole("button", { name: "Título grande" });
  await expect(heading).toBeVisible();

  // And an action from the grid reaches the document, with the text still
  // focused afterwards — losing focus would dismiss the keyboard and drop the
  // bar to the bottom of the screen mid-tap.
  await page.keyboard.press("ControlOrMeta+a");
  await heading.click();
  await expect(editor.locator("h1")).toBeVisible();
  await expect(editor).toBeFocused();

  // Reference insertion is reachable from the grid too, not only by typing
  // "@", which is the whole point on a phone keyboard.
  await bar.getByRole("button", { name: /Referencia a carpeta o bookmark/ }).click();
  await expect(
    page.getByRole("heading", { name: "Referenciar una carpeta o un bookmark" }),
  ).toBeVisible();

  await ctx.close();
});
