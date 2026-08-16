import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * When a site has no reachable favicon the panel falls back to a letter tile.
 * The letter comes from the bookmark's name, not from the domain: "Hacker
 * News" must read as H even though it lives at news.ycombinator.com.
 */
const user = {
  email: "panel.letter.e2e@example.com",
  nickname: "panelletter",
  password: "InitialFromName24",
};

test("panel: la inicial del icono sale del nombre, no del dominio", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const root = await (
    await req.post("/api/folders", { data: { name: "Letras" } })
  ).json();
  // Name and domain start with different letters on purpose.
  await req.post("/api/bookmarks", {
    data: { url: "https://news.invalid.example/", title: "Hacker News", folderId: root.id, fetchSnapshot: false },
  });
  await req.post("/api/panels", {
    data: { title: "PanelLetras", slug: "panelletras", folderId: root.id, accessMode: "public" },
  });

  await expect(async () => {
    await page.goto("/panel/panelletras");
    await expect(page.getByText("Hacker News", { exact: true })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });

  // The favicon request fails for this domain, so the letter tile renders.
  await expect(page.getByText("H", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("N", { exact: true })).toHaveCount(0);
});
