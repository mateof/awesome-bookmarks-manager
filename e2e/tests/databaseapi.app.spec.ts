import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The inline-database API.
 *
 * What matters here, beyond CRUD working:
 *
 * - A new database is usable immediately. An empty grid with no columns and no
 *   view is a dead end, so creation seeds a title column, a status select, a
 *   table view and a few blank rows.
 * - A cell update *merges*. The client only knows about the cell it changed,
 *   and replacing the row would wipe every other column.
 * - Deleting a column takes its values with it. Left behind they are sealed
 *   bytes for a column nobody can see, still counted against the quota.
 * - The rows count towards storage, which is the honest answer to "does this
 *   eat my space".
 * - Another account cannot touch any of it.
 */
const user = {
  email: "db.api.e2e@example.com",
  nickname: "dbapi",
  password: "InlineDatabase26x",
};

test("bases de datos: columnas, filas, vistas y aislamiento", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  // --- Creation seeds something you can actually use -----------------------
  const created = await req.post("/api/databases", {
    data: { name: "Proveedores" },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const db = await created.json();
  expect(db.name).toBe("Proveedores");
  expect(db.columns.map((c: { kind: string }) => c.kind)).toEqual([
    "text",
    "select",
  ]);
  expect(db.views).toHaveLength(1);
  expect(db.views[0].kind).toBe("table");
  expect(db.rows).toHaveLength(3);
  // The seeded view knows which column titles a card, so the board and gallery
  // have something to show without being configured first.
  expect(db.views[0].config.titleColumnId).toBe(db.columns[0].id);

  const titleCol = db.columns[0];
  const statusCol = db.columns[1];
  const optionId = statusCol.config.options[0].id;

  // --- Cells merge rather than replace -------------------------------------
  const row = db.rows[0];
  await req.patch(`/api/databases/${db.id}/rows/${row.id}`, {
    data: { cells: { [titleCol.id]: "Acme SL" } },
  });
  const afterSecond = await (
    await req.patch(`/api/databases/${db.id}/rows/${row.id}`, {
      data: { cells: { [statusCol.id]: optionId } },
    })
  ).json();
  // Setting the status must not have wiped the title.
  expect(afterSecond.cells[titleCol.id]).toBe("Acme SL");
  expect(afterSecond.cells[statusCol.id]).toBe(optionId);

  // --- More column kinds ---------------------------------------------------
  const numberCol = await (
    await req.post(`/api/databases/${db.id}/columns`, {
      data: { kind: "number", name: "Coste" },
    })
  ).json();
  const refCol = await (
    await req.post(`/api/databases/${db.id}/columns`, {
      data: { kind: "ref", name: "Ficha" },
    })
  ).json();

  const bm = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://acme.example/",
        title: "Acme",
        fetchSnapshot: false,
      },
    })
  ).json();
  await req.patch(`/api/databases/${db.id}/rows/${row.id}`, {
    data: {
      cells: {
        [numberCol.id]: 42,
        [refCol.id]: { type: "bookmark", id: bm.id },
      },
    },
  });

  // --- Filters and sorts live on the view ----------------------------------
  const view = db.views[0];
  const configured = await req.patch(
    `/api/databases/${db.id}/views/${view.id}`,
    {
      data: {
        config: {
          filters: [{ columnId: titleCol.id, op: "isNotEmpty" }],
          sorts: [{ columnId: titleCol.id, direction: "asc" }],
        },
      },
    },
  );
  expect(configured.ok(), await configured.text()).toBeTruthy();
  const savedView = await configured.json();
  expect(savedView.config.filters).toHaveLength(1);
  // Patching the config merges with what was there, so setting filters must
  // not silently drop the title column the seed chose.
  expect(savedView.config.titleColumnId).toBe(titleCol.id);

  // --- Deleting a column takes its values with it --------------------------
  expect(
    (await req.delete(`/api/databases/${db.id}/columns/${numberCol.id}`)).status(),
  ).toBe(204);
  const afterDrop = await (await req.get(`/api/databases/${db.id}`)).json();
  const reread = afterDrop.rows.find((r: { id: string }) => r.id === row.id);
  expect(numberCol.id in reread.cells).toBe(false);
  // And the reference column is untouched.
  expect(reread.cells[refCol.id]).toEqual({ type: "bookmark", id: bm.id });

  // --- A database always keeps one view ------------------------------------
  expect(
    (await req.delete(`/api/databases/${db.id}/views/${view.id}`)).status(),
  ).toBe(400);
  const board = await (
    await req.post(`/api/databases/${db.id}/views`, {
      data: { kind: "board", name: "Tablero" },
    })
  ).json();
  expect(board.kind).toBe("board");
  expect(
    (await req.delete(`/api/databases/${db.id}/views/${view.id}`)).status(),
  ).toBe(204);

  // --- Reordering rows -----------------------------------------------------
  const ids = afterDrop.rows.map((r: { id: string }) => r.id).reverse();
  expect(
    (
      await req.post(`/api/databases/${db.id}/rows/reorder`, {
        data: { order: ids },
      })
    ).ok(),
  ).toBeTruthy();
  const reordered = await (await req.get(`/api/databases/${db.id}`)).json();
  expect(reordered.rows.map((r: { id: string }) => r.id)).toEqual(ids);

  // --- It counts as storage ------------------------------------------------
  const usage = await (await req.get("/api/storage/me")).json();
  expect(usage.breakdown.database).toBeGreaterThan(0);

  // --- Nobody else's business ----------------------------------------------
  const other = await browser.newContext();
  await seedSpanish(other);
  const otherPage = await other.newPage();
  await signup(otherPage, {
    email: "db.api.other.e2e@example.com",
    nickname: "dbapiother",
    password: "NotYourTable26xx",
  });
  expect((await otherPage.request.get(`/api/databases/${db.id}`)).status()).toBe(
    404,
  );
  expect(
    (
      await otherPage.request.post(`/api/databases/${db.id}/rows`, {
        data: { cells: {} },
      })
    ).status(),
  ).toBe(404);
  expect((await otherPage.request.get("/api/databases")).status()).toBe(200);
  expect(await (await otherPage.request.get("/api/databases")).json()).toEqual([]);
  await other.close();

  // --- Deleting takes the lot ----------------------------------------------
  expect((await req.delete(`/api/databases/${db.id}`)).status()).toBe(204);
  expect((await req.get(`/api/databases/${db.id}`)).status()).toBe(404);

  await ctx.close();
});
