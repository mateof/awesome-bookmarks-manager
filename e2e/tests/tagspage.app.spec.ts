import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The tag management page with a real number of tags in it.
 *
 * A library grows tags faster than anything else: one import of a read-later
 * app brings hundreds at once. This page lists them all, and it is the only
 * place the unused ones appear, because the filter page hides those. Without a
 * search it is a flat alphabetical wall.
 */
test("tags: la pantalla de gestión se busca, sin acentos y diciendo qué esconde", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "tags.page.e2e@example.com",
    nickname: "tagspage",
    password: "TagsPage27xxxxx",
  });
  const req = page.request;

  await Promise.all(
    ["botánica", "botones", "cocina", "cocteles", "zapatos"].map((name) =>
      req.post("/api/tags", { data: { name } }),
    ),
  );

  await page.goto("/tags");
  await expect(page.getByRole("link", { name: "botánica" })).toBeVisible({
    timeout: 20_000,
  });

  const box = page.getByLabel("Buscar tags…");
  await box.fill("coc");
  await expect(page.getByRole("link", { name: "cocina" })).toBeVisible();
  await expect(page.getByRole("link", { name: "cocteles" })).toBeVisible();
  await expect(page.getByRole("link", { name: "zapatos" })).toHaveCount(0);
  // It says what it left out, not only what it found.
  await expect(page.getByText("3 ocultos")).toBeVisible();

  // Nobody wants to type an accent to find a tag.
  await box.fill("botanica");
  await expect(page.getByRole("link", { name: "botánica" })).toBeVisible();
  await expect(page.getByRole("link", { name: "botones" })).toHaveCount(0);

  // Nothing at all is a state of its own, not the same as having no tags.
  await box.fill("zzzz");
  await expect(page.getByText("Ningún tag coincide.")).toBeVisible();

  await ctx.close();
});
