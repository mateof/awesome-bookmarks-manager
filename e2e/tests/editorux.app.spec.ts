import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The ways of reaching the editor's features that are not a toolbar button:
 * the `/` menu, find and replace, the emoji trigger, and the count that says
 * how much is written.
 *
 * The slash menu is the one that matters most. A toolbar is a fine place to
 * discover something once and a poor place to reach it while typing, and half
 * of what this editor inserts (a table, a formula, a diagram) has no obvious
 * icon anyway. It is also the one with a rule that has to be got right: a
 * slash in the middle of a word is a slash, not a command.
 */
test("menú de barra, buscar y reemplazar, y contador", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.ux.e2e@example.com",
    nickname: "editorux",
    password: "EditorUx26xxxxxx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Notas", description: "<p>Uno</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");

  // --- The slash menu -------------------------------------------------------
  await page.keyboard.type("/");
  const menu = page.getByTestId("slash-menu");
  await expect(menu).toBeVisible();
  // What follows the slash filters it, and the slash itself stays in the text
  // until something is chosen: Escape has to leave a normal slash behind.
  await page.keyboard.type("tab");
  await expect(menu.getByRole("button", { name: "Tabla sencilla" })).toBeVisible();
  await menu.getByRole("button", { name: "Tabla sencilla" }).click();
  await expect(menu).toHaveCount(0);
  await expect(editor.locator("table")).toHaveCount(1);
  // The trigger and its query are gone: no stray "/tab" left in the note.
  await expect(editor).not.toContainText("/tab");

  // A slash inside a word is just a slash.
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("y/o");
  await expect(page.getByTestId("slash-menu")).toHaveCount(0);

  // --- The count ------------------------------------------------------------
  await expect(page.getByText(/\d+ palabras · \d+ caracteres/)).toBeVisible();

  // --- Find and replace -----------------------------------------------------
  await page.getByRole("button", { name: "Buscar y reemplazar" }).click();
  const bar = page.getByTestId("editor-find");
  await expect(bar).toBeVisible();
  await bar.getByLabel("Buscar").fill("y/o");
  await expect(bar).toContainText("1/1");
  await bar.getByLabel("Reemplazar por").fill("y también");
  await bar.getByRole("button", { name: "Reemplazar todo" }).click();
  await expect(editor).toContainText("y también");

  await page.getByRole("button", { name: "Guardar y cerrar" }).click();
  await expect(async () => {
    const saved = await (await req.get(`/api/folders/${folder.id}`)).json();
    expect(saved.description).toContain("<table");
    expect(saved.description).toContain("y también");
  }).toPass({ timeout: 10_000 });

  await ctx.close();
});

test("superíndice, tecla y alineación sobreviven al guardado", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.marks2.e2e@example.com",
    nickname: "editormarks2",
    password: "EditorMarks226xx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Formato", description: "<p>x2</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Superíndice" }).click();
  await page.getByRole("button", { name: "Tecla" }).click();
  await page.getByRole("button", { name: "Centrar" }).click();
  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  // Three things the sanitiser had to be taught about: two tags and a style
  // property. Any of them missing and the format is silently gone on reload.
  await expect(async () => {
    const saved = await (await req.get(`/api/folders/${folder.id}`)).json();
    expect(saved.description).toContain("<sup>");
    expect(saved.description).toContain("<kbd>");
    expect(saved.description).toContain("text-align:center");
  }).toPass({ timeout: 10_000 });

  await ctx.close();
});
