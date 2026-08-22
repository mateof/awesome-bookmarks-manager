import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Embedding a database that already exists, and looking at it differently in
 * each place it appears.
 *
 * Three things being pinned down:
 *
 * - The same table can go into a second note. Before, the button only ever
 *   created a new one, which meant duplicating the data to show it twice and
 *   the two copies drifting apart.
 * - An embed can be pinned to one view and render just that, without the strip
 *   of tabs. An embedded table is usually meant to be one table.
 * - A view can belong to one embed alone, so the note that wants this table
 *   grouped by status does not force that on every other note using it.
 */
const user = {
  email: "db.embed.e2e@example.com",
  nickname: "dbembed",
  password: "EmbedExisting27xx",
};

test("insertar una base de datos existente, con una vista fijada", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  // A table that already exists, plus a second view to choose between.
  const db = await (
    await req.post("/api/databases", { data: { name: "Proveedores" } })
  ).json();
  const board = await (
    await req.post(`/api/databases/${db.id}/views`, {
      data: { kind: "board", name: "Por estado" },
    })
  ).json();
  await req.patch(`/api/databases/${db.id}/views/${board.id}`, {
    data: { config: { groupByColumnId: db.columns[1].id } },
  });
  await req.patch(`/api/databases/${db.id}/rows/${db.rows[0].id}`, {
    data: { cells: { [db.columns[0].id]: "Acme" } },
  });

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Trimestre", description: "<p>notas</p>" },
    })
  ).json();

  // --- Insert the existing one, pinned to the board ------------------------
  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await editor.click();
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Base de datos" }).click();

  // The chooser offers both routes; take the existing one.
  await expect(
    page.getByRole("heading", { name: "Base de datos" }),
  ).toBeVisible();
  await page.getByPlaceholder("Buscar una que ya tengas…").fill("Prov");
  await page.getByRole("button", { name: /Proveedores/ }).click();

  await expect(
    page.getByRole("heading", { name: /Qué vista de/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Por estado/ }).click();

  // The card in the editor shows which view is pinned, and can change it.
  const card = page.getByTestId("db-editor-card");
  await expect(card).toContainText("Proveedores");
  await expect(card.getByLabel("Vista fijada")).toHaveValue(board.id);

  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  // --- The note carries the embed, not a copy of the data ------------------
  await expect(async () => {
    const after = await (await req.get(`/api/folders/${folder.id}`)).json();
    expect(after.description).toContain(`data-db-id="${db.id}"`);
    expect(after.description).toContain(`data-db-view="${board.id}"`);
    expect(after.description).toContain("data-db-block=");
  }).toPass({ timeout: 10_000 });

  // Still one database: embedding did not duplicate anything.
  const all = await (await req.get("/api/databases")).json();
  expect(all).toHaveLength(1);

  // --- And it renders as that view alone, with no tab strip ----------------
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible();
  await expect(block.getByText("Por estado")).toBeVisible();
  // The other view is not offered here: this embed is pinned.
  await expect(block.getByRole("button", { name: "Tabla" })).toHaveCount(0);
  // A board, so lanes rather than rows.
  await expect(page.getByTestId("db-lane").first()).toBeVisible();

  await ctx.close();
});

test("una vista solo para esta nota no aparece en las demás", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.embed2.e2e@example.com",
    nickname: "dbembed2",
    password: "PrivateViews27xxx",
  });
  const req = page.request;

  const db = await (
    await req.post("/api/databases", { data: { name: "Compartida" } })
  ).json();

  // The same table embedded in two notes, each with its own block id.
  const a = await (
    await req.post("/api/folders", {
      data: {
        name: "Nota A",
        description: `<p>a</p><div data-db-id="${db.id}" data-db-block="block-a"></div>`,
      },
    })
  ).json();
  const b = await (
    await req.post("/api/folders", {
      data: {
        name: "Nota B",
        description: `<p>b</p><div data-db-id="${db.id}" data-db-block="block-b"></div>`,
      },
    })
  ).json();

  // A view belonging to the first embed only.
  const priv = await (
    await req.post(`/api/databases/${db.id}/views`, {
      data: { kind: "gallery", name: "Solo en A", blockId: "block-a" },
    })
  ).json();
  expect(priv.blockId).toBe("block-a");

  // Asking as that embed sees it; asking as the other one does not.
  const asA = await (
    await req.get(`/api/databases/${db.id}?block=block-a`)
  ).json();
  expect(asA.views.map((v: { name: string }) => v.name)).toContain("Solo en A");

  const asB = await (
    await req.get(`/api/databases/${db.id}?block=block-b`)
  ).json();
  expect(asB.views.map((v: { name: string }) => v.name)).not.toContain(
    "Solo en A",
  );

  // And the database on its own page shows only its shared views: a view made
  // for one note is not part of the table everybody else uses.
  const plain = await (await req.get(`/api/databases/${db.id}`)).json();
  expect(plain.views.map((v: { name: string }) => v.name)).not.toContain(
    "Solo en A",
  );
  expect(plain.views).toHaveLength(1);

  // In the browser: note A offers it, note B does not.
  await page.goto(`/folder/${a.id}`);
  await expect(page.getByTestId("db-block")).toBeVisible();
  await page.getByRole("button", { name: "Añadir vista" }).click();
  await expect(
    page.getByRole("button", { name: /Nueva vista solo para esta nota/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(`/folder/${b.id}`);
  const bBlock = page.getByTestId("db-block");
  await expect(bBlock).toBeVisible();
  await expect(bBlock.getByRole("button", { name: "Solo en A" })).toHaveCount(0);

  await ctx.close();
});
