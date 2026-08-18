import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Copyable and spoiler marks in descriptions.
 *
 * The interesting property is not that a span gets a class: it is that the
 * markers survive the round-trip through the server's sanitiser and the
 * client's DOMPurify pass. Both strip anything they do not recognise, so a
 * mark that works in the editor can still arrive dead on the reading side.
 */
const user = {
  email: "rich.marks.e2e@example.com",
  nickname: "richmarksuser",
  password: "CopyAndHideText26x",
};

const NOTE =
  '<p>Usuario: <span data-copyable="true" class="ab-copyable">admin@example.com</span></p>' +
  '<p>Clave: <span data-spoiler="true" class="ab-spoiler">Sup3rSecreta</span></p>';

test("marcas: el texto copiable y el oculto sobreviven al guardado", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);

  const folder = await (
    await page.request.post("/api/folders", {
      data: { name: "Credenciales", description: NOTE },
    })
  ).json();

  // The server sanitiser kept the markers instead of stripping them.
  const stored = await (await page.request.get(`/api/folders/${folder.id}`)).json();
  expect(stored.description).toContain("data-copyable");
  expect(stored.description).toContain("data-spoiler");

  await page.goto(`/folder/${folder.id}`);

  const copyable = page.locator("[data-copyable]").first();
  const spoiler = page.locator("[data-spoiler]").first();
  await expect(copyable).toBeVisible();
  await expect(spoiler).toBeVisible();

  // Reachable by keyboard, not just by mouse.
  await expect(copyable).toHaveAttribute("role", "button");
  await expect(copyable).toHaveAttribute("tabindex", "0");

  // The spoiler starts hidden. Its text is in the DOM (it has to be, to be
  // copyable), so what is asserted is that it is actually obscured.
  await expect(spoiler).not.toHaveAttribute("data-revealed", "true");
  const blurred = await spoiler.evaluate((el) => getComputedStyle(el).filter);
  expect(blurred).toContain("blur");

  // Clicking reveals it, and does not copy on that first click.
  await spoiler.click();
  await expect(spoiler).toHaveAttribute("data-revealed", "true");
  await expect
    .poll(async () => spoiler.evaluate((el) => getComputedStyle(el).filter))
    .toBe("none");

  // Clicking the copyable puts its text on the clipboard.
  await copyable.click();
  await expect
    .poll(async () =>
      page.evaluate(() => navigator.clipboard.readText()),
    )
    .toBe("admin@example.com");

  // A second click on the revealed spoiler copies it too.
  await spoiler.click();
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Sup3rSecreta");

  await ctx.close();
});

test("marcas: los botones del editor las aplican", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "rich.marks.editor.e2e@example.com",
    nickname: "richmarkseditor",
    password: "ToolbarMarks2026x",
  });

  await page.getByRole("button", { name: "Nueva carpeta", exact: true }).click();
  await page.getByPlaceholder("Nombre", { exact: true }).fill("Con marcas");

  // The ProseMirror surface itself: EditorContent wraps it, and the wrapper
  // is not the element that takes the caret.
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.pressSequentially("secreto");
  await expect(editor).toContainText("secreto");
  // Triple-click selects the paragraph inside ProseMirror. Ctrl+A in a
  // contenteditable can escape to the whole document, which leaves the editor
  // without a usable selection to apply a mark to.
  await editor.click({ clickCount: 3 });

  await page.getByTitle("Texto oculto (clic para mostrar)").click();
  await expect(page.locator(".tiptap [data-spoiler]")).toHaveCount(1);

  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nueva carpeta" })).toBeHidden();

  // And it made it all the way to storage.
  const folders = await (await page.request.get("/api/folders")).json();
  const created = folders.find((f: { name: string }) => f.name === "Con marcas");
  expect(created.description).toContain("data-spoiler");

  await ctx.close();
});
