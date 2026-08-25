import { expect, test, type Page } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The three things a column gained: a password kind, a colour you choose for
 * each option, and a position you can move.
 *
 * The password kind is the one with teeth. Masking a cell on screen is the
 * easy half and protects against the room you are in, nothing more: the value
 * is sealed exactly like every other cell and anyone who can read the table
 * can reveal it. The half that has to be right is the **flattened copy** — a
 * published panel, a group's copy of a note — because there the reader is by
 * definition not the owner, and that copy is built by the server from the same
 * rows. So the test publishes a panel and reads what it actually served.
 */

/** A note holding an embedded table, in the shape the editor produces. */
function blockHtml(dbId: string, name: string): string {
  return (
    `<p>Accesos</p><div data-db-id="${dbId}" data-db-name="${name}" ` +
    `data-db-block="${crypto.randomUUID()}" class="ab-db-block">${name}</div>`
  );
}

async function makeTable(page: Page, folderName: string) {
  const folder = await (
    await page.request.post("/api/folders", { data: { name: folderName } })
  ).json();
  const db = await (
    await page.request.post("/api/databases", { data: { name: "Accesos" } })
  ).json();
  await page.request.patch(`/api/folders/${folder.id}`, {
    data: { description: blockHtml(db.id, "Accesos") },
  });
  return { folder, db };
}

test("una columna de contraseña se tapa, se copia y no viaja en una copia", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.password.e2e@example.com",
    nickname: "dbpassword",
    password: "DbPassword28xxxx",
  });
  const req = page.request;

  const { folder, db } = await makeTable(page, "Servidores");
  const col = await (
    await req.post(`/api/databases/${db.id}/columns`, {
      data: { kind: "password", name: "Clave" },
    })
  ).json();
  const rows = (await (await req.get(`/api/databases/${db.id}`)).json()).rows;
  const SECRET = "hunter2-nunca-visible";
  await req.patch(`/api/databases/${db.id}/rows/${rows[0].id}`, {
    data: { cells: { [col.id]: SECRET } },
  });

  // --- On screen: covered, revealed on demand, copyable ---------------------
  await page.goto(`/folder/${folder.id}`);
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible({ timeout: 20_000 });

  const cell = block.getByLabel("Clave", { exact: true }).first();
  await expect(cell).toHaveAttribute("type", "password");
  await expect(cell).toHaveValue(SECRET);

  await block.getByRole("button", { name: "Mostrar el valor" }).first().click();
  await expect(cell).toHaveAttribute("type", "text");
  await block.getByRole("button", { name: "Ocultar el valor" }).first().click();
  await expect(cell).toHaveAttribute("type", "password");

  // Copying is what makes the covering bearable: the usual errand is pasting
  // it somewhere else, and that never needs it on screen.
  await expect(
    block.getByRole("button", { name: "Copiar el valor" }).first(),
  ).toBeVisible();

  // --- And in a copy somebody else reads ------------------------------------
  const panel = await req.post("/api/panels", {
    data: {
      title: "Servidores",
      slug: "servidores-clave-e2e",
      folderId: folder.id,
      templateId: "builtin:grid",
      accessMode: "public",
    },
  });
  expect(panel.ok(), await panel.text()).toBeTruthy();

  // Read as a stranger would: no session at all.
  const anon = await browser.newContext();
  const raw = await anon.request.get("/api/public/panel/servidores-clave-e2e");
  const body = await raw.text();
  expect(raw.ok(), body).toBeTruthy();
  expect(body).not.toContain(SECRET);
  // Dots rather than nothing: that a value exists is not the secret.
  expect(body).toContain("••••••••");
  await anon.close();

  await ctx.close();
});

test("color de las opciones y orden de las columnas", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.columns.e2e@example.com",
    nickname: "dbcolumns",
    password: "DbColumns28xxxxx",
  });
  const req = page.request;

  const { folder, db } = await makeTable(page, "Tareas");
  await page.goto(`/folder/${folder.id}`);
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible({ timeout: 20_000 });

  // A fresh database seeds "Título" then "Estado".
  const header = block.locator("thead th");
  await expect(header.nth(1)).toContainText("Título");
  await expect(header.nth(2)).toContainText("Estado");

  // --- The colour of an option ---------------------------------------------
  await block
    .getByRole("button", { name: "Ajustes de la columna: Estado" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Columna «Estado»" }),
  ).toBeVisible();

  // The chip is the button: an option is a coloured pill, so the pill is what
  // you click to change its colour.
  await page.getByRole("button", { name: "Color de la opción: Hecho" }).click();
  await page.getByRole("button", { name: "#8b5cf6" }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  await expect(async () => {
    const after = await (await req.get(`/api/databases/${db.id}`)).json();
    const estado = after.columns.find(
      (c: { kind: string }) => c.kind === "select",
    );
    const hecho = estado.config.options.find(
      (o: { name: string }) => o.name === "Hecho",
    );
    expect(hecho.color.toLowerCase()).toBe("#8b5cf6");
  }).toPass({ timeout: 10_000 });

  // --- And the order of the columns ----------------------------------------
  // Through the menu rather than by dragging: same move, reachable by
  // keyboard, and it says which way it goes. The drag is the gesture for a
  // mouse, this is the one that can be tested and used without one.
  await block
    .getByRole("button", { name: "Ajustes de la columna: Estado" })
    .click();
  await page.getByRole("button", { name: "Mover a la izquierda" }).click();
  await expect(async () => {
    const after = await (await req.get(`/api/databases/${db.id}`)).json();
    expect(after.columns[0].name).toBe("Estado");
    expect(after.columns[1].name).toBe("Título");
  }).toPass({ timeout: 10_000 });

  await page.getByRole("button", { name: "Cancelar" }).click();
  // And the table shows it in that order, which is the point of moving it.
  await expect(header.nth(1)).toContainText("Estado");
  await expect(header.nth(2)).toContainText("Título");

  await ctx.close();
});
