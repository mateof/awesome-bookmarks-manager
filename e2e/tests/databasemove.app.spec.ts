import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Moving an embedded table within the note.
 *
 * The node declared itself draggable from the start, but a React node view
 * needs an element carrying `data-drag-handle` before ProseMirror will drag
 * anything, so it never actually moved. The arrows exist alongside the grip
 * because dragging a block inside a contenteditable is a fight on a phone and
 * impossible with a keyboard.
 */
const user = {
  email: "db.move.e2e@example.com",
  nickname: "dbmove",
  password: "MoveTheTable27xx",
};

test("la tabla se mueve arriba y abajo dentro de la nota", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const db = await (
    await req.post("/api/databases", { data: { name: "Tabla" } })
  ).json();

  // Three blocks: a paragraph, the table, another paragraph. Enough to tell
  // "moved" from "did nothing".
  const folder = await (
    await req.post("/api/folders", {
      data: {
        name: "Nota",
        description:
          `<p>primero</p>` +
          `<div data-db-id="${db.id}" data-db-name="Tabla" data-db-block="b1"></div>` +
          `<p>ultimo</p>`,
      },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();

  const card = page.getByTestId("db-editor-card");
  await expect(card).toBeVisible();
  // The grip is what makes it draggable at all.
  await expect(card.locator("[data-drag-handle]")).toHaveCount(1);

  const order = async () =>
    page
      .locator(".tiptap.ProseMirror > *")
      .evaluateAll((els) =>
        els.map((e) =>
          // The node view renders a React card, so the block is recognised by
          // its testid rather than by the data attribute the stored HTML uses.
          e.matches('[data-testid="db-editor-card"]') ||
          e.querySelector('[data-testid="db-editor-card"]')
            ? "TABLE"
            : (e.textContent ?? "").trim(),
        ),
      );

  expect(await order()).toEqual(["primero", "TABLE", "ultimo"]);

  // Up: past the first paragraph, and now it cannot go further.
  await card.getByRole("button", { name: "Subir la tabla" }).click();
  expect(await order()).toEqual(["TABLE", "primero", "ultimo"]);
  await expect(card.getByRole("button", { name: "Subir la tabla" })).toBeDisabled();

  // Down twice: to the end, where the other arrow gives out.
  await card.getByRole("button", { name: "Bajar la tabla" }).click();
  await card.getByRole("button", { name: "Bajar la tabla" }).click();
  expect(await order()).toEqual(["primero", "ultimo", "TABLE"]);
  await expect(
    card.getByRole("button", { name: "Bajar la tabla" }),
  ).toBeDisabled();

  // One undo puts it back one step, not two: the move is a single transaction
  // rather than a delete followed by an insert.
  await page.locator(".tiptap.ProseMirror").click();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await order()).toEqual(["primero", "TABLE", "ultimo"]);

  // And the new order survives the round trip through the server.
  await card.getByRole("button", { name: "Subir la tabla" }).click();
  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  await expect(async () => {
    const after = await (await req.get(`/api/folders/${folder.id}`)).json();
    const html: string = after.description;
    expect(html.indexOf("data-db-id")).toBeLessThan(html.indexOf("primero"));
  }).toPass({ timeout: 10_000 });

  // The block kept its identity, so any view private to it still belongs to it.
  const saved = await (await req.get(`/api/folders/${folder.id}`)).json();
  expect(saved.description).toContain('data-db-block="b1"');

  await ctx.close();
});
