import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Inside a panel, going down into a subfolder shows an "up one level" button
 * (mirrors the folder page), so viewers can climb back without the breadcrumb.
 */
const user = {
  email: "grace.chisholm@example.com",
  nickname: "gracec",
  password: "MathTripos1893xx",
};

test("panel: botón subir de nivel al entrar en una subcarpeta", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const rootF = await (
    await req.post("/api/folders", { data: { name: "PanelRoot" } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://raiz.example/",
      title: "Raiz",
      folderId: rootF.id,
      fetchSnapshot: false,
    },
  });
  const sub = await (
    await req.post("/api/folders", { data: { name: "Sub", parentId: rootF.id } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://interno.example/",
      title: "Interno",
      folderId: sub.id,
      fetchSnapshot: false,
    },
  });

  await req.post("/api/panels", {
    data: {
      title: "Mi Panel",
      slug: "mipanel",
      folderId: rootF.id,
      accessMode: "public",
    },
  });

  // The panel snapshot is materialized asynchronously; retry until it shows.
  await expect(async () => {
    await page.goto("/panel/mipanel");
    await expect(page.getByText("Raiz", { exact: true })).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 30_000 });

  // At the root there is no up button yet.
  await expect(
    page.getByRole("button", { name: "Subir de nivel" }),
  ).toHaveCount(0);

  // Go into the subfolder.
  await page.getByRole("button", { name: /Sub/ }).click();
  await expect(page.getByText("Interno", { exact: true })).toBeVisible();
  const up = page.getByRole("button", { name: "Subir de nivel" });
  await expect(up).toBeVisible();

  // Climb back to the root.
  await up.click();
  await expect(page.getByText("Raiz", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Subir de nivel" }),
  ).toHaveCount(0);
});
