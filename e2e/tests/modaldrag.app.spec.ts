import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Selecting text inside a dialog and releasing the mouse button over the dimmed
 * backdrop must NOT close it (the click bubbles to the backdrop because it is
 * the common ancestor of press and release). A genuine click on the backdrop
 * still dismisses.
 */
const user = {
  email: "modal.drag.e2e@example.com",
  nickname: "modaldraguser",
  password: "BackdropDismiss2024",
};

test("modal: arrastrar desde dentro y soltar fuera no lo cierra", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);

  // Open the "new folder" dialog.
  await page.getByRole("button", { name: "Más acciones" }).first().click();
  await page.getByRole("button", { name: "Carpeta", exact: true }).click();
  const heading = page.getByRole("heading", { name: "Nueva carpeta" });
  await expect(heading).toBeVisible();

  const field = page.getByPlaceholder("Nombre", { exact: true });
  await field.fill("Texto para seleccionar");

  // A point to the left of the centred dialog that is the backdrop itself
  // (the app header sits above the backdrop near the top corners).
  const BACKDROP = { x: 30, y: 400 };

  // Press inside the text field, drag out to the backdrop, release there.
  const box = (await field.boundingBox())!;
  await page.mouse.move(box.x + box.width - 6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 6, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(BACKDROP.x, BACKDROP.y, { steps: 8 });
  await page.mouse.up();

  // The dialog is still open and keeps what was typed.
  await expect(heading).toBeVisible();
  await expect(field).toHaveValue("Texto para seleccionar");

  // A real click on the backdrop still closes it.
  await page.mouse.click(BACKDROP.x, BACKDROP.y);
  await expect(heading).toBeHidden();
});
