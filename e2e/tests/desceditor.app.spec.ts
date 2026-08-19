import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The pencil on a description.
 *
 * It opens an editor for the text alone rather than the whole edit dialog:
 * the full form is already one click away on the same page, and going through
 * the name, URL, tags and colours to change a note is the long way round.
 *
 * Because it sends only the description, it also cannot clobber a field
 * somebody else changed meanwhile — and it carries the rev it was showing, so
 * a real conflict is a 409 instead of a silent overwrite.
 */
const user = {
  email: "desc.editor.e2e@example.com",
  nickname: "desceditor",
  password: "PencilOnTheText26x",
};

test("lápiz en el texto de una carpeta: edita solo la descripción", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const tag = await (
    await req.post("/api/tags", { data: { name: "intacto", color: "#16a34a" } })
  ).json();
  const folder = await (
    await req.post("/api/folders", {
      data: {
        name: "Con notas",
        description: "<p>Texto original</p>",
        bgColor: "#123456",
        tagIds: [tag.id],
      },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await expect(page.getByText("Texto original")).toBeVisible();

  await page.getByRole("button", { name: "Editar el texto" }).click();
  await expect(
    page.getByRole("heading", { name: "Editar el texto de Con notas" }),
  ).toBeVisible();

  const editor = page.locator(".tiptap.ProseMirror");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Texto corregido");
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Texto corregido")).toBeVisible();

  // Everything else is untouched: a partial update is the point.
  const after = await (await req.get(`/api/folders/${folder.id}`)).json();
  expect(after.description).toContain("Texto corregido");
  expect(after.bgColor).toBe("#123456");
  expect(after.name).toBe("Con notas");
  expect(after.tagIds).toContain(tag.id);
});

test("lápiz en el texto de un bookmark, y vaciarlo lo quita del todo", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "desc.editor.bm.e2e@example.com",
    nickname: "desceditorbm",
    password: "EmptyMeansNone26xx",
  });
  const req = page.request;

  const bm = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://notas.example/",
        title: "Con notas",
        description: "<p>Apuntes que sobran</p>",
        fetchSnapshot: false,
      },
    })
  ).json();

  await page.goto(`/bookmark/${bm.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();

  const editor = page.locator(".tiptap.ProseMirror");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.getByRole("button", { name: "Guardar" }).click();

  // An empty editor means "no description", not an empty paragraph: otherwise
  // the text block (and its pencil) would stay on screen with nothing in it.
  await expect(page.getByRole("button", { name: "Editar el texto" })).toHaveCount(0);
  const after = await (await req.get(`/api/bookmarks/${bm.id}`)).json();
  expect(after.description).toBeNull();
});

test("el texto compartido no trae lápiz", async ({ browser }) => {
  // The pencil is only where the text is the reader's to change. A public
  // panel shows the same component and must not offer to edit it.
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "desc.editor.public.e2e@example.com",
    nickname: "desceditorpublic",
    password: "NoPencilInPublic26x",
  });
  const req = page.request;
  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Publica", description: "<p>Notas públicas</p>" },
    })
  ).json();
  await req.post("/api/panels", {
    data: {
      title: "Publica",
      slug: "sin-lapiz-e2e",
      folderId: folder.id,
      accessMode: "public",
      templateId: "builtin:grid",
    },
  });

  await page.goto("/panel/sin-lapiz-e2e");
  await expect(page.getByRole("button", { name: "Editar el texto" })).toHaveCount(0);
});
