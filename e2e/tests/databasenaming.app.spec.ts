import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Four things reported broken about a freshly inserted database, and what each
 * one actually was:
 *
 * - "Only a box saying Sin título, no rows." The description caps itself at
 *   240px with an inner scroll so a wall of prose cannot push a folder's
 *   contents off screen. A grid squeezed into that shows its header and hides
 *   every row, which reads as broken. A note holding a database is no longer
 *   capped; the table brings its own ceiling instead.
 * - "The card in the editor says nothing." It now names the table, counts its
 *   rows and can rename it.
 * - "The database cannot be renamed." There was no UI for it at all.
 * - "A new table has the same name and the same data." Same data is what a
 *   view *is*; the same name was a real bug.
 */
const user = {
  email: "db.naming.e2e@example.com",
  nickname: "dbnaming",
  password: "NamingTables26xx",
};

test("nombre de la base, nombre de la vista y filas visibles", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Naming", description: "<p>x</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await editor.click();
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Base de datos" }).click();
  // The button opens a chooser now: a new table, or one that already exists.
  await page.getByRole("button", { name: "Nueva base de datos" }).click();

  // --- The card in the editor says what it is, and can be renamed ----------
  const card = page.getByTestId("db-editor-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("3 filas");
  await expect(card).toContainText(/se rellena en la ficha/);

  await card.getByRole("button", { name: "Sin título" }).click();
  await card.getByLabel("Cambiar el nombre").fill("Clientes");
  await card.getByLabel("Cambiar el nombre").blur();
  await expect(card).toContainText("Clientes");

  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  // --- Where the note is read, the rows are actually on screen -------------
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible();
  await expect(page.getByTestId("db-row")).toHaveCount(3);

  // The note arrives folded and opens on a click. Both halves matter and they
  // pull in opposite directions: a grid is tall, so a note with one in it used
  // to push the folder's own bookmarks off the screen every time it was
  // opened; but once open it must not be clipped either, because a table
  // squeezed into a 240px scroll box shows its header and hides every row.
  const region = page.getByTestId("collapsible-text");
  const capped = () =>
    region.evaluate((el) => getComputedStyle(el).maxHeight !== "none");
  expect(await capped()).toBe(true);

  await page.getByRole("button", { name: "Desplegar la descripción" }).click();
  await expect(async () => {
    expect(await capped()).toBe(false);
  }).toPass({ timeout: 5000 });
  await expect(page.getByTestId("db-row").last()).toBeInViewport();

  // --- The name is editable here too ---------------------------------------
  await block.getByRole("button", { name: "Clientes" }).click();
  const nameBox = block.getByLabel("Cambiar el nombre");
  await nameBox.fill("Cartera de clientes");
  await nameBox.blur();
  await expect(block.getByRole("button", { name: "Cartera de clientes" })).toBeVisible();

  const dbs = await (await req.get("/api/databases")).json();
  expect(dbs[0].name).toBe("Cartera de clientes");

  // --- A second table view gets its own name -------------------------------
  await block.getByRole("button", { name: "Añadir vista" }).click();
  // Scoped to the menu: its entries share their labels with the view tabs,
  // which is the whole reason the new one has to be numbered.
  await page
    .getByTestId("db-add-view-menu")
    .getByRole("button", { name: "Tabla", exact: true })
    .click();
  await expect(block.getByRole("button", { name: "Tabla 2" })).toBeVisible();
  // And the first one is still there, tellable apart.
  await expect(block.getByRole("button", { name: "Tabla", exact: true })).toHaveCount(1);

  // --- A view can be renamed by clicking the tab it is already on ----------
  await block.getByRole("button", { name: "Tabla 2" }).click();
  const viewBox = block.getByLabel("Cambiar el nombre de la vista");
  await viewBox.fill("Pendientes");
  await viewBox.blur();
  await expect(block.getByRole("button", { name: "Pendientes" })).toBeVisible();

  const detail = await (await req.get(`/api/databases/${dbs[0].id}`)).json();
  expect(detail.views.map((v: { name: string }) => v.name)).toEqual([
    "Tabla",
    "Pendientes",
  ]);

  await ctx.close();
});
