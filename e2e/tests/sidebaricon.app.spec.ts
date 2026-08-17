import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The sidebar shows each folder's real icon and clicking it opens a dialog to
 * change it, emojis included. Search, meanwhile, puts the current folder's own
 * contents first.
 */
const user = {
  email: "sidebar.icon.e2e@example.com",
  nickname: "sidebariconuser",
  password: "SidebarIcons2024x",
};

test("barra lateral: icono real y cambio desde el árbol", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "ConIcono" } })
  ).json();

  await page.goto("/");
  const tree = page.locator("nav").first();
  await expect(tree.getByText("ConIcono")).toBeVisible();

  // No icon yet: clicking the tree icon opens the dialog.
  await tree.getByRole("button", { name: "Cambiar icono" }).first().click();
  await expect(
    page.getByRole("heading", { name: /Icono de ConIcono/ }),
  ).toBeVisible();

  // Pick an emoji from the library and check it lands on the folder.
  await page.getByRole("button", { name: "Biblioteca" }).click();
  await page.getByRole("button", { name: "Emojis" }).click();
  await page.getByRole("button", { name: "🚀" }).first().click();

  await expect(async () => {
    const folders = await (await req.get("/api/folders")).json();
    const f = folders.find((x: { id: string }) => x.id === folder.id);
    expect(f.iconBlobPath).not.toBeNull();
  }).toPass({ timeout: 15_000 });

  // The tree now renders that icon as an image instead of the generic glyph.
  await page.getByRole("button", { name: "Cerrar" }).first().click();
  await expect(tree.locator("img").first()).toBeVisible();
});

test("buscador: primero los resultados de la carpeta actual", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "search.scope.e2e@example.com",
    nickname: "searchscopeuser",
    password: "ScopedResults24xx",
  });
  const req = page.request;

  const aqui = await (
    await req.post("/api/folders", { data: { name: "Aqui" } })
  ).json();
  const dentro = await (
    await req.post("/api/folders", { data: { name: "Dentro", parentId: aqui.id } })
  ).json();
  const otra = await (
    await req.post("/api/folders", { data: { name: "Otra" } })
  ).json();

  // Same word everywhere, so only the folder decides the order.
  await req.post("/api/bookmarks", {
    data: { url: "https://lejos.example/", title: "manzana lejos", folderId: otra.id, fetchSnapshot: false },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://cerca.example/", title: "manzana cerca", folderId: aqui.id, fetchSnapshot: false },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://hija.example/", title: "manzana hija", folderId: dentro.id, fetchSnapshot: false },
  });

  // From the root, no scope: plain scoring.
  await page.goto("/");
  await page.getByRole("button", { name: "Buscar…" }).click();
  await page.getByPlaceholder(/Buscar carpetas y bookmarks/).fill("manzana");
  await expect(page.getByText("manzana lejos")).toBeVisible();
  await page.keyboard.press("Escape");

  // Inside "Aqui", its own bookmark and its child's come before the outsider.
  await page.goto(`/folder/${aqui.id}`);
  await page.getByRole("button", { name: "Buscar…" }).click();
  await page.getByPlaceholder(/Buscar carpetas y bookmarks/).fill("manzana");

  const titles = page.locator('[data-idx] .font-medium');
  await expect(titles.first()).toBeVisible();
  const order = await titles.allInnerTexts();
  const idxCerca = order.indexOf("manzana cerca");
  const idxHija = order.indexOf("manzana hija");
  const idxLejos = order.indexOf("manzana lejos");
  expect(idxCerca).toBeLessThan(idxLejos);
  expect(idxHija).toBeLessThan(idxLejos);

  // The boost is visible, not just implied by the order: scoped results sit
  // under their own heading and carry an accent border.
  await expect(page.getByText("En esta carpeta")).toBeVisible();
  await expect(page.getByText("En el resto")).toBeVisible();
  const scopedRow = page.locator("[data-idx]").filter({ hasText: "manzana cerca" });
  await expect(scopedRow).toHaveClass(/border-blue-500/);

  // Icons are the real ones: a bookmark with no icon shows its letter tile.
  await expect(scopedRow.getByText("M", { exact: true })).toBeVisible();
});
