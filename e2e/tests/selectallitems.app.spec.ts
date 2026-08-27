import { expect, test } from "@playwright/test";
import { openFolder, seedSpanish, signup } from "../fixtures/app.js";

/**
 * Selecting everything, and unselecting it.
 *
 * The bar could count a selection and act on it, but the only way to build one
 * was card by card: twenty links meant twenty clicks, and the way out was the
 * same twenty again or "Cancelar". One control does both directions here,
 * with the half state for "some", because two separate buttons would mean one
 * of them is always the one that does nothing.
 */
test("selección: todo y nada, con el ratón y con Ctrl+A", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "select.everything.e2e@example.com",
    nickname: "selecteverything",
    password: "SelectEverything27",
  });
  const req = page.request;

  const padre = await (
    await req.post("/api/folders", { data: { name: "Padre" } })
  ).json();
  for (const name of ["Hija A", "Hija B"]) {
    await req.post("/api/folders", { data: { name, parentId: padre.id } });
  }
  for (const n of [1, 2, 3]) {
    await req.post("/api/bookmarks", {
      data: {
        url: `https://enpadre.example/${n}`,
        title: `Enlace ${n}`,
        folderId: padre.id,
        fetchSnapshot: false,
      },
    });
  }

  await page.goto("/");
  await openFolder(page, "Padre");

  const cardOf = (text: string) =>
    page.locator("div.group.relative").filter({ hasText: text }).first();
  const bar = page.getByText(/seleccionad/i);

  // Nothing ticked yet, and Ctrl+A still selects the items rather than the
  // page's text. Requiring one tick first put "select everything" behind
  // "select one thing", which is the work the shortcut is meant to save.
  await expect(bar).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByText("5 seleccionados")).toBeVisible();
  await expect(cardOf("Hija A").getByRole("checkbox").first()).toBeChecked();

  // And it is an action too, in the folder's menu, for anyone who does not
  // know the shortcut: the bar it used to live in only exists once there is
  // already a selection.
  await page.getByRole("checkbox", { name: "Deseleccionar todo" }).click();
  await expect(bar).toHaveCount(0);
  await page.getByRole("button", { name: "Más acciones" }).first().click();
  await page.getByRole("button", { name: /Seleccionar todo/ }).click();
  await expect(page.getByText("5 seleccionados")).toBeVisible();
  await page.getByRole("checkbox", { name: "Deseleccionar todo" }).click();

  await cardOf("Enlace 1").getByRole("checkbox").first().check();
  await expect(bar).toBeVisible();

  // Two folders and three bookmarks are on screen, and one of them is chosen.
  await expect(page.getByText("de 5 a la vista")).toBeVisible();
  const todo = page.getByRole("checkbox", { name: "Seleccionar todo (Ctrl+A)" });
  // Half state: it is neither "none" nor "all", and saying either would be a lie.
  expect(await todo.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);

  await todo.click();
  await expect(page.getByText("5 seleccionados")).toBeVisible();
  const ninguno = page.getByRole("checkbox", { name: "Deseleccionar todo" });
  expect(await ninguno.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(
    false,
  );

  // Folders too, not just the links: the bar's actions reach both, so "all"
  // that quietly meant "all the bookmarks" would delete less than it said.
  await expect(cardOf("Hija A").getByRole("checkbox").first()).toBeChecked();
  await expect(cardOf("Hija B").getByRole("checkbox").first()).toBeChecked();

  // And the same control the other way: with everything chosen it unchooses.
  await ninguno.click();
  await expect(bar).toHaveCount(0);
  await expect(cardOf("Hija A").getByRole("checkbox").first()).not.toBeChecked();

  // Ctrl+A also extends a selection that has already been started by hand,
  // with the focus sitting on the card's own checkbox, which is an input.
  await cardOf("Enlace 2").getByRole("checkbox").first().check();
  await expect(bar).toBeVisible();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByText("5 seleccionados")).toBeVisible();
});

test("selección: Ctrl+A dentro de una caja de texto sigue siendo del texto", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "select.textbox.e2e@example.com",
    nickname: "selecttextbox",
    password: "SelectTextbox27x",
  });
  const req = page.request;

  const padre = await (
    await req.post("/api/folders", { data: { name: "Escribir" } })
  ).json();
  await req.post("/api/folders", { data: { name: "Otra", parentId: padre.id } });
  await req.post("/api/bookmarks", {
    data: {
      url: "https://escribir.example/",
      title: "Un enlace",
      folderId: padre.id,
      fetchSnapshot: false,
    },
  });

  await page.goto("/");
  await openFolder(page, "Escribir");
  await page
    .locator("div.group.relative")
    .filter({ hasText: "Un enlace" })
    .first()
    .getByRole("checkbox")
    .first()
    .check();
  await expect(page.getByText("1 seleccionado")).toBeVisible();

  // Renaming something while a selection is open: Ctrl+A there has to select
  // the text being typed, or the field stops being editable in the ordinary
  // way. The count must not move.
  await page.getByRole("button", { name: "Nueva carpeta", exact: true }).click();
  const nombre = page.getByPlaceholder("Nombre", { exact: true });
  await nombre.fill("Escrito a mano");
  await nombre.press("ControlOrMeta+a");
  expect(
    await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      if (!el || typeof el.selectionStart !== "number") return "";
      return el.value.slice(el.selectionStart, el.selectionEnd ?? 0);
    }),
  ).toBe("Escrito a mano");
});
