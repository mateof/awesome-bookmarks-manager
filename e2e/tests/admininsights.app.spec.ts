import { expect, test } from "@playwright/test";
import { admin } from "../fixtures/data.js";
import { createFolder, login, seedSpanish, signup } from "../fixtures/app.js";

/**
 * The admin panel: what everyone stores, broken down, plus how the instance is
 * used.
 *
 * The assertion that matters most is the last one. The panel is metadata by
 * necessity — an admin holds nobody's key — and the easy way to "improve" it
 * later is to join in a folder name. Doing that has to fail a test rather than
 * look like a nice touch.
 */
test("el panel de admin desglosa el almacenamiento y no filtra contenido", async ({
  browser,
}) => {
  // Someone else's account, with content named distinctively enough that a leak
  // could not be a coincidence.
  const otherCtx = await browser.newContext();
  await seedSpanish(otherCtx);
  const other = await otherCtx.newPage();
  await signup(other, {
    email: "insights.other.e2e@example.com",
    nickname: "insightsother",
    password: "InsightsOther28xx",
  });
  await createFolder(other, "Carpeta Zzyzx privada");
  await otherCtx.close();

  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await login(page, admin);

  const data = await (await page.request.get("/api/admin/insights")).json();
  expect(data.users.length).toBeGreaterThanOrEqual(2);
  const them = data.users.find(
    (u: { email: string }) => u.email === "insights.other.e2e@example.com",
  );
  expect(them).toBeTruthy();
  expect(them.counts.folders).toBeGreaterThanOrEqual(1);
  // The breakdown is the thing that was asked for: not one number per account
  // but where those bytes went.
  expect(Object.keys(them.breakdown).sort()).toEqual([
    "attachments",
    "database",
    "icons",
    "images",
    "panelAssets",
    "snapshots",
  ]);
  // Admins see everyone, so the totals are the instance's, not the caller's.
  expect(data.instance.users).toBe(data.users.length);
  expect(data.instance.activity).toHaveLength(30);

  // Nothing sealed with somebody else's key can appear here, because the
  // server does not hold that key while this request runs.
  expect(JSON.stringify(data)).not.toContain("Zzyzx");

  await page.goto("/settings/insights");
  await expect(page.getByRole("heading", { name: "Panel" })).toBeVisible();
  await expect(page.getByText("La instancia")).toBeVisible();
  await expect(page.getByText("Almacenamiento por tipo")).toBeVisible();
  // The limit is stated on screen rather than left for an admin to discover by
  // concluding the page is broken.
  await expect(page.getByText(/Solo metadatos/)).toBeVisible();
  await expect(
    page.getByText("insights.other.e2e@example.com"),
  ).toBeVisible();
  await expect(page.getByText("Zzyzx")).toHaveCount(0);

  // Opening a row shows that account's per-type figures and its activity.
  await page.getByRole("button", { name: /insightsother/ }).click();
  await expect(page.getByText("Instantáneas de páginas").first()).toBeVisible();
  await expect(page.getByText("Última visita").first()).toBeVisible();

  await ctx.close();
});

test("un usuario normal no llega al panel", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "insights.plain.e2e@example.com",
    nickname: "insightsplain",
    password: "InsightsPlain28xx",
  });

  const res = await page.request.get("/api/admin/insights");
  expect(res.ok()).toBe(false);

  // And the tab is not offered, which is presentation; the check above is what
  // actually stops them. Scoped and exact, because "Panel" is a substring of
  // the sidebar's "Paneles" and Playwright matches accessible names loosely.
  await page.goto("/settings");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Panel", exact: true }),
  ).toHaveCount(0);

  await ctx.close();
});
