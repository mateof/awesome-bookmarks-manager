import { type Browser, expect, test } from "@playwright/test";
import { seedSpanish, login, signup } from "../fixtures/app.js";

const user = {
  email: "appcapture.e2e@example.com",
  nickname: "appcapture",
  password: "AppCapture28xxxxx",
};

async function pageWithAgent(browser: Browser, userAgent?: string) {
  const ctx = await browser.newContext(userAgent ? { userAgent } : {});
  await seedSpanish(ctx);
  return { ctx, page: await ctx.newPage() };
}

test("«Capturar en la app» solo aparece dentro de la app Android que sabe abrirlo", async ({
  browser,
}) => {
  const first = await pageWithAgent(browser);
  await signup(first.page, user);
  const bm = await (
    await first.page.request.post("/api/bookmarks", {
      data: { url: "https://example.com/alta?x=1", title: "Alta", folderId: null, fetchSnapshot: false },
    })
  ).json();
  await first.page.goto(`/bookmark/${bm.id}`);
  await expect(first.page.getByTestId("automation-section")).toBeVisible();
  await expect(first.page.getByRole("link", { name: "Capturar en la app" })).toHaveCount(0);
  await first.ctx.close();

  const chrome = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";
  for (const [agent, shown] of [
    [`${chrome} AwesomeBookmarks/0.5.0`, false],
    [`${chrome} AwesomeBookmarks/0.6.0-debug`, true],
    [`${chrome} AwesomeBookmarks/1.0.0`, true],
  ] as const) {
    const { ctx, page } = await pageWithAgent(browser, agent);
    await login(page, user);
    await page.goto(`/bookmark/${bm.id}`);
    await expect(page.getByTestId("automation-section")).toBeVisible();
    const link = page.getByRole("link", { name: "Capturar en la app" });
    if (shown) {
      await expect(link).toHaveAttribute(
        "href",
        `abapp://capture?bookmark=${bm.id}&url=${encodeURIComponent("https://example.com/alta?x=1")}`,
      );
    } else {
      await expect(link, `${agent} cannot open it, so it is not offered`).toHaveCount(0);
    }
    await ctx.close();
  }
});
