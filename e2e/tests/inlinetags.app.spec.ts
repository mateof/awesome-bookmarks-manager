import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Tags on the detail of a folder or a bookmark: shown there, and editable
 * there.
 *
 * The folder you are standing in used to show none of its own tags at all
 * (only the cards of its subfolders had them), and a bookmark's were
 * read-only, so adding one meant the edit dialog.
 */
const user = {
  email: "inline.tags.e2e@example.com",
  nickname: "inlinetags",
  password: "TagsRightThere26xx",
};

test("tags de una carpeta: se ven y se añaden desde el propio detalle", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const tag = await (
    await req.post("/api/tags", { data: { name: "referencia", color: "#2563eb" } })
  ).json();
  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Con tags", bgColor: "#123456", tagIds: [tag.id] },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  // The tag it already has is on the page, without opening anything.
  await expect(page.getByRole("link", { name: "referencia" })).toBeVisible();

  await page.getByRole("button", { name: "Añadir tag" }).click();
  // The click's whole intent is to type, so the caret is already in the box:
  // no second click before writing.
  await expect(page.getByPlaceholder(/tag/i).first()).toBeFocused();
  await page.keyboard.type("urgente");
  await page.keyboard.press("Enter");

  // Saved on the spot, and the rest of the folder is untouched: the control
  // sends only the tag list.
  await expect(async () => {
    const after = await (await req.get(`/api/folders/${folder.id}`)).json();
    expect(after.tagIds).toHaveLength(2);
    expect(after.bgColor).toBe("#123456");
    expect(after.name).toBe("Con tags");
  }).toPass({ timeout: 5000 });

  await page.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByRole("link", { name: "urgente" })).toBeVisible();
});

test("tags de un bookmark: se añaden desde su ficha", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "inline.tags.bm.e2e@example.com",
    nickname: "inlinetagsbm",
    password: "TagsOnBookmark26xx",
  });
  const req = page.request;

  const bm = await (
    await req.post("/api/bookmarks", {
      data: { url: "https://tags.example/", title: "Sin tags", fetchSnapshot: false },
    })
  ).json();

  await page.goto(`/bookmark/${bm.id}`);
  // With no tags it still says so and offers the way in, rather than showing
  // nothing at all.
  await expect(page.getByText("Sin tags", { exact: true }).nth(1)).toBeVisible();

  await page.getByRole("button", { name: "Añadir tag" }).click();
  await page.getByPlaceholder(/tag/i).first().fill("leer");
  await page.keyboard.press("Enter");

  await expect(async () => {
    const after = await (await req.get(`/api/bookmarks/${bm.id}`)).json();
    expect(after.tagIds).toHaveLength(1);
  }).toPass({ timeout: 5000 });
});

test("el editor de texto se maximiza a pantalla completa, con sus botones", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 780 } });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "editor.max.e2e@example.com",
    nickname: "editormax",
    password: "FullScreenEditor26x",
  });
  const req = page.request;
  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Notas", description: "<p>Texto de partida</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();

  const editor = page.getByTestId("editor-scroll");
  const before = (await editor.boundingBox())!;

  await page.getByRole("button", { name: "Maximizar el editor" }).click();
  const after = (await editor.boundingBox())!;
  expect(after.height).toBeGreaterThan(before.height);
  expect(after.width).toBeGreaterThan(before.width);

  // The save buttons come along: the overlay covers the dialog they live in,
  // so without them here you would have to shrink it back just to save.
  await expect(page.getByRole("button", { name: "Guardar" })).toBeInViewport();

  // Escape restores instead of closing the dialog and losing the text.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Maximizar el editor" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Editar el texto de/ }),
  ).toBeVisible();
});

test("la caja de añadir tag se repliega al perder la atención", async ({
  browser,
}) => {
  // Everything in the picker saves as you go, so an open box holds nothing
  // unsent — but it reads like an unsaved form. Switching browser tab (blur
  // with no destination) or clicking elsewhere folds it back to the chips.
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "inline.tags.blur.e2e@example.com",
    nickname: "inlinetagsblur",
    password: "FoldOnFocusLoss26x",
  });
  const folder = await (
    await page.request.post("/api/folders", { data: { name: "Repliegue" } })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Añadir tag" }).click();
  const input = page.getByPlaceholder(/tag/i).first();
  await expect(input).toBeFocused();

  // A browser-tab switch is a window blur: the element blurs with nowhere for
  // the focus to go.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await expect(input).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Añadir tag" })).toBeVisible();

  // Adding a tag first must not be interrupted: the suggestion flow keeps the
  // focus inside, and the fold only happens after attention truly leaves.
  await page.getByRole("button", { name: "Añadir tag" }).click();
  await page.keyboard.type("valida");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Repliegue" }).click();
  await expect(page.getByPlaceholder(/tag/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "valida" })).toBeVisible();
});
