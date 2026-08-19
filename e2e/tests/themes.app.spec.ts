import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Application themes.
 *
 * The whole point of the design is that no component knows a theme exists: the
 * interface is written against Tailwind's slate/white/blue, those resolve to
 * CSS variables, and a theme is a set of values. So the thing worth asserting
 * is that picking one actually changes the pixels the browser computes, and
 * that it survives a reload (the palette is cached as CSS for the first paint).
 */
const user = {
  email: "app.themes.e2e@example.com",
  nickname: "appthemes",
  password: "TenThemesToPick26x",
};

const bodyBg = () =>
  getComputedStyle(document.body).backgroundColor;

test("temas: cambiar de tema repinta la aplicación y sobrevive a recargar", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);

  await page.goto("/settings/appearance");
  await expect(
    page.getByRole("heading", { name: "Tema de la aplicación" }),
  ).toBeVisible();

  const before = await page.evaluate(bodyBg);

  // Sepia is a warm paper theme: the page background has to move.
  await page.getByRole("button", { name: /Sepia/ }).click();
  const after = await page.evaluate(bodyBg);
  expect(after).not.toBe(before);

  // And it is the theme's own colour, not just "something else": the default
  // page background is Tailwind slate-50, Sepia's is warm.
  const rgb = /rgb\((\d+), (\d+), (\d+)\)/.exec(after)!;
  const [r, , b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  expect(r).toBeGreaterThan(b); // warm: more red than blue

  // A reload keeps it, and keeps it from the first paint (the palette is
  // cached as CSS by the boot script, not applied later by React).
  await page.reload();
  expect(await page.evaluate(bodyBg)).toBe(after);
  await expect(page.getByRole("button", { name: /Sepia/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Back to the default.
  await page.getByRole("button", { name: /Pizarra/ }).click();
  expect(await page.evaluate(bodyBg)).toBe(before);
});

test("temas: importar uno propio, y un archivo inválido no lo rompe", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "app.themes.import.e2e@example.com",
    nickname: "appthemesimport",
    password: "ImportedPalette26xx",
  });

  await page.goto("/settings/appearance");

  const ramp = (hex: string) =>
    Object.fromEntries(
      [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, hex]),
    );
  const theme = {
    id: "e2e-lima",
    name: "Lima E2E",
    white: "#f0fff0",
    neutral: { ...ramp("#204020"), 50: "#e8ffe8", 900: "#0a1f0a" },
    accent: ramp("#00ff00"),
  };

  await page.getByRole("button", { name: "Importar tema…" }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "lima.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(theme)),
  });

  // Imported themes are selected straight away, so the page repaints.
  await expect(page.getByRole("button", { name: /Lima E2E/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe("rgb(232, 255, 232)");

  // Something that is not a theme is refused, and leaves the current one alone.
  await page.setInputFiles('input[type="file"]', {
    name: "nope.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ hello: "world" })),
  });
  await expect(page.getByText(/no tiene el formato de un tema/)).toBeVisible();
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(232, 255, 232)");

  // Removing it falls back to the default.
  await page
    .getByRole("button", { name: /Lima E2E/ })
    .getByRole("button", { name: "Quitar este tema" })
    .click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("button", { name: /Lima E2E/ })).toHaveCount(0);
});

test("el footer muestra la versión de la aplicación", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "app.version.e2e@example.com",
    nickname: "appversion",
    password: "VersionInFooter26x",
  });
  await page.goto("/");
  const badge = page.getByTitle("Versión de la aplicación");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(/^v\d+\.\d+\.\d+$/);
});
