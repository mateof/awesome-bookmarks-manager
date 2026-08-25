import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Highlighting a passage, and underlining it in a colour.
 *
 * The interesting half of this is not the toolbar, it is the round trip. A
 * note goes to the server encrypted, comes back, and is sanitised at both
 * ends; the sanitiser keeps only the style properties it is told about, so a
 * mark can look perfect while you are writing it and be plain text after a
 * reload. That failure is silent and only shows up later, which is why this
 * test saves, asks the API what it actually stored, and then reloads and reads
 * the colours off the rendered page rather than trusting the editor.
 */
test("resaltar y subrayar en color sobrevive al guardado", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.marks.e2e@example.com",
    nickname: "editormarks",
    password: "EditorMarks28xxx",
  });

  const folder = await (
    await page.request.post("/api/folders", {
      data: { name: "Apuntes", description: "<p>Cita importante</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 20_000 });

  // Escape closes the palette and stops there. It used to reach the dialog's
  // own handler underneath and close the editor, so changing your mind about a
  // colour threw away everything typed since the last save.
  await page.getByRole("button", { name: "Resaltar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Quitar resaltado" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Quitar resaltado" })).toHaveCount(
    0,
  );
  await expect(editor).toBeVisible();

  // Select once, then hit both controls. Re-selecting between toolbar clicks
  // races TipTap's focus(), which restores the stored selection a frame later.
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");

  await page.getByRole("button", { name: "Resaltar", exact: true }).click();
  await page.getByRole("button", { name: "Resaltar en ámbar" }).click();
  await expect(editor.locator("span.ab-highlight")).toBeVisible();

  await page
    .getByRole("button", { name: "Color del texto y del subrayado" })
    .click();
  await page.getByRole("button", { name: "Subrayar en rojo" }).click();
  await expect(editor.locator("u[data-underline]")).toBeVisible();

  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  // What the server kept. Both marks carry their colour twice — in the style
  // that paints it and in the data attribute that survives a renderer which
  // drops styles — and both halves have to come back.
  await expect(async () => {
    const saved = await (
      await page.request.get(`/api/folders/${folder.id}`)
    ).json();
    expect(saved.description).toContain("data-highlight");
    expect(saved.description).toContain("background-color");
    expect(saved.description).toContain("data-underline");
    expect(saved.description).toContain("text-decoration-color");
  }).toPass({ timeout: 10_000 });

  // And what a reader sees: the client sanitises again on the way in, so the
  // colours have to be there after a reload, not merely in the database.
  await page.reload();
  const text = page.getByTestId("collapsible-text");
  const mark = text.locator("span.ab-highlight").first();
  await expect(mark).toBeVisible({ timeout: 20_000 });
  const bg = await mark.evaluate((el) => getComputedStyle(el).backgroundColor);
  // Transparent is what a stripped style looks like: the span is still there.
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");

  const underlined = text.locator("u").first();
  await expect(underlined).toBeVisible();
  expect(
    await underlined.evaluate((el) => getComputedStyle(el).textDecorationColor),
  ).toBe("rgb(220, 38, 38)");

  // Taking the highlighter off again, which is a different command from
  // putting it on and so is not covered by the above.
  await page.getByRole("button", { name: "Editar el texto" }).click();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Resaltar", exact: true }).click();
  await page.getByRole("button", { name: "Quitar resaltado" }).click();
  await expect(editor.locator("span.ab-highlight")).toHaveCount(0);

  await ctx.close();
});
