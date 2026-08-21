import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The database as it is actually used: inserted from the editor, then edited
 * where the note is read.
 *
 * The split is the thing to pin down. A description is edited in a dialog and
 * read on the entity's page, so the block is a placeholder in the editor and
 * the live grid renders in the view. Both halves have to survive a round trip
 * through the server's sanitiser, which strips unknown data attributes and
 * would quietly turn the block into an empty div.
 */
const user = {
  email: "db.ui.e2e@example.com",
  nickname: "dbui",
  password: "TablesInNotes26xx",
};

test("insertar una base de datos en una nota y editarla donde se lee", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Proyecto", description: "<p>Seguimiento</p>" },
    })
  ).json();

  // --- Insert from the editor ----------------------------------------------
  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await editor.click();
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Base de datos" }).click();

  // In the editor it is a placeholder card, not the grid.
  await expect(editor.locator(".ab-db-block")).toBeVisible();
  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  // The block survived the sanitiser with its id intact.
  let dbId = "";
  await expect(async () => {
    const after = await (await req.get(`/api/folders/${folder.id}`)).json();
    const m = /data-db-id="([0-9a-f-]{36})"/.exec(after.description ?? "");
    expect(m).toBeTruthy();
    dbId = m![1]!;
  }).toPass({ timeout: 10_000 });

  // --- And where the note is read, it is the real thing --------------------
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible();
  // Seeded so it is usable straight away.
  await expect(block.getByRole("button", { name: "Tabla" })).toBeVisible();
  await expect(block.getByTestId("db-row")).toHaveCount(3);

  // --- Type into a cell ----------------------------------------------------
  // Exact: the column's settings button is labelled "Ajustes de la columna:
  // Título", and getByLabel matches substrings.
  const firstTitle = block.getByLabel("Título", { exact: true }).first();
  await firstTitle.fill("Contratar proveedor");
  // Text commits on blur, not per keystroke: one sealed write per row.
  await firstTitle.blur();
  await expect(async () => {
    const db = await (await req.get(`/api/databases/${dbId}`)).json();
    const titleCol = db.columns.find((c: { kind: string }) => c.kind === "text");
    expect(
      db.rows.some(
        (r: { cells: Record<string, unknown> }) =>
          r.cells[titleCol.id] === "Contratar proveedor",
      ),
    ).toBe(true);
  }).toPass({ timeout: 10_000 });

  // It is still there after a reload, which is the only proof that matters.
  await page.reload();
  await expect(
    page.getByTestId("db-block").getByLabel("Título", { exact: true }).first(),
  ).toHaveValue("Contratar proveedor");

  // --- A select cell -------------------------------------------------------
  const statusCell = page.getByTestId("db-row").first().locator("td").nth(2);
  await statusCell.getByRole("button").first().click();
  await page.getByRole("button", { name: "En curso" }).click();
  await expect(statusCell.getByText("En curso")).toBeVisible();

  // --- Adding a row and a column ------------------------------------------
  await page.getByRole("button", { name: "Nueva fila" }).click();
  await expect(page.getByTestId("db-row")).toHaveCount(4);

  await page.getByRole("button", { name: "Añadir columna", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Coste");
  await page.getByLabel("Tipo", { exact: true }).selectOption("number");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("columnheader", { name: /Coste/ })).toBeVisible();

  // --- Deleting the column takes its values with it ------------------------
  await page.getByLabel("Ajustes de la columna: Coste").click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("columnheader", { name: /Coste/ })).toHaveCount(0);

  await ctx.close();
});
