import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Duplicate detection and merge. The interesting parts are that URL grouping
 * survives cosmetic differences (trailing slash, fragment, default port), and
 * that merging is additive: the keeper ends up with every tag, and the copies
 * land in the trash rather than being destroyed.
 */
const user = {
  email: "duplicates.merge.e2e@example.com",
  nickname: "duplicateuser",
  password: "SameUrlTwice2026x",
};

test("detectar duplicados y fusionarlos conservando los tags", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const docs = await (
    await req.post("/api/tags", { data: { name: "docs", color: "#2563eb" } })
  ).json();
  const util = await (
    await req.post("/api/tags", { data: { name: "util", color: "#16a34a" } })
  ).json();

  const original = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://duplicada.example/guia",
        title: "Guia original",
        tagIds: [docs.id],
        fetchSnapshot: false,
      },
    })
  ).json();
  // Same page: trailing slash and a fragment must not create a second entry.
  const copy = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://duplicada.example/guia/#seccion",
        title: "Guia copiada",
        tagIds: [util.id],
        fetchSnapshot: false,
      },
    })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://unica.example/",
      title: "Unica",
      fetchSnapshot: false,
    },
  });

  await page.goto("/duplicates");
  await expect(page.getByRole("heading", { name: "Duplicados" })).toBeVisible();

  const groups = page.getByTestId("duplicate-group");
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toContainText("Guia original");
  await expect(groups.first()).toContainText("Guia copiada");
  await expect(groups.first()).toContainText("2 copias");
  // The unique bookmark is not reported.
  await expect(page.getByText("Unica", { exact: true })).toHaveCount(0);

  // The oldest is proposed as the keeper.
  await expect(groups.first().getByText("Se queda")).toBeVisible();

  await page.getByRole("button", { name: /^Fusionar 1$/ }).click();
  await expect(page.getByText(/Fusionadas 1 copias/)).toBeVisible();
  await expect(page.getByText("No hay bookmarks duplicados.")).toBeVisible();

  // The keeper absorbed the other's tag; the copy went to the trash.
  const kept = await (await req.get(`/api/bookmarks/${original.id}`)).json();
  expect(kept.tagIds.sort()).toEqual([docs.id, util.id].sort());
  expect((await req.get(`/api/bookmarks/${copy.id}`)).status()).toBe(404);

  await page.goto("/trash");
  await expect(page.getByText("Guia copiada", { exact: true })).toBeVisible();

  // And a merge is undoable, which is the whole reason copies are not purged.
  await page
    .getByTestId("trash-item")
    .filter({ hasText: "Guia copiada" })
    .getByRole("button", { name: "Restaurar" })
    .click();
  await expect(page.getByText(/Restaurado 1 elemento/)).toBeVisible();
  await page.goto("/duplicates");
  await expect(page.getByTestId("duplicate-group")).toHaveCount(1);
});
