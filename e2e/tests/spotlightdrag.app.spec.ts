import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/** Dragging from inside the search box and releasing outside must not close it. */
const user = {
  email: "spotlight.drag.e2e@example.com",
  nickname: "spotdraguser",
  password: "SearchStaysOpen24",
};

test("buscador: arrastrar dentro y soltar fuera no lo cierra", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);

  await page.keyboard.press("Meta+k");
  const input = page.getByPlaceholder(/Buscar carpetas y bookmarks/);
  await expect(input).toBeVisible();
  await input.fill("texto de prueba");

  const box = (await input.boundingBox())!;
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(30, 620, { steps: 8 }); // release over the backdrop
  await page.mouse.up();

  await expect(input).toBeVisible();
  await expect(input).toHaveValue("texto de prueba");
});
