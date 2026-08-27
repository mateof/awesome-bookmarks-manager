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
  // Everything at once: the whole point of the menu is seeing what there is,
  // and a single column of sixteen items is a scroll instead of a look.
  const shown = await menu.getByRole("button").count();
  expect(shown).toBeGreaterThanOrEqual(14);
  const box = (await menu.boundingBox())!;
  expect(box.width).toBeGreaterThan(400);
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

test("el emoji se abre, se ve entero y escribe en el texto", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.emoji.e2e@example.com",
    nickname: "editoremoji",
    password: "EditorEmoji26xxx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Emoji", description: "<p>Hola</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");

  await page.getByRole("button", { name: "Emoji", exact: true }).click();

  // Outside the dialog by construction. The picker places itself with
  // `absolute top-full`, which needs a positioned ancestor and no scrolling
  // one in between; inside the editor there is neither, so it was drawn
  // somewhere nobody could see and the button looked dead.
  // Waited for with a locator before measuring: an `evaluate` fired straight
  // after a click can run before React has committed the panel, and then the
  // measurement is of a moment that never mattered. That raced once already.
  await expect(page.getByTestId("emoji-grid")).toBeVisible();
  // Polled rather than measured once. The panel is visible before it is
  // *placed*: the popover positions itself in an effect, so a single
  // `evaluate` right after the grid appears sometimes reads the frame before
  // that ran and sees a panel that has not become `fixed` yet. It failed that
  // way roughly one run in ten, which is worse than failing always.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("body > div")).some(
          (d) =>
            getComputedStyle(d).position === "fixed" &&
            !!d.querySelector("input[placeholder]") &&
            d.querySelectorAll("button").length > 10,
        ),
      ),
    )
    .toBe(true);

  // --- Only the grid scrolls -----------------------------------------------
  const grid = page.getByTestId("emoji-grid");
  await expect(page.getByRole("tablist")).toBeVisible();

  // Two nested scroll areas is not a redundancy, it is something you feel:
  // the grid reaches its end, the wheel carries on into the popover, and the
  // search box slides out of sight under the toolbar it hangs from. The panel
  // itself must not be scrollable at all.
  await page.getByRole("tab", { name: "Símbolos" }).click();
  const before = await page.getByLabel("Buscar emoji…").boundingBox();
  await grid.hover();
  await page.mouse.wheel(0, 2000);
  await page.mouse.wheel(0, 2000);
  const after = await page.getByLabel("Buscar emoji…").boundingBox();
  // The search box has not moved: nothing above the grid was scrolled away.
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
  // And the grid really did scroll, or the assertion above proves nothing.
  expect(await grid.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);

  // --- Tabs, and a search that ignores them --------------------------------

  // A category that is not the one open: the food tab, by its own icon.
  await page.getByRole("tab", { name: "Comida y bebida" }).click();
  await expect(grid.getByRole("button", { name: "🍕" })).toBeVisible();
  await expect(grid.getByRole("button", { name: "🏠" })).toHaveCount(0);

  // Searching looks everywhere, which is the point: you type "casa" precisely
  // because you do not know which drawer it is in. Unaccented, too.
  await page.getByLabel("Buscar emoji…").fill("casa");
  await expect(grid.getByRole("button", { name: "🏠" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);

  // And it types into the note rather than just looking right.
  await grid.getByRole("button", { name: "🏠" }).first().click();
  await expect(editor).toContainText("🏠");

  // What you just used is waiting in the first tab next time. A static
  // "frequent" list is a guess about somebody else's habits; this is not.
  await page.getByRole("button", { name: "Emoji", exact: true }).click();
  await expect(page.getByTestId("emoji-grid").getByRole("button", { name: "🏠" }).first()).toBeVisible();

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
