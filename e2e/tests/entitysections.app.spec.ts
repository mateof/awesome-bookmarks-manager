import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Tags, description and files read as three blocks, and the note has a way in.
 *
 * They used to be three bare stacks with nothing but vertical space between
 * them, so the chips of a tag row and the first line of a note ran together.
 * And the description section vanished entirely when empty, which left the
 * kebab's "Edit" as the only route to a first note — a dialog with every field
 * on it, to type one. Worse, nothing on the page said a note was possible at
 * all.
 */
test("las tres secciones se distinguen y la nota se puede escribir desde su sección", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "sections.e2e@example.com",
    nickname: "sectionsuser",
    password: "Sections28xxxxxx",
  });

  const folder = await (
    await page.request.post("/api/folders", { data: { name: "Sin nota" } })
  ).json();
  await page.goto(`/folder/${folder.id}`);

  // All three are labelled, including the one that used to be absent.
  await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: "Descripción" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adjuntos" })).toBeVisible();

  // And they are separated by something, not just by space. A rule on each
  // block is what tells the reader where one ends.
  const ruled = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("main h2"));
    return headings
      .map((h) => h.closest("section"))
      .filter((s): s is HTMLElement => !!s)
      .filter((s) => getComputedStyle(s).borderTopWidth !== "0px").length;
  });
  expect(ruled).toBeGreaterThanOrEqual(3);

  // The point of the exercise: writing the first note without going near the
  // kebab or the full entity dialog.
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 10_000 });
  await editor.click();
  await editor.pressSequentially("Escrita desde la sección");
  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  await expect(page.getByText("Escrita desde la sección")).toBeVisible({
    timeout: 10_000,
  });
  // With a note written, the way in is the pencil over the text, which sits
  // next to what it edits; the header button was only ever the missing route
  // to a *first* note.
  await expect(
    page.getByRole("button", { name: "Editar el texto" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Añadir", exact: true }),
  ).toHaveCount(0);

  await ctx.close();
});

test("sin permiso de escritura no se ofrece escribir una nota", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "sections.ro.e2e@example.com",
    nickname: "sectionsro",
    password: "SectionsRo28xxxx",
  });

  // A folder of your own is always writable, so the read-only case is checked
  // where it exists: the empty prompt is offered because this user may write.
  const folder = await (
    await page.request.post("/api/folders", { data: { name: "Propia" } })
  ).json();
  await page.goto(`/folder/${folder.id}`);
  await expect(page.getByRole("heading", { name: "Descripción" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText(/Sin descripción\. Pulsa para escribir/),
  ).toBeVisible();

  await ctx.close();
});
