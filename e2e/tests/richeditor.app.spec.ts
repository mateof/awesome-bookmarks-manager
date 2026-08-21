import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The richer editor: headings, text colour, font family, section rule, and
 * images pasted or picked straight into the note.
 *
 * Images go in as resized data URLs rather than uploads on purpose: they ride
 * inside the same encrypted description field, survive the .abz export and
 * reach group shares with the text, with no new endpoint or quota plumbing.
 */
const user = {
  email: "rich.editor.e2e@example.com",
  nickname: "richeditor",
  password: "RicherNotes2026xx",
};

// 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("el editor guarda títulos, color, tipo de letra e imágenes", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Notas ricas", description: "<p>base</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();

  const editor = page.locator(".tiptap.ProseMirror");
  const selectAll = async () => {
    await editor.click();
    await expect(editor).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
  };

  await selectAll();
  await page.keyboard.type("Sección nueva");

  // Select the line once, then apply everything to that one selection.
  //
  // Re-selecting between toolbar clicks looks harmless and is not: TipTap's
  // focus() command restores the stored selection inside a
  // requestAnimationFrame, so a select-all fired right after a toolbar click
  // gets overwritten a frame later, and the next command lands on an empty
  // range — where a mark becomes an invisible stored mark instead of styling
  // anything. A person selects once and hits several buttons; so does this.
  await selectAll();
  await page.getByRole("button", { name: "Título grande" }).click();
  await expect(editor.locator("h1")).toBeVisible();

  await page.getByRole("button", { name: "Color del texto" }).click();
  await page.getByRole("button", { name: "#dc2626" }).click();
  await expect(editor.locator('span[style*="color"]')).toBeVisible();

  await page.getByLabel("Tipo de letra").selectOption("mono");
  await expect(editor.locator('span[style*="font-family"]')).toBeVisible();

  // An image from a file, through the toolbar.
  await page
    .locator('input[type="file"][accept="image/*"]')
    .last()
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await expect(editor.locator("img")).toBeVisible();

  await page.getByRole("button", { name: "Guardar y cerrar" }).click();
  await expect(async () => {
    const after = await (await req.get(`/api/folders/${folder.id}`)).json();
    expect(after.description).toContain("<h1");
    expect(after.description).toContain("color:");
    expect(after.description).toContain("font-family:");
    expect(after.description).toContain("data:image/png");
  }).toPass({ timeout: 10_000 });

  // And the saved result renders back: heading, styled text, image.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sección nueva" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("collapsible-text").locator("img"),
  ).toBeVisible();
});
