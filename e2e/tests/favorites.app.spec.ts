import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Favourites: the star on a bookmark adds/removes it, the "Favoritos" bar lists
 * exactly the starred ones, and the API can filter by ?favorite=1.
 */
const user = {
  email: "favorites.e2e@example.com",
  nickname: "favoritesuser",
  password: "StarredBookmarks2024",
};

test("favoritos: añadir, listar en la barra y quitar", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  for (const [title, url] of [
    ["FavUno", "https://favuno.example/"],
    ["FavDos", "https://favdos.example/"],
  ]) {
    await req.post("/api/bookmarks", {
      data: { url, title, fetchSnapshot: false },
    });
  }

  await page.goto("/");
  const card = page
    .locator("div.group.relative")
    .filter({ hasText: "FavUno" })
    .first();

  // Nothing starred yet: the bar shows the empty state.
  await page.getByRole("button", { name: "Favoritos", exact: true }).click();
  await expect(page.getByText(/Aún no tienes favoritos/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Star "FavUno".
  await card.getByRole("button", { name: "Añadir a favoritos" }).click();
  await expect(card.getByRole("button", { name: "Quitar de favoritos" })).toBeVisible();

  // It shows up in the Favoritos bar, and the other one does not.
  await page.getByRole("button", { name: "Favoritos", exact: true }).click();
  const panel = page.locator("div.absolute.left-0.top-full");
  await expect(panel.getByText("FavUno", { exact: true })).toBeVisible();
  await expect(panel.getByText("FavDos", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The API filter agrees.
  const favs = await (await req.get("/api/bookmarks?favorite=1")).json();
  expect(favs.map((b: { title: string }) => b.title)).toEqual(["FavUno"]);

  // Un-star it again: back to the empty state.
  await card.getByRole("button", { name: "Quitar de favoritos" }).click();
  await expect(card.getByRole("button", { name: "Añadir a favoritos" })).toBeVisible();
  const none = await (await req.get("/api/bookmarks?favorite=1")).json();
  expect(none).toHaveLength(0);
});
