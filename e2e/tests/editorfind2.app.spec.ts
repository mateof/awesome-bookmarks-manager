import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Searching, reading and leaving without losing what you typed.
 *
 * The find bar's rule is the one this file exists for: **typing in it must not
 * move the focus**. The first version selected each match in the editor and
 * focused it so it would be visible, which meant the caret was pulled out of
 * the box after two or three letters and the search ran on half a word. A
 * highlight that is a decoration rather than a selection is what fixes it, and
 * the way to test that is to type a long query one keystroke at a time and
 * check the whole thing arrived.
 */
const LONG = Array.from(
  { length: 30 },
  (_, i) => `<p>Párrafo ${i + 1} sobre la migración del servidor.</p>`,
).join("");

test("el buscador del editor no roba el foco mientras escribes", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "find.focus.e2e@example.com",
    nickname: "findfocus",
    password: "FindFocus27xxxx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Notas", description: LONG } })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await expect(editor).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Buscar y reemplazar" }).click();
  const bar = page.getByTestId("editor-find");
  const box = bar.getByLabel("Buscar", { exact: true });
  await expect(box).toBeFocused();

  // Typed key by key, like a person: this is exactly what used to lose the
  // focus partway through and leave "mig" in the box.
  await page.keyboard.type("migración", { delay: 40 });
  await expect(box).toHaveValue("migración");
  await expect(box).toBeFocused();
  await expect(bar).toContainText("1/30");

  // The matches are drawn without touching the selection, so they are visible
  // while the caret is still in the search box.
  await expect(editor.locator(".ab-find").first()).toBeVisible();

  // And replacing still works, which is the part that does touch the document.
  await bar.getByLabel("Reemplazar por").fill("mudanza");
  await bar.getByRole("button", { name: "Reemplazar todo" }).click();
  await expect(editor).toContainText("mudanza");
  await expect(editor).not.toContainText("migración");

  await ctx.close();
});

test("la vista completa busca dentro y se pone a pantalla completa", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "read.find.e2e@example.com",
    nickname: "readfind",
    password: "ReadFind27xxxxx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: {
        name: "Larga",
        description: `${LONG}<p>La aguja en el pajar.</p>`,
      },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Ver completa" }).click();
  await expect(
    page.getByRole("heading", { name: "Texto completo" }),
  ).toBeVisible();

  const find = page.getByTestId("read-find");
  await expect(find).toBeVisible();
  await find.getByLabel("Buscar", { exact: true }).fill("aguja");
  await expect(find).toContainText("1/1");
  // Highlighted in place, in the rendered note, without editing it.
  await expect(page.locator("mark.ab-find")).toHaveCount(1);

  // Full screen: the dialog takes the window.
  const dialog = page.locator("div.h-screen").first();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Maximizar el editor" }).click();
  await expect(page.locator("div.h-screen")).toHaveCount(1);

  await page.keyboard.press("Escape");
  // The marks go with the bar: a note left painted yellow by a search from an
  // hour ago is a note that has been edited by a search.
  await expect(page.locator("mark.ab-find")).toHaveCount(0);

  await ctx.close();
});

test("salir con texto sin guardar pregunta, con el diálogo de la app", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "dirty.guard.e2e@example.com",
    nickname: "dirtyguard",
    password: "DirtyGuard27xxx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Aviso", description: "<p>Original</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror");
  await expect(editor).toBeVisible({ timeout: 20_000 });

  // Nothing typed: cancelling is not worth a question.
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(editor).toHaveCount(0);

  await page.getByRole("button", { name: "Editar el texto" }).click();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(" y algo más");

  await page.getByRole("button", { name: "Cancelar" }).click();
  // The app's own dialog, not the browser's: this one can be read, translated
  // and clicked by a test.
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("no están guardadas");
  await ask.getByRole("button", { name: "Cancelar", exact: true }).click();
  // Said no: still editing, and the text is still there.
  await expect(editor).toContainText("y algo más");

  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Descartar" }).click();
  await expect(editor).toHaveCount(0);
  const after = await (await req.get(`/api/folders/${folder.id}`)).json();
  expect(after.description).toContain("Original");
  expect(after.description).not.toContain("algo más");

  await ctx.close();
});
