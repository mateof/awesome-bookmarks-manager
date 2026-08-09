import { expect, test } from "@playwright/test";
import { createFolder, seedSpanish, shot, signup } from "../fixtures/app.js";

/**
 * Phase D+E: icon library (lucide), default backgrounds, and the siyuan-style
 * banner. Picks a library icon and a default background from the folder edit
 * dialog, then checks the banner renders.
 */
const isaac = {
  email: "isaac.asimov@example.com",
  nickname: "isaac",
  password: "FoundationTrilogy1951",
};

test("apariencia: icono de librería + fondo por defecto + banner", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, isaac);

  await createFolder(page, "Diseño");
  await page.getByText("Diseño", { exact: true }).first().click();
  await page.waitForURL(/\/folder\//);

  // Open the folder edit dialog from the toolbar kebab.
  await page.getByRole("button", { name: "Más acciones" }).first().click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Editar carpeta" }),
  ).toBeVisible();

  // Icon library: open and pick a common glyph.
  await page.getByRole("button", { name: "Biblioteca" }).click();
  await page.getByRole("button", { name: "Star", exact: true }).first().click();

  // Default background: pick the first tile.
  await page.getByRole("button", { name: "Usar este fondo" }).first().click();
  await shot(page, "24-appearance-dialog");

  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Editar carpeta" }),
  ).toBeHidden();

  // The folder now has an icon + background, so the banner renders.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Diseño" })).toBeVisible();
  await shot(page, "23-folder-banner");

  await ctx.close();
});
