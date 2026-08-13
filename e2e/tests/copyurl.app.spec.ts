import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A copy-URL button next to the URL copies the plain URL; the kebab's "copy
 * title and URL" copies a Markdown link (the text/plain half of the rich copy).
 */
const user = {
  email: "cecilia.payne@example.com",
  nickname: "ceciliap",
  password: "StellarSpectra1925",
};

test("copiar la URL y copiar título+URL como enlace", async ({ browser }) => {
  const ctx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);

  await page.request.post("/api/bookmarks", {
    data: {
      url: "https://copytest.example/",
      title: "MiBook",
      fetchSnapshot: false,
    },
  });

  await page.goto("/");
  const card = page
    .locator("div.group.relative")
    .filter({ hasText: "MiBook" })
    .first();

  // Copy just the URL.
  await card.getByRole("button", { name: "Copiar URL" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("https://copytest.example/");

  // Copy title + URL as a Markdown link from the kebab.
  await card.getByRole("button", { name: "Más acciones" }).click();
  await page.getByRole("button", { name: "Copiar título y URL" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("[MiBook](https://copytest.example/)");
});
