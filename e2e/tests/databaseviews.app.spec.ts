import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The other two views, and the filters and sorting that make a view a view.
 *
 * The property that matters most here: a view never touches the data. Two
 * views over the same rows are the whole point of the component, so a filter
 * that removed rows, or a board that stored its own copy of them, would make
 * the second view a lie. What the board's drag writes is a normal cell value,
 * the same one the table would have written.
 */
const user = {
  email: "db.views.e2e@example.com",
  nickname: "dbviews",
  password: "BoardAndGallery26x",
};

test("tablero, galería, filtros y orden", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Tablero", description: "<p>x</p>" },
    })
  ).json();

  const db = await (
    await req.post("/api/databases", { data: { name: "Tareas" } })
  ).json();
  const titleCol = db.columns[0];
  const statusCol = db.columns[1];
  const [pending, doing, done] = statusCol.config.options;

  // Three rows with known titles and states.
  const rows = db.rows;
  await req.patch(`/api/databases/${db.id}/rows/${rows[0].id}`, {
    data: { cells: { [titleCol.id]: "Zeta", [statusCol.id]: pending.id } },
  });
  await req.patch(`/api/databases/${db.id}/rows/${rows[1].id}`, {
    data: { cells: { [titleCol.id]: "Alfa", [statusCol.id]: doing.id } },
  });
  await req.patch(`/api/databases/${db.id}/rows/${rows[2].id}`, {
    data: { cells: { [titleCol.id]: "Media" } },
  });

  // Put the block in the note by hand: inserting it through the editor is
  // covered elsewhere, and this test is about the views.
  await req.patch(`/api/folders/${folder.id}`, {
    data: {
      description: `<p>x</p><div data-db-id="${db.id}" data-db-name="Tareas"></div>`,
    },
  });

  await page.goto(`/folder/${folder.id}`);
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible();

  // --- Sorting is a property of the view, not of the rows ------------------
  await block.getByRole("button", { name: "Orden" }).click();
  await page.getByRole("button", { name: "Añadir orden" }).click();
  await page.getByLabel("Columna del orden").selectOption({ label: "Título" });
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(async () => {
    const titles = await page
      .getByTestId("db-row")
      .locator('input[aria-label="Título"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(titles).toEqual(["Alfa", "Media", "Zeta"]);
  }).toPass({ timeout: 10_000 });

  // The stored order is untouched: sorting is a way of looking, not a rewrite.
  const afterSort = await (await req.get(`/api/databases/${db.id}`)).json();
  expect(afterSort.rows.map((r: { id: string }) => r.id)).toEqual(
    rows.map((r: { id: string }) => r.id),
  );

  // --- Filtering hides rows without deleting them --------------------------
  await block.getByRole("button", { name: "Filtros" }).click();
  await page.getByRole("button", { name: "Añadir filtro" }).click();
  await page.getByLabel("Columna del filtro").selectOption({ label: "Estado" });
  await page.getByLabel("Operador").selectOption("isNotEmpty");
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByTestId("db-row")).toHaveCount(2);
  const afterFilter = await (await req.get(`/api/databases/${db.id}`)).json();
  expect(afterFilter.rows).toHaveLength(3);

  // --- A board view --------------------------------------------------------
  await block.getByRole("button", { name: "Añadir vista" }).click();
  await page.getByRole("button", { name: "Tablero", exact: true }).click();
  // A board needs to be told what to group by before it can show anything,
  // and says so rather than rendering an empty frame.
  await expect(page.getByText(/columna de selección para agrupar/)).toBeVisible();

  await block.getByRole("button", { name: "Filtros" }).click();
  await page.getByLabel("Agrupar por").selectOption({ label: "Estado" });
  await page.getByRole("button", { name: "Guardar" }).click();

  // One lane per option, plus the one for rows with nothing set.
  await expect(page.getByTestId("db-lane")).toHaveCount(4);
  await expect(page.getByTestId("db-card")).toHaveCount(3);

  // --- A gallery view ------------------------------------------------------
  await block.getByRole("button", { name: "Añadir vista" }).click();
  await page.getByRole("button", { name: "Galería", exact: true }).click();
  await expect(page.getByTestId("db-card")).toHaveCount(3);
  await expect(page.getByTestId("db-lane")).toHaveCount(0);

  // --- The three views coexist ---------------------------------------------
  const withViews = await (await req.get(`/api/databases/${db.id}`)).json();
  expect(withViews.views.map((v: { kind: string }) => v.kind)).toEqual([
    "table",
    "board",
    "gallery",
  ]);
  // And each keeps its own configuration: the table's filter did not leak.
  const table = withViews.views.find((v: { kind: string }) => v.kind === "table");
  const gallery = withViews.views.find(
    (v: { kind: string }) => v.kind === "gallery",
  );
  expect(table.config.filters).toHaveLength(1);
  expect(gallery.config.filters).toHaveLength(0);
  expect(done).toBeTruthy();

  await ctx.close();
});
