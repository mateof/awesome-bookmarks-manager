import { expect, test, type Page } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Living with a table that is wider and taller than the space it is in.
 *
 * Three separate answers to the same complaint, and they are separate on
 * purpose: fold the note so a table stops owning the top of the folder, read
 * one long value without widening its column, and open one row as a form when
 * the grid is the wrong shape for it.
 */
const LONG =
  "Este valor es deliberadamente larguísimo para que no quepa en su columna " +
  "y haya que enseñarlo de otra manera, porque ensanchar la columna por una " +
  "celda estropea la tabla entera para todas las demás filas.";

async function tableInNote(page: Page) {
  const folder = await (
    await page.request.post("/api/folders", { data: { name: "Inventario" } })
  ).json();
  const db = await (
    await page.request.post("/api/databases", { data: { name: "Equipos" } })
  ).json();
  await page.request.patch(`/api/folders/${folder.id}`, {
    data: {
      description:
        `<p>Equipos de la oficina</p><div data-db-id="${db.id}" ` +
        `data-db-name="Equipos" data-db-block="${crypto.randomUUID()}" ` +
        `class="ab-db-block">Equipos</div>`,
    },
  });
  return { folder, db };
}

test("una nota con tabla llega replegada y se despliega a mano", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.fold.e2e@example.com",
    nickname: "dbfold",
    password: "DbFold28xxxxxxxx",
  });

  const { folder } = await tableInNote(page);
  await page.goto(`/folder/${folder.id}`);

  const text = page.getByTestId("collapsible-text");
  await expect(text).toBeVisible({ timeout: 20_000 });

  // Folded: a grid is tall, so a note with one in it used to push the folder's
  // own bookmarks off the screen every single time it was opened.
  const foldedHeight = (await text.boundingBox())!.height;
  expect(foldedHeight).toBeLessThanOrEqual(260);

  await page.getByRole("button", { name: "Desplegar la descripción" }).click();
  await expect(
    page.getByRole("button", { name: "Replegar la descripción" }),
  ).toBeVisible();

  // Open it is uncapped, because a table squeezed into a scrolling strip shows
  // its header and hides its rows, which is worse than not showing it at all.
  await expect(async () => {
    const open = (await text.boundingBox())!.height;
    expect(open).toBeGreaterThan(foldedHeight);
  }).toPass({ timeout: 5000 });

  // And back.
  await page.getByRole("button", { name: "Replegar la descripción" }).click();
  await expect(
    page.getByRole("button", { name: "Desplegar la descripción" }),
  ).toBeVisible();

  await ctx.close();
});

test("celda larga con tooltip, fila completa en un diálogo y columnas que se estiran", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.rowview.e2e@example.com",
    nickname: "dbrowview",
    password: "DbRowView28xxxxx",
  });
  const req = page.request;

  const { folder, db } = await tableInNote(page);
  const full = await (await req.get(`/api/databases/${db.id}`)).json();
  const title = full.columns.find((c: { kind: string }) => c.kind === "text");
  const estado = full.columns.find((c: { kind: string }) => c.kind === "select");
  await req.patch(`/api/databases/${db.id}/rows/${full.rows[0].id}`, {
    data: {
      cells: { [title.id]: LONG, [estado.id]: estado.config.options[0].id },
    },
  });

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Desplegar la descripción" }).click();
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible({ timeout: 20_000 });

  // --- The tooltip ----------------------------------------------------------
  const cell = block.getByLabel("Título", { exact: true }).first();
  await cell.hover();
  const tip = page.getByTestId("cell-tooltip");
  await expect(tip).toBeVisible({ timeout: 5000 });
  await expect(tip).toContainText("ensanchar la columna");
  // It goes away with the pointer, rather than sitting over the next row.
  await page.getByRole("heading", { name: "Inventario" }).first().hover();
  await expect(tip).toHaveCount(0);

  // --- The row as a form ----------------------------------------------------
  await block.getByRole("button", { name: "Ver la fila completa" }).first().click();
  // Titled by the row itself, not by the word "row": which row you are looking
  // at is the first thing the dialog has to answer.
  const dialogTitle = page.getByRole("heading", { name: /Este valor es/ });
  await expect(dialogTitle).toBeVisible();
  // Every column, labelled, including the ones the grid had scrolled away.
  await expect(page.getByText("Estado", { exact: true }).last()).toBeVisible();
  // And it edits the same cells: the dialog is a shape, not a second editor.
  const inDialog = page.getByLabel("Título", { exact: true }).last();
  await inDialog.fill("Portátil de guardia");
  await inDialog.blur();
  await expect(async () => {
    const after = await (await req.get(`/api/databases/${db.id}`)).json();
    expect(after.rows[0].cells[title.id]).toBe("Portátil de guardia");
  }).toPass({ timeout: 10_000 });
  await page.getByRole("button", { name: "Cerrar" }).first().click();

  // --- The width of a column ------------------------------------------------
  const header = block.locator("thead th").nth(1);
  const before = (await header.boundingBox())!;
  const handle = header.locator("span[title='Arrastrar para cambiar el ancho']");
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(before.x + before.width + 120, before.y + 10, {
    steps: 8,
  });
  await page.mouse.up();

  // Written once, on release: saving per pixel would be a request per frame.
  await expect(async () => {
    const after = await (await req.get(`/api/databases/${db.id}`)).json();
    const col = after.columns.find((c: { id: string }) => c.id === title.id);
    expect(col.config.width).toBeGreaterThan(before.width);
  }).toPass({ timeout: 10_000 });

  await ctx.close();
});
