import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * With a long tag list the filter page needs a search box: typing narrows the
 * chips, accents don't matter, already-selected tags stay visible, and the most
 * used tags come first so the common ones need no typing at all.
 */
const user = {
  email: "tag.search.e2e@example.com",
  nickname: "tagsearchuser",
  password: "ManyTagsSearch24x",
};

test("filtro: buscador de tags con muchas etiquetas", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  // A realistic long list, plus one with an accent and one very used.
  const ids: string[] = [];
  for (let i = 0; i < 60; i++) {
    const r = await req.post("/api/tags", {
      data: { name: `tema-${String(i).padStart(2, "0")}`, color: "#64748b" },
    });
    ids.push((await r.json()).id);
  }
  const disenoId = (
    await (await req.post("/api/tags", { data: { name: "diseño", color: "#db2777" } })).json()
  ).id;
  const popularId = (
    await (await req.post("/api/tags", { data: { name: "popular", color: "#2563eb" } })).json()
  ).id;

  // Each tag needs at least one item to show up; "popular" gets several.
  for (const id of [...ids.slice(0, 5), disenoId]) {
    await req.post("/api/bookmarks", {
      data: { url: `https://x${id.slice(0, 6)}.example/`, title: `B-${id.slice(0, 4)}`, tagIds: [id], fetchSnapshot: false },
    });
  }
  for (let i = 0; i < 3; i++) {
    await req.post("/api/bookmarks", {
      data: { url: `https://pop${i}.example/`, title: `Pop${i}`, tagIds: [popularId], fetchSnapshot: false },
    });
  }

  await page.goto("/filter");
  const chips = page.locator("button[aria-pressed]");

  // The most used tag leads the list without typing anything.
  await expect(chips.first()).toContainText("popular");

  // Searching narrows the chips.
  const before = await chips.count();
  await page.getByPlaceholder("Buscar tags…").fill("tema-0");
  await expect.poll(() => chips.count()).toBeLessThan(before);
  await expect(page.getByRole("button", { name: /^popular/ })).toHaveCount(0);

  // Accents are ignored: "diseno" finds "diseño".
  await page.getByPlaceholder("Buscar tags…").fill("diseno");
  await expect(page.getByRole("button", { name: /^diseño/ })).toBeVisible();

  // A selected tag stays visible even when the search would hide it.
  await page.getByRole("button", { name: /^diseño/ }).click();
  await page.getByPlaceholder("Buscar tags…").fill("tema-01");
  await expect(page.getByRole("button", { name: /^diseño/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^tema-01/ })).toBeVisible();

  // Nonsense query: no chips, and a clear message.
  await page.getByPlaceholder("Buscar tags…").fill("zzzzz");
  await expect(page.getByText("Ningún tag coincide.")).toHaveCount(0); // selected one still shows
  await expect(page.getByRole("button", { name: /^diseño/ })).toBeVisible();
});
