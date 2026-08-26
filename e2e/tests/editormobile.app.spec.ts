import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The phone's "+" panel: everything the editor can do, grouped.
 *
 * This is the panel that fell behind. It was written when there were nine
 * things to insert and stayed a flat list of nine while the editor grew
 * checklists, code blocks, tables, formulas, diagrams and callouts, so on a
 * phone half of the editor had quietly become unreachable — with no error, no
 * empty state, nothing to notice.
 *
 * So this test is not really about the panel rendering. It asserts that the
 * blocks the editor gained are **reachable from a phone**, which is the
 * property that broke, and it is written against the section titles so that
 * adding a block without listing it shows up here.
 */
test.use({ viewport: { width: 390, height: 780 } });

test("el panel «+» del móvil llega a todo, por categorías", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.mobile.e2e@example.com",
    nickname: "editormobile",
    password: "EditorMobile26xx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Móvil", description: "<p>Nota</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  // The bar only exists while the editor has focus: it lives on top of the
  // keyboard, and there is no keyboard when nothing is being typed into.
  await editor.click();
  const bar = page.getByTestId("editor-mobile-bar");
  await expect(bar).toBeVisible();

  await bar.getByRole("button", { name: "Más acciones" }).click();

  // The four groups, in the order somebody looks for them.
  for (const group of ["Texto", "Bloques", "Insertar", "Alineación"]) {
    await expect(bar.getByText(group, { exact: true })).toBeVisible();
  }

  // And the blocks that were unreachable from here until now.
  for (const label of [
    "Lista de tareas",
    "Bloque de código",
    "Tabla sencilla",
    "Aviso destacado",
    "Superíndice",
    "Tecla",
    "Quitar el formato",
    "Centrar",
  ]) {
    await expect(bar.getByText(label, { exact: true })).toBeVisible();
  }

  // Not a menu of dead entries: one of them does what it says.
  await bar.getByText("Lista de tareas", { exact: true }).click();
  await expect(editor.locator("li[data-checked]")).toHaveCount(1);

  await ctx.close();
});
