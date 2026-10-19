import { type APIRequestContext, type Browser, expect, test } from "@playwright/test";
import { seedSpanish, shot, signup } from "../fixtures/app.js";

async function newUser(browser: Browser) {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "folderfilter.e2e@example.com",
    nickname: "folderfilter",
    password: "FolderFilter28xxxx",
  });
  return { ctx, page, req: page.request };
}

async function post<T>(req: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await req.post(path, { data });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as T;
}

test("filtrar una carpeta por tags busca en sus subcarpetas y solo sugiere los tags que hay dentro", async ({
  browser,
}) => {
  const { ctx, page, req } = await newUser(browser);
  const tag = async (name: string) =>
    (await post<{ id: string }>(req, "/api/tags", { name, color: "#16a34a" })).id;
  const receta = await tag("receta");
  const rapida = await tag("rápida");
  const fuera = await tag("solo-fuera");

  const folder = async (name: string, parentId: string | null, tagIds: string[] = []) =>
    (await post<{ id: string }>(req, "/api/folders", { name, parentId, tagIds })).id;
  const cocina = await folder("Cocina", null);
  const postres = await folder("Postres", cocina, [receta]);
  const tartas = await folder("Tartas", postres);
  const otra = await folder("Otra carpeta", null);

  const bookmark = (title: string, folderId: string, tagIds: string[]) =>
    post(req, "/api/bookmarks", {
      title,
      url: `https://example.com/${encodeURIComponent(title)}`,
      folderId,
      tagIds,
      fetchSnapshot: false,
    });
  await bookmark("Lentejas", cocina, [receta]);
  await bookmark("Tarta de queso", tartas, [receta, rapida]);
  await bookmark("Flan", postres, [receta]);
  await bookmark("Pendiente de clasificar", tartas, []);
  await bookmark("Fuera del árbol", otra, [receta, fuera]);

  await page.goto(`/folder/${cocina}`);
  await page.getByRole("button", { name: "Filtrar por tags" }).click();
  const filter = page.getByTestId("folder-tag-filter");
  const input = filter.getByRole("textbox");
  await input.fill("rapi");
  const options = filter.getByRole("option");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("rápida");

  await input.fill("");
  await expect(
    filter.getByRole("option").filter({ hasText: "solo-fuera" }),
    "a tag that only lives outside this folder is not offered",
  ).toHaveCount(0);

  await input.fill("rece");
  await input.press("Enter");
  await expect(page).toHaveURL(new RegExp(`tags=${receta}`));
  await expect(page.getByText("Tarta de queso", { exact: true })).toBeVisible();
  await expect(page.getByText("Flan", { exact: true })).toBeVisible();
  await expect(page.getByText("Lentejas", { exact: true })).toBeVisible();
  await expect(page.getByText("Postres").first()).toBeVisible();
  await expect(page.getByText("Pendiente de clasificar", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Fuera del árbol", { exact: true })).toHaveCount(0);
  await expect(filter).toContainText("carpetas 1 · bookmarks 3");
  await shot(page, "67-folder-tag-filter");

  await input.fill("ráp");
  await input.press("Enter");
  await expect(page.getByText("Tarta de queso", { exact: true })).toBeVisible();
  await expect(page.getByText("Flan", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Lentejas", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("folder-tag-filter")).toContainText("rápida");
  await expect(page.getByText("Flan", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Quitar filtro" }).click();
  await expect(page).not.toHaveURL(/tags=/);
  await expect(page.getByText("Lentejas", { exact: true })).toBeVisible();
  await expect(page.getByText("Tarta de queso", { exact: true }), "without a filter only direct children show").toHaveCount(0);
  await ctx.close();
});
