import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * How a table behaves *inside a note*, as opposed to what it stores.
 *
 * The same table can be the point of one note and a footnote in another, so
 * these settings hang off the **embed** and not off the database: a height,
 * whether it renders as a grid at all, and a filter you type for one visit
 * without saving anything.
 *
 * And a note can now point *into* a table: `@` reaches rows, not only folders
 * and bookmarks, so the row where a thing was written down is linkable from
 * the note where it was decided.
 */
test("altura, tarjeta resumen y filtro rápido del embebido", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.embeds.e2e@example.com",
    nickname: "dbembeds",
    password: "DbEmbeds28xxxxxx",
  });
  const req = page.request;

  const db = await (
    await req.post("/api/databases", { data: { name: "Equipos" } })
  ).json();
  const title = db.columns.find((c: { kind: string }) => c.kind === "text");
  const names = ["nas-casa", "router-oficina", "portátil"];
  for (const [i, row] of db.rows.entries()) {
    await req.patch(`/api/databases/${db.id}/rows/${row.id}`, {
      data: { cells: { [title.id]: names[i] } },
    });
  }

  const block = (extra: string) =>
    `<div data-db-id="${db.id}" data-db-name="Equipos" ` +
    `data-db-block="${crypto.randomUUID()}" ${extra} class="ab-db-block">Equipos</div>`;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Infra" } })
  ).json();
  await req.patch(`/api/folders/${folder.id}`, {
    data: {
      description: `<p>Uno</p>${block('data-db-height="240"')}<p>Dos</p>${block(
        'data-db-mode="summary"',
      )}`,
    },
  });

  // Both attributes have to survive the server's sanitiser, which strips
  // anything it has not been told about. This is the half that fails silently.
  const saved = await (await req.get(`/api/folders/${folder.id}`)).json();
  expect(saved.description).toContain('data-db-height="240"');
  expect(saved.description).toContain('data-db-mode="summary"');

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Desplegar la descripción" }).click();

  // The first embed is a grid, capped.
  const grid = page.getByTestId("db-block").first();
  await expect(grid).toBeVisible({ timeout: 20_000 });
  const box = await grid.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(260);

  // The second is a card that says how much is in there and opens on click.
  const card = page.getByTestId("db-summary");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Equipos");
  await expect(card).toContainText("3");
  await card.click();
  await expect(page.getByTestId("db-block")).toHaveCount(2);

  // --- The quick filter -----------------------------------------------------
  await expect(grid.getByTestId("db-row")).toHaveCount(3);
  await grid.getByLabel("Filtrar estas filas").fill("router");
  await expect(grid.getByTestId("db-row")).toHaveCount(1);
  // Typed, not saved: the view is untouched and a reload brings everything
  // back, which is what makes it safe to type in.
  const after = await (await req.get(`/api/databases/${db.id}`)).json();
  expect(after.views[0].config.filters).toEqual([]);

  await ctx.close();
});

test("una nota puede referenciar una fila de una tabla", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.rowref.e2e@example.com",
    nickname: "dbrowref",
    password: "DbRowRef28xxxxxx",
  });
  const req = page.request;

  const db = await (
    await req.post("/api/databases", { data: { name: "Decisiones" } })
  ).json();
  const title = db.columns.find((c: { kind: string }) => c.kind === "text");
  await req.patch(`/api/databases/${db.id}/rows/${db.rows[0].id}`, {
    data: { cells: { [title.id]: "Migrar el DNS un martes" } },
  });
  const rowId = db.rows[0].id;

  // The picker finds rows through the same search the palette uses.
  const found = await (
    await req.get("/api/refs/search?q=migrar")
  ).json();
  const hit = found.find((c: { type: string }) => c.type === "row");
  expect(hit).toBeTruthy();
  expect(hit.id).toBe(`${db.id}:${rowId}`);
  expect(hit.hint).toBe("Decisiones");

  // And a chip resolves to the row's current title: it stores ids, so
  // renaming the row over there changes what the note says here.
  await req.patch(`/api/databases/${db.id}/rows/${rowId}`, {
    data: { cells: { [title.id]: "Migrar el DNS un miércoles" } },
  });
  const resolved = await (
    await req.post("/api/refs/resolve", {
      data: { refs: [{ type: "row", id: `${db.id}:${rowId}` }] },
    })
  ).json();
  expect(resolved[0].found).toBe(true);
  expect(resolved[0].title).toBe("Migrar el DNS un miércoles");

  // In a note, the chip is a link into the table with that row open.
  const folder = await (
    await req.post("/api/folders", { data: { name: "Actas" } })
  ).json();
  await req.patch(`/api/folders/${folder.id}`, {
    data: {
      description:
        `<p>Acordado en <a data-ref="row" data-ref-id="${db.id}:${rowId}">` +
        `Migrar el DNS</a>.</p>`,
    },
  });
  await page.goto(`/folder/${folder.id}`);
  const chip = page.locator('a[data-ref="row"]');
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await expect(chip).toContainText("Migrar el DNS un miércoles");
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`/databases/${db.id}\\?fila=${rowId}`));
  await expect(
    page.getByRole("heading", { name: "Migrar el DNS un miércoles" }),
  ).toBeVisible({ timeout: 20_000 });

  await ctx.close();
});
