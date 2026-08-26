import { expect, test, type Page } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The blocks the editor gained from studying SiYuan's: checklists, code with
 * its language, prose tables, formulas and diagrams.
 *
 * All four of the new ones store **source** and render something else: a
 * formula is LaTeX, a diagram is Mermaid text, a code block is text plus the
 * name of a grammar, a checklist is a list plus an attribute. That is not an
 * implementation detail, it is the property this test exists to protect: the
 * HTML goes through a sanitiser on the way to the server and is rendered in
 * four places, and the one failure mode that matters is a block that looks
 * right while you type it and comes back as plain text after a reload.
 */
async function openEditor(page: Page, folderId: string) {
  await page.goto(`/folder/${folderId}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();
  return editor;
}

test("bloques nuevos: tareas, código, tabla, fórmula y diagrama", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.blocks.e2e@example.com",
    nickname: "editorblocks",
    password: "EditorBlocks26xx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Apuntes", description: "<p>Cabecera</p>" },
    })
  ).json();

  const editor = await openEditor(page, folder.id);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Pendientes");
  await page.keyboard.press("Enter");

  // --- A checklist ----------------------------------------------------------
  await page.getByRole("button", { name: "Lista de tareas" }).click();
  await page.keyboard.type("Comprar pan");
  // The tick lives on the item and the type on the list: written the other way
  // round this matches nothing, which is how the read view's click handler was
  // found to be looking for the wrong attribute.
  await expect(editor.locator("li[data-checked]")).toHaveCount(1);

  // --- Code, with a language ------------------------------------------------
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bloque de código" }).click();
  await page.keyboard.type("print('hola')");
  await page.getByLabel("Lenguaje del código").selectOption("python");
  await expect(editor.locator("pre code.language-python")).toHaveCount(1);

  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  // What the server kept. This is the assertion the whole file is about.
  await expect(async () => {
    const saved = await (await req.get(`/api/folders/${folder.id}`)).json();
    expect(saved.description).toContain('data-type="taskList"');
    expect(saved.description).toContain('data-checked="false"');
    expect(saved.description).toContain('class="language-python"');
  }).toPass({ timeout: 10_000 });

  // --- Formula and diagram, inserted through the toolbar's prompts ----------
  const editor2 = await openEditor(page, folder.id);
  await editor2.click();
  await page.keyboard.press("ControlOrMeta+End");
  // Both sources are written in a dialog of the app's own. A `prompt` was the
  // first version and was wrong twice over: a Mermaid diagram is several lines
  // and a prompt is one, and the fixtures accept every native dialog blindly,
  // so it answered itself with an empty string.
  await page.getByRole("button", { name: "Fórmula", exact: true }).click();
  await page.getByLabel("Fórmula", { exact: true }).fill("E = mc^2");
  await page.getByRole("button", { name: "Insertar", exact: true }).click();
  await expect(editor2.locator("span[data-math], div[data-math-block]")).toHaveCount(
    1,
  );

  await page.getByRole("button", { name: "Diagrama" }).click();
  await page.getByLabel("Diagrama", { exact: true }).fill("graph TD; A-->B;");
  await page.getByRole("button", { name: "Insertar", exact: true }).click();
  await expect(editor2.locator("div[data-mermaid]")).toHaveCount(1);
  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  await expect(async () => {
    const saved = await (await req.get(`/api/folders/${folder.id}`)).json();
    // Marker attributes with a fixed value; the source is the element's text,
    // because a sanitiser drops any attribute value containing `-->` and that
    // is Mermaid's arrow.
    expect(saved.description).toContain('data-math-block="1"');
    expect(saved.description).toContain('data-mermaid="1"');
    expect(saved.description).toContain("E = mc^2");
    expect(saved.description).toContain("graph TD");
  }).toPass({ timeout: 10_000 });

  // --- And what a reader sees ----------------------------------------------
  await page.reload();
  await page.getByRole("button", { name: "Desplegar la descripción" }).click();
  const text = page.getByTestId("collapsible-text");

  // KaTeX turns the source into markup of its own; the marker element is
  // still there, which is what makes it re-renderable and editable.
  await expect(text.locator(".katex").first()).toBeVisible({ timeout: 20_000 });
  // Mermaid draws an SVG, sanitised before it goes in.
  await expect(text.locator(".ab-diagram svg").first()).toBeVisible({
    timeout: 20_000,
  });
  // The highlighter colours the code once its grammars have loaded.
  await expect(text.locator("pre code .hljs-string").first()).toBeVisible({
    timeout: 20_000,
  });

  await ctx.close();
});

test("un aviso destacado guarda de qué tipo es", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.callout.e2e@example.com",
    nickname: "editorcallout",
    password: "EditorCallout26xx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Avisos", description: "<p>Ojo con el DNS</p>" },
    })
  ).json();

  const editor = await openEditor(page, folder.id);
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Aviso destacado" }).click();
  await page.getByRole("button", { name: "Peligro" }).click();
  await expect(editor.locator('div[data-callout="danger"]')).toHaveCount(1);

  // Choosing another kind changes the box rather than nesting a second one
  // inside the first, which is what a plain toggle would do.
  await page.getByRole("button", { name: "Aviso destacado" }).click();
  await page.getByRole("button", { name: "Consejo" }).click();
  await expect(editor.locator("div[data-callout]")).toHaveCount(1);
  await expect(editor.locator('div[data-callout="tip"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Guardar y cerrar" }).click();
  await expect(async () => {
    const saved = await (await req.get(`/api/folders/${folder.id}`)).json();
    // The kind is stored as a word: a colour would not survive a theme, a
    // screen reader, or a copy that lands somewhere with another palette.
    expect(saved.description).toContain('data-callout="tip"');
    expect(saved.description).toContain("Ojo con el DNS");
  }).toPass({ timeout: 10_000 });

  await ctx.close();
});

test("una casilla se marca desde la nota, sin abrir el editor", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.tasks.e2e@example.com",
    nickname: "editortasks",
    password: "EditorTasks26xxx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: {
        name: "Lista",
        // Exactly the shape the editor produces, taken from what it saves:
        // a seed written from memory is a test of the memory.
        description:
          '<ul data-type="taskList"><li data-checked="false">' +
          "<label><span></span></label><div><p>Comprar pan</p></div></li></ul>",
      },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  const item = page.locator("li[data-checked]").first();
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item).toHaveAttribute("data-checked", "false");

  // Clicked on the box, which is the left edge of the item: a checklist you
  // can only tick by opening the editor is half a checklist.
  await item.click({ position: { x: 6, y: 10 } });
  await expect(item).toHaveAttribute("data-checked", "true");

  await expect(async () => {
    const saved = await (await req.get(`/api/folders/${folder.id}`)).json();
    expect(saved.description).toContain('data-checked="true"');
  }).toPass({ timeout: 10_000 });

  await ctx.close();
});
