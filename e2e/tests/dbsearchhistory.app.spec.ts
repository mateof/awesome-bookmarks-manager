import { expect, test, type Page } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Finding what is inside a table, and getting back what a table forgot.
 *
 * Two gaps that shared a cause: a cell was somewhere data went in and nothing
 * came out. The palette could not see it, because search only ever read
 * bookmarks and folders; and a cell commits when you leave it, overwriting
 * what was there with no undo anywhere in the grid.
 *
 * Both have the same hard edge, and it is the password column. A search
 * snippet and a history entry are both lists rendered on screen, so both would
 * happily print a covered value if nobody said otherwise.
 */
async function tableWith(page: Page, folderName: string) {
  const folder = await (
    await page.request.post("/api/folders", { data: { name: folderName } })
  ).json();
  const db = await (
    await page.request.post("/api/databases", { data: { name: "Equipos" } })
  ).json();
  await page.request.patch(`/api/folders/${folder.id}`, {
    data: {
      description:
        `<p>Equipos</p><div data-db-id="${db.id}" data-db-name="Equipos" ` +
        `data-db-block="${crypto.randomUUID()}" class="ab-db-block">Equipos</div>`,
    },
  });
  return { folder, db };
}

test("buscar dentro de las tablas, sin enseñar las contraseñas", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.search.e2e@example.com",
    nickname: "dbsearch",
    password: "DbSearch28xxxxxx",
  });
  const req = page.request;

  const { db } = await tableWith(page, "Infra");
  const clave = await (
    await req.post(`/api/databases/${db.id}/columns`, {
      data: { kind: "password", name: "Clave" },
    })
  ).json();
  const full = await (await req.get(`/api/databases/${db.id}`)).json();
  const title = full.columns.find((c: { kind: string }) => c.kind === "text");
  const SECRET = "zanahoria-secreta";
  await req.patch(`/api/databases/${db.id}/rows/${full.rows[0].id}`, {
    data: {
      cells: { [title.id]: "Cabina de discos Synology", [clave.id]: SECRET },
    },
  });

  // The API first: a hit inside a cell, with the row named and the table said.
  const hits = await (
    await req.get("/api/search/rows?q=synology")
  ).json();
  expect(hits.length).toBe(1);
  expect(hits[0].databaseName).toBe("Equipos");
  expect(hits[0].label).toContain("Cabina de discos");

  // And the password is not searchable, which is the point: a match would put
  // the value into a snippet in a results list.
  const secretHits = await (
    await req.get(`/api/search/rows?q=${encodeURIComponent(SECRET)}`)
  ).json();
  expect(secretHits).toEqual([]);

  // Now from the palette, which is where a person would actually look.
  await page.goto("/");
  // The Cmd/Ctrl+K listener is registered in an effect, so wait for the shell
  // before typing or the keypress lands nowhere.
  await expect(
    page.getByRole("button", { name: "Nuevo bookmark", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Control+k");
  const spotlight = page.getByTestId("spotlight");
  await spotlight
    .getByPlaceholder("Buscar carpetas y bookmarks…")
    .fill("synology");
  const hit = spotlight.getByRole("button", { name: /Cabina de discos/ });
  await expect(hit).toBeVisible({ timeout: 15_000 });
  await expect(hit).toContainText("Equipos");
  await hit.click();

  // It lands on the table with that row open, rather than on the table and a
  // "now find it yourself".
  await expect(page).toHaveURL(new RegExp(`/databases/${db.id}\\?fila=`));
  await expect(
    page.getByRole("heading", { name: /Cabina de discos/ }),
  ).toBeVisible({ timeout: 20_000 });

  await ctx.close();
});

test("el historial de una fila devuelve lo que se machacó", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.history.e2e@example.com",
    nickname: "dbhistory",
    password: "DbHistory28xxxxx",
  });
  const req = page.request;

  const { folder, db } = await tableWith(page, "Proveedores");
  const full = await (await req.get(`/api/databases/${db.id}`)).json();
  const title = full.columns.find((c: { kind: string }) => c.kind === "text");
  const rowId = full.rows[0].id;
  await req.patch(`/api/databases/${db.id}/rows/${rowId}`, {
    data: { cells: { [title.id]: "Nombre correcto" } },
  });
  await req.patch(`/api/databases/${db.id}/rows/${rowId}`, {
    data: { cells: { [title.id]: "Nombre equivocado" } },
  });

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Desplegar la descripción" }).click();
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible({ timeout: 20_000 });

  await block.getByRole("button", { name: "Ver la fila completa" }).first().click();
  await page.getByRole("button", { name: "Historial de la fila" }).click();

  // The entry is named by what the row said then, not by a timestamp alone.
  const entry = page
    .getByTestId("row-version")
    .filter({ hasText: "Nombre correcto" })
    .getByRole("button", { name: "Restaurar" });
  await expect(entry).toBeVisible({ timeout: 10_000 });
  await entry.click();

  await expect(async () => {
    const after = await (await req.get(`/api/databases/${db.id}`)).json();
    expect(after.rows[0].cells[title.id]).toBe("Nombre correcto");
  }).toPass({ timeout: 10_000 });

  // Restoring is itself an edit, so the state it replaced is now in the
  // history too: going back has to be undoable or it is a trap.
  const versions = await (
    await req.get(`/api/databases/${db.id}/rows/${rowId}/versions`)
  ).json();
  expect(versions.some((v: { label: string }) => v.label === "Nombre equivocado")).toBe(
    true,
  );

  await ctx.close();
});
