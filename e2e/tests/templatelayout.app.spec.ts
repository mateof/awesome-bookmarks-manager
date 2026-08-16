import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The template editor exposes a native colour picker beside every theme colour,
 * and layout knobs (section order, visibility toggles) that the live preview
 * reflects immediately.
 */
const user = {
  email: "template.layout.e2e@example.com",
  nickname: "tplayoutuser",
  password: "LayoutKnobs2024xx",
};

test("editor de plantilla: selector de color y ajustes de layout", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);

  await page.goto("/panels");
  await page.getByRole("button", { name: "Plantillas" }).click();
  await page.getByRole("button", { name: "Nueva", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Editor de plantilla" })).toBeVisible();

  // Every theme colour has a native colour picker seeded with its value.
  const pickers = page.locator('input[type="color"]');
  await expect(pickers).toHaveCount(6);
  await expect(pickers.first()).toHaveValue("#0f172a"); // bg from the base theme

  // Setting a colour through the picker updates the text field beside it.
  const bgField = page.locator('label:has(input[type="color"])').first();
  await pickers.first().evaluate((el) => {
    const input = el as HTMLInputElement;
    // React tracks the value via a property setter, so assigning `.value`
    // directly is ignored; go through the native setter it patches.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "#123456");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(bgField.locator("input").last()).toHaveValue("#123456");

  // The desktop preview starts with "Carpetas" before "Enlaces".
  const desktop = page.getByTestId("template-preview").first();
  const sectionTitles = desktop.getByText(/^(Carpetas|Enlaces)$/);
  await expect(sectionTitles.first()).toHaveText("Carpetas");

  // Flipping the order puts links first.
  await page.getByLabel("Orden de secciones").selectOption("links");
  await expect(sectionTitles.first()).toHaveText("Enlaces");

  // Hiding the search box removes it from both frames (desktop + mobile).
  await expect(page.getByText("Buscar en el panel…")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Buscador" }).uncheck();
  await expect(page.getByText("Buscar en el panel…")).toHaveCount(0);

  // Hiding the section titles removes them from the preview too.
  await page.getByRole("checkbox", { name: "Títulos de sección" }).uncheck();
  await expect(sectionTitles).toHaveCount(0);
});
