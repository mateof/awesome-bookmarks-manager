import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Multi-tag filtering: chips toggle tags, and with two or more selected the
 * "Todas / Alguna" switch decides between AND and OR. The selection lives in
 * the URL so a filter can be shared and the back button works.
 */
const user = {
  email: "tag.filter.e2e@example.com",
  nickname: "tagfilteruser",
  password: "AndOrFiltering24x",
};

test("filtrar por varios tags con Y y con O", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const dev = await (
    await req.post("/api/tags", { data: { name: "dev", color: "#2563eb" } })
  ).json();
  const urgente = await (
    await req.post("/api/tags", { data: { name: "urgente", color: "#dc2626" } })
  ).json();

  // Ambos, solo dev, solo urgente, y ninguno.
  await req.post("/api/bookmarks", {
    data: { url: "https://ambos.example/", title: "Ambos", tagIds: [dev.id, urgente.id], fetchSnapshot: false },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://solodev.example/", title: "SoloDev", tagIds: [dev.id], fetchSnapshot: false },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://solourg.example/", title: "SoloUrgente", tagIds: [urgente.id], fetchSnapshot: false },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://ninguno.example/", title: "Ninguno", fetchSnapshot: false },
  });

  await page.goto("/filter");
  await expect(page.getByRole("heading", { name: "Filtrar por tags" })).toBeVisible();
  // Nothing selected yet: no results, just the hint.
  await expect(page.getByText(/Elige uno o más tags/)).toBeVisible();

  const chip = (name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) });

  // One tag behaves like the old single-tag view.
  await chip("dev").click();
  await expect(page.getByText("Ambos", { exact: true })).toBeVisible();
  await expect(page.getByText("SoloDev", { exact: true })).toBeVisible();
  await expect(page.getByText("SoloUrgente", { exact: true })).toHaveCount(0);

  // Two tags default to OR: everything carrying either one.
  await chip("urgente").click();
  await expect(page.getByText("Ambos", { exact: true })).toBeVisible();
  await expect(page.getByText("SoloDev", { exact: true })).toBeVisible();
  await expect(page.getByText("SoloUrgente", { exact: true })).toBeVisible();
  await expect(page.getByText("Ninguno", { exact: true })).toHaveCount(0);

  // Switching to AND narrows it to the one carrying both.
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await expect(page.getByText("Ambos", { exact: true })).toBeVisible();
  await expect(page.getByText("SoloDev", { exact: true })).toHaveCount(0);
  await expect(page.getByText("SoloUrgente", { exact: true })).toHaveCount(0);

  // The filter is in the URL, so it survives a reload and can be shared.
  expect(page.url()).toContain("m=all");
  await page.reload();
  await expect(page.getByText("Ambos", { exact: true })).toBeVisible();
  await expect(page.getByText("SoloDev", { exact: true })).toHaveCount(0);

  // Back to OR, then clear.
  await page.getByRole("button", { name: "Alguna", exact: true }).click();
  await expect(page.getByText("SoloDev", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Limpiar" }).click();
  await expect(page.getByText(/Elige uno o más tags/)).toBeVisible();

  // Old single-tag links still work: they land on the filter with that tag on.
  await page.goto(`/tag/${dev.id}`);
  await expect(page).toHaveURL(/\/filter\?tags=/);
  await expect(page.getByText("SoloDev", { exact: true })).toBeVisible();
});
