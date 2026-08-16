import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The appearance controls offer background colour OR image, never both at
 * once, matching what the API enforces. The icon picker previews the same
 * letter tile the cards show when there is no icon yet.
 */
const user = {
  email: "bg.mode.e2e@example.com",
  nickname: "bgmodeuser",
  password: "OneOrTheOther24xx",
};

test("editar bookmark: fondo color o imagen, e inicial en el icono", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);

  const bm = await (
    await page.request.post("/api/bookmarks", {
      data: { url: "https://app.clockify.me/tracker", title: "Clockify", fetchSnapshot: false },
    })
  ).json();

  await page.goto(`/bookmark/${bm.id}`);
  await page.getByRole("button", { name: "Editar" }).first().click();
  await expect(page.getByRole("heading", { name: "Editar bookmark" })).toBeVisible();

  // No icon yet: the picker itself shows the initial, not a blank placeholder.
  const iconPickerButton = page.locator("button.h-12.w-12").first();
  await expect(iconPickerButton).toHaveText("C");

  // The three modes are exclusive: only the chosen section is shown.
  await expect(page.getByRole("button", { name: "Sin fondo" })).toBeVisible();
  await expect(page.getByText("Opacidad")).toHaveCount(0);

  await page.getByRole("button", { name: "Color", exact: true }).click();
  await expect(page.getByText("Opacidad")).toBeVisible();
  await expect(page.getByText("Imagen de fondo")).toHaveCount(0);

  await page.getByRole("button", { name: "Imagen", exact: true }).click();
  await expect(page.getByText("Opacidad")).toHaveCount(0);
});
