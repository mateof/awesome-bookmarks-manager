import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The Cmd/Ctrl+K palette does three jobs now: run actions, find things by
 * title, and find things by text the client never loaded (descriptions and, on
 * a real instance, the text of saved snapshots via the FTS index).
 */
const user = {
  email: "command.palette.e2e@example.com",
  nickname: "paletteuser",
  password: "CommandPalette26x",
};

test("la paleta ejecuta acciones y encuentra por contenido", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  // The distinctive word lives only in the description: a title/URL match
  // cannot find this, so it exercises the server-side search path.
  await req.post("/api/bookmarks", {
    data: {
      url: "https://revista.example/numero-7",
      title: "Revista mensual",
      description: "Un reportaje largo sobre fermentacion casera.",
      fetchSnapshot: false,
    },
  });
  await req.post("/api/bookmarks", {
    data: {
      url: "https://otracosa.example/",
      title: "Otra cosa",
      fetchSnapshot: false,
    },
  });

  await page.goto("/");
  // Wait for the shell before typing: the Cmd/Ctrl+K listener is registered in
  // an effect, so a keypress fired mid-hydration would land nowhere.
  await expect(
    page.getByRole("button", { name: "Nuevo bookmark", exact: true }),
  ).toBeVisible();

  const spotlight = page.getByTestId("spotlight");
  const palette = spotlight.getByPlaceholder("Buscar carpetas y bookmarks…");
  const openPalette = async () => {
    await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible();
  };

  await openPalette();

  // With an empty box the palette is a launcher.
  await expect(spotlight.getByText("Acciones")).toBeVisible();
  await expect(
    spotlight.getByRole("button", { name: /Nuevo bookmark/ }),
  ).toBeVisible();

  // Typing filters the actions too, by label and by keywords.
  await palette.fill("papelera");
  await spotlight.getByRole("button", { name: /Papelera/ }).click();
  await expect(page).toHaveURL(/\/trash$/);
  await expect(page.getByRole("heading", { name: "Papelera" })).toBeVisible();

  // "Nueva carpeta" opens the dialog on the folder page even when the palette
  // was invoked from somewhere else — it navigates home first.
  await openPalette();
  await palette.fill("nueva carpeta");
  await spotlight.getByRole("button", { name: /Nueva carpeta/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Nueva carpeta" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar" }).first().click();

  // Content search: "fermentacion" appears in no title or URL.
  await openPalette();
  await palette.fill("fermentacion");
  await expect(
    spotlight.getByRole("button", { name: /Revista mensual/ }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(spotlight.getByRole("button", { name: /Otra cosa/ })).toHaveCount(0);

  // And plain title search still works, instantly and locally.
  await palette.fill("Otra");
  await expect(spotlight.getByRole("button", { name: /Otra cosa/ })).toBeVisible();
});
