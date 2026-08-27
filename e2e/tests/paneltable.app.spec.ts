import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A note with a table in it, read from a public panel.
 *
 * The panel's modal inserts the note's HTML into a themed sheet of its own,
 * which is not the app's page and gets none of the app's typography classes.
 * Tables were therefore arriving with the browser's defaults: no rules between
 * cells, no padding, and a long cell squeezed into a vertical ribbon one word
 * wide while the rest of the row sat empty. It was readable in the app and
 * unreadable in the copy other people see, which is the worst place for a
 * difference like that to live.
 */
const LONG =
  "test_jmartin3 es croata, no colombiano. Su languageid es hr, y es " +
  "exactamente el jugador que Elena pegó en el comentario de la PR.";

test("una tabla en un panel se lee, y el modal se maximiza", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.table.e2e@example.com",
    nickname: "paneltable",
    password: "PanelTable27xxx",
  });
  const req = page.request;

  const root = await (
    await req.post("/api/folders", { data: { name: "Cuentas" } })
  ).json();
  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Usuarios", parentId: root.id },
    })
  ).json();
  const db = await (
    await req.post("/api/databases", { data: { name: "Usuarios" } })
  ).json();
  const title = db.columns.find((c: { kind: string }) => c.kind === "text");
  const comment = await (
    await req.post(`/api/databases/${db.id}/columns`, {
      data: { kind: "text", name: "Comentario" },
    })
  ).json();
  const rows = (await (await req.get(`/api/databases/${db.id}`)).json()).rows;
  await req.patch(`/api/databases/${db.id}/rows/${rows[0].id}`, {
    data: { cells: { [title.id]: "test_jmartin3", [comment.id]: LONG } },
  });
  await req.patch(`/api/folders/${folder.id}`, {
    data: {
      description:
        `<p>Cuentas de prueba.</p><div data-db-id="${db.id}" ` +
        `data-db-name="Usuarios" data-db-block="${crypto.randomUUID()}" ` +
        `class="ab-db-block">Usuarios</div>`,
    },
  });

  const panel = await req.post("/api/panels", {
    data: {
      title: "Cuentas",
      slug: "cuentas-tabla-e2e",
      folderId: root.id,
      templateId: "builtin:galaxy",
      accessMode: "public",
    },
  });
  expect(panel.ok(), await panel.text()).toBeTruthy();

  // Read as a stranger: no session, which is the whole point of a panel.
  const anon = await browser.newContext();
  const reader = await anon.newPage();
  await reader.goto("/panel/cuentas-tabla-e2e");
  await reader
    .getByRole("button", { name: "Ver el texto de Usuarios" })
    .last()
    .click();
  const modal = reader.getByTestId("panel-modal");
  await expect(modal).toBeVisible();

  // The table is in a box that scrolls sideways, which is what lets its
  // columns be as wide as their content instead of being squeezed.
  const table = modal.locator(".ab-table-scroll > table");
  await expect(table).toHaveCount(1);

  // Rules between the cells: without them the flattened table is a wall of
  // words. This is the assertion that would have caught the original bug.
  const border = await table
    .locator("td")
    .first()
    .evaluate((el) => getComputedStyle(el).borderBottomWidth);
  expect(parseFloat(border)).toBeGreaterThan(0);

  // The long cell gets a real column, not a ribbon: comfortably wider than a
  // couple of words.
  const width = (await table.locator("td").last().boundingBox())!.width;
  expect(width).toBeGreaterThan(200);

  // And the sheet can take the window, because a twelve-column table is
  // exactly what a 2xl box cannot show.
  const before = (await modal.boundingBox())!.width;
  await reader.getByRole("button", { name: "Maximizar el editor" }).click();
  await expect(async () => {
    expect((await modal.boundingBox())!.width).toBeGreaterThan(before);
  }).toPass({ timeout: 5000 });

  // The find bar works here too: a shared note is read, and long notes are
  // read by looking for one line.
  await reader.getByRole("button", { name: "Buscar", exact: true }).click();
  await reader.getByTestId("read-find").getByLabel("Buscar", { exact: true }).fill("croata");
  await expect(modal.locator("mark.ab-find")).toHaveCount(1);

  await anon.close();
  await ctx.close();
});
