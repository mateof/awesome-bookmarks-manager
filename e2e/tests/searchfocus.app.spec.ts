import { type Browser, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

async function newUser(browser: Browser) {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "searchfocus.e2e@example.com",
    nickname: "searchfocus",
    password: "SearchFocus28xxxx",
  });
  return { ctx, page, req: page.request };
}

test("la paleta abre con el cursor puesto, busca carpetas y deja abrir la web o el detalle", async ({
  browser,
}) => {
  const { ctx, page, req } = await newUser(browser);
  const tag = await (await req.post("/api/tags", { data: { name: "trámite", color: "#16a34a" } })).json();
  const folder = await (
    await req.post("/api/folders", {
      data: {
        name: "Gestiones públicas",
        parentId: null,
        description: "<p>Papeles de la <strong>Seguridad Social</strong></p>",
        tagIds: [tag.id],
      },
    })
  ).json();
  const bm = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://example.com/cita",
        title: "Cita previa",
        folderId: folder.id,
        tagIds: [tag.id],
        fetchSnapshot: false,
      },
    })
  ).json();

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Nuevo bookmark", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("spotlight");
  const box = palette.getByPlaceholder("Buscar carpetas y bookmarks…");
  await expect(box, "the cursor is already in the search box").toBeFocused();

  await page.keyboard.type("gestiones publicas");
  await expect(
    palette.getByRole("button", { name: /Gestiones públicas/ }),
    "folders are found, accents or not",
  ).toBeVisible();
  await box.fill("seguridad social");
  await expect(
    palette.getByRole("button", { name: /Gestiones públicas/ }),
    "a folder is also found by its description",
  ).toBeVisible();

  await box.fill("cita previa");
  const row = palette.getByRole("button", { name: /^Cita previa/ }).first();
  await expect(row).toBeVisible();
  await expect(palette).toContainText("Mayús+Enter abre el detalle");
  const [site] = await Promise.all([ctx.waitForEvent("page"), page.keyboard.press("Enter")]);
  await site.close();

  await page.keyboard.press("Control+k");
  await page.keyboard.type("cita previa");
  await expect(palette.getByRole("button", { name: /^Cita previa/ }).first()).toBeVisible();
  await page.keyboard.press("Shift+Enter");
  await expect(page).toHaveURL(new RegExp(`/bookmark/${bm.id}$`));

  await page.keyboard.press("Control+k");
  await page.keyboard.type("cita previa");
  await palette.getByRole("button", { name: "Ver el detalle del bookmark" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/bookmark/${bm.id}$`));
  await expect(palette).toHaveCount(0);

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Filtrar por tags" }).click();
  await expect(
    page.getByTestId("folder-tag-filter").getByRole("textbox"),
    "opening the tag filter puts the cursor in its box",
  ).toBeFocused();

  await page.goto(`/folder/${folder.id}?tags=${tag.id}`);
  await expect(page.getByTestId("folder-tag-filter")).toBeVisible();
  await expect(
    page.getByTestId("folder-tag-filter").getByRole("textbox"),
    "a filter that comes in the address does not grab the cursor",
  ).not.toBeFocused();
  await ctx.close();
});
