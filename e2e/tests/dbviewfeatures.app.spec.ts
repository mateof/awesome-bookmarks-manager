import { expect, test, type Page } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The parts of a table that are about looking at it rather than storing it:
 * a footer that adds a column up, a row height, a first column that stays put,
 * duplicating and deleting in bulk, a month view, and the shape a new table
 * starts in.
 *
 * They share one design decision worth pinning: **all of it lives on the
 * view**, not in this browser's storage. A view is supposed to look the same
 * wherever it is opened, including for whoever the table was shared with, and
 * a "row height" that only exists on the machine that set it is a setting that
 * quietly disagrees with itself across two tabs.
 */
async function tableInNote(page: Page, template = "basic") {
  const folder = await (
    await page.request.post("/api/folders", { data: { name: "Trabajo" } })
  ).json();
  const db = await (
    await page.request.post("/api/databases", {
      data: { name: "Cosas", template },
    })
  ).json();
  await page.request.patch(`/api/folders/${folder.id}`, {
    data: {
      description:
        `<p>Cosas</p><div data-db-id="${db.id}" data-db-name="Cosas" ` +
        `data-db-block="${crypto.randomUUID()}" class="ab-db-block">Cosas</div>`,
    },
  });
  return { folder, db };
}

test("plantillas: una tabla nueva empieza con las columnas del oficio", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.templates.e2e@example.com",
    nickname: "dbtemplates",
    password: "DbTemplate28xxxx",
  });
  const req = page.request;

  const credentials = await (
    await req.post("/api/databases", {
      data: { name: "Accesos", template: "credentials" },
    })
  ).json();
  // The point of this one: the column that holds a secret is a password
  // column from the start, instead of free text somebody has to remember to
  // change afterwards.
  const kinds = credentials.columns.map((c: { kind: string }) => c.kind);
  expect(kinds).toContain("password");
  expect(kinds).toContain("url");

  const inventory = await (
    await req.post("/api/databases", {
      data: { name: "Trastero", template: "inventory" },
    })
  ).json();
  const quantity = inventory.columns.find(
    (c: { name: string }) => c.name === "Cantidad",
  );
  // A quantity as a number column is what makes the footer able to add it up
  // and the filter able to compare it. As text it would sort "10" before "9".
  expect(quantity.kind).toBe("number");

  // And the old behaviour is still what you get by asking for nothing.
  const basic = await (
    await req.post("/api/databases", { data: { name: "Suelta" } })
  ).json();
  expect(basic.columns.map((c: { name: string }) => c.name)).toEqual([
    "Título",
    "Estado",
  ]);

  await ctx.close();
});

test("resumen de columna, alto de fila, duplicar y borrar en lote", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.viewfeat.e2e@example.com",
    nickname: "dbviewfeat",
    password: "DbViewFeat28xxxx",
  });
  const req = page.request;

  const { folder, db } = await tableInNote(page, "inventory");
  const full = await (await req.get(`/api/databases/${db.id}`)).json();
  const cantidad = full.columns.find(
    (c: { name: string }) => c.name === "Cantidad",
  );
  const articulo = full.columns.find(
    (c: { name: string }) => c.name === "Artículo",
  );
  const amounts = [4, 6, 11];
  for (const [i, row] of full.rows.entries()) {
    await req.patch(`/api/databases/${db.id}/rows/${row.id}`, {
      data: {
        cells: { [articulo.id]: `Caja ${i + 1}`, [cantidad.id]: amounts[i] },
      },
    });
  }

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Desplegar la descripción" }).click();
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible({ timeout: 20_000 });

  // --- The footer -----------------------------------------------------------
  await block
    .getByRole("button", { name: "Ajustes de la columna: Cantidad" })
    .click();
  await page.getByLabel("Resumen").selectOption("sum");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  // 4 + 6 + 11, and empty cells are left out rather than counted as zero.
  await expect(block.locator("tfoot")).toContainText("21", { timeout: 10_000 });

  // --- Duplicate and bulk delete -------------------------------------------
  const rowsBefore = block.getByTestId("db-row");
  await expect(rowsBefore).toHaveCount(3);
  await block.getByRole("button", { name: "Duplicar la fila" }).first().click();
  await expect(block.getByTestId("db-row")).toHaveCount(4, { timeout: 10_000 });

  // The bar only exists while something is selected: a permanent toolbar for
  // an action that needs a selection is a row of dead buttons.
  await expect(page.getByTestId("db-bulk-bar")).toHaveCount(0);
  await block.getByRole("checkbox", { name: "Seleccionar la fila" }).first().check();
  await block.getByRole("checkbox", { name: "Seleccionar la fila" }).nth(1).check();
  const bar = page.getByTestId("db-bulk-bar");
  await expect(bar).toContainText("2");
  await bar.getByRole("button", { name: "Borrar las seleccionadas" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(block.getByTestId("db-row")).toHaveCount(2, { timeout: 10_000 });

  // --- Row height and frozen column, both saved on the view ----------------
  // The view's settings dialog is what the filter icon opens; presentation
  // lives in the same place as filters and sorting because it is the same
  // question: how this view shows the rows.
  await block.getByRole("button", { name: "Filtros" }).click();
  await page.getByLabel("Alto de fila").selectOption("tall");
  await page.getByRole("checkbox", { name: "Fijar la primera columna" }).check();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  await expect(async () => {
    const after = await (await req.get(`/api/databases/${db.id}`)).json();
    expect(after.views[0].config.rowHeight).toBe("tall");
    expect(after.views[0].config.frozenFirstColumn).toBe(true);
    expect(after.views[0].config.aggregates[cantidad.id]).toBe("sum");
  }).toPass({ timeout: 10_000 });

  // A reload proves it travelled with the view rather than living in this tab.
  // 17 rather than 21 now: the two rows deleted above took a 4 with them, and
  // the footer follows what the view actually holds.
  await page.reload();
  await page.getByRole("button", { name: "Desplegar la descripción" }).click();
  await expect(block.locator("tfoot")).toContainText("17", { timeout: 20_000 });
  const firstCell = block.locator("tbody tr:first-child td").nth(1);
  expect(
    await firstCell.evaluate((el) => getComputedStyle(el).position),
  ).toBe("sticky");

  await ctx.close();
});

test("vista calendario: las filas caen en su día", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.calendar.e2e@example.com",
    nickname: "dbcalendar",
    password: "DbCalendar28xxxx",
  });
  const req = page.request;

  const { folder, db } = await tableInNote(page, "tasks");
  const full = await (await req.get(`/api/databases/${db.id}`)).json();
  const tarea = full.columns.find((c: { name: string }) => c.name === "Tarea");
  const fecha = full.columns.find((c: { name: string }) => c.name === "Para el");

  // A day in the month being shown, built as a plain string. The calendar
  // groups on the string on purpose: turning "2026-03-01" into a Date and back
  // is how a task lands on the last day of the previous month for anyone west
  // of Greenwich.
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
  await req.patch(`/api/databases/${db.id}/rows/${full.rows[0].id}`, {
    data: { cells: { [tarea.id]: "Revisar backups", [fecha.id]: day } },
  });

  const view = await (
    await req.post(`/api/databases/${db.id}/views`, {
      data: { kind: "calendar", name: "Calendario" },
    })
  ).json();
  await req.patch(`/api/databases/${db.id}/views/${view.id}`, {
    data: { config: { dateColumnId: fecha.id, titleColumnId: tarea.id } },
  });

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Desplegar la descripción" }).click();
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible({ timeout: 20_000 });
  await block.getByRole("button", { name: "Calendario" }).click();

  const calendar = page.getByTestId("db-calendar");
  await expect(calendar).toBeVisible({ timeout: 10_000 });
  await expect(calendar.getByRole("button", { name: /Revisar backups/ })).toBeVisible();
  // The rows with no date are counted rather than silently dropped, which
  // would read as data loss.
  await expect(calendar).toContainText("2 fila");

  // And a card opens the same row dialog the grid does.
  await calendar.getByRole("button", { name: /Revisar backups/ }).click();
  await expect(
    page.getByRole("heading", { name: "Revisar backups" }),
  ).toBeVisible();

  await ctx.close();
});
