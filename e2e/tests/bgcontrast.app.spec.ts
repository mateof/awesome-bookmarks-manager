import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A card with a dark custom background gets light text (`on-dark-bg`) and a
 * card with a light background gets dark text (`on-light-bg`), so the label
 * stays readable regardless of the theme.
 */
const user = {
  email: "nettie.stevens@example.com",
  nickname: "netties",
  password: "Chromosomes1905xx",
};

test("el texto se adapta al fondo oscuro/claro de carpetas y bookmarks", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  await req.post("/api/folders", {
    data: { name: "FondoOscuro", bgColor: "#0b0b0b" },
  });
  await req.post("/api/folders", {
    data: { name: "FondoClaro", bgColor: "#f5f5f5" },
  });
  const bm = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://x.example/",
        title: "BookOscuro",
        fetchSnapshot: false,
      },
    })
  ).json();
  await req.patch(`/api/bookmarks/${bm.id}`, { data: { bgColor: "#101010" } });

  await page.goto("/");

  const card = (text: string) =>
    page.locator("div.group.relative").filter({ hasText: text }).first();

  await expect(card("FondoOscuro")).toHaveClass(/on-dark-bg/);
  await expect(card("FondoClaro")).toHaveClass(/on-light-bg/);
  await expect(card("BookOscuro")).toHaveClass(/on-dark-bg/);
});
