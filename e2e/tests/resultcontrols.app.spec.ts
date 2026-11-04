import { type APIRequestContext, type Browser, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

async function newUser(browser: Browser) {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "resultcontrols.e2e@example.com",
    nickname: "resultcontrols",
    password: "ResultControls28xx",
  });
  return { ctx, page, req: page.request };
}

async function post<T>(req: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await req.post(path, { data });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as T;
}

test("ordenar y acotar resultados en filtro global, carpeta y búsqueda de texto", async ({ browser }) => {
  const { ctx, page, req } = await newUser(browser);
  const tag = (await post<{ id: string }>(req, "/api/tags", { name: "lectura", color: "#16a34a" })).id;
  const folder = (await post<{ id: string }>(req, "/api/folders", { name: "Biblioteca", parentId: null })).id;
  const sub = (await post<{ id: string }>(req, "/api/folders", { name: "Novela", parentId: folder, tagIds: [tag] })).id;
  const bookmark = (title: string, extra: object = {}) =>
    post(req, "/api/bookmarks", {
      title,
      url: `https://example.com/${encodeURIComponent(title)}`,
      folderId: sub,
      tagIds: [tag],
      fetchSnapshot: false,
      ...extra,
    });
  await bookmark("Zafra libro");
  await bookmark("Ámbar libro", { favorite: true });
  await bookmark("Mapa libro");

  const titlesIn = async () =>
    page.locator('a[href^="/bookmark/"]').allTextContents();

  await page.goto(`/filter?tags=${tag}`);
  const controls = page.getByTestId("result-controls");
  await controls.getByLabel("Ordenar").selectOption("name");
  await expect(page).toHaveURL(/sort=name/);
  await expect.poll(titlesIn).toEqual(["Ámbar libro", "Mapa libro", "Zafra libro"]);
  await controls.getByRole("button", { name: "Bookmarks" }).click();
  await expect(page.getByRole("heading", { name: "Carpetas" })).toHaveCount(0);

  await page.goto(`/folder/${folder}?tags=${tag}`);
  await page.getByTestId("result-controls").getByRole("button", { name: "Solo favoritos" }).click();
  await expect(page).toHaveURL(/fav=1/);
  await expect(page.getByText("Zafra libro")).toHaveCount(0);
  await expect(page.getByText("Ámbar libro").first()).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtro" }).click();
  await expect(page).not.toHaveURL(/fav=1|tags=/);

  await page.goto("/search?q=libro");
  await page.getByTestId("result-controls").getByLabel("Ordenar").selectOption("name");
  await expect(page).toHaveURL(/sort=name/);
  await expect(page.locator('a.font-medium[href^="https://example.com/"]')).toHaveText(["Ámbar libro", "Mapa libro", "Zafra libro"]);
  await expect(page.getByTestId("folder-tag-filter")).toBeVisible();
  await ctx.close();
});
