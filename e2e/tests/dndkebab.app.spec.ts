import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Regression: the 3-dots (kebab) menu lives inside a @dnd-kit sortable card.
 * Pressing and moving on the kebab (or its menu items) must NOT start a drag
 * of the card. Before the fix, the pointer event bubbled up the React tree to
 * the card's drag sensor, so interacting with the menu dragged the card
 * (it turned semi-transparent) and swallowed the click.
 */
const user = {
  email: "evelyn.boyd@example.com",
  nickname: "evelynb",
  password: "GraceMentored1957x",
};
const user2 = {
  email: "joan.feynman@example.com",
  nickname: "joanf",
  password: "AuroraPhysics1960x",
};

test("el kebab no inicia un arrastre de la tarjeta", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);

  // Two bookmarks at root: source (position 0) and target (position 1).
  await page.request.post("/api/bookmarks", {
    data: { url: "https://src.example/", title: "ZDragSrc", fetchSnapshot: false },
  });
  await page.request.post("/api/bookmarks", {
    data: { url: "https://tgt.example/", title: "ZDropTgt", fetchSnapshot: false },
  });

  await page.goto("/");
  await expect(page.getByText("ZDragSrc", { exact: true })).toBeVisible();
  await expect(page.getByText("ZDropTgt", { exact: true })).toBeVisible();

  const srcCard = page
    .locator("div.group.relative")
    .filter({ hasText: "ZDragSrc" })
    .first();
  const tgtCard = page
    .locator("div.group.relative")
    .filter({ hasText: "ZDropTgt" })
    .first();
  const kebab = srcCard.getByRole("button", { name: "Más acciones" });

  const kb = await kebab.boundingBox();
  const tb = await tgtCard.boundingBox();
  if (!kb || !tb) throw new Error("missing bounding boxes");

  // Press on the kebab and drag toward the other card, holding the button.
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 10 });

  // While held: the source card must not be in the dragging state (dnd-kit
  // sets opacity 0.4 on the dragged sortable).
  const opacity = await srcCard.evaluate(
    (el) => getComputedStyle(el).opacity,
  );
  expect(Number(opacity)).toBeGreaterThan(0.9);

  await page.mouse.up();

  // And the order is unchanged (no reorder happened).
  const bms = await (await page.request.get("/api/bookmarks")).json();
  const sorted = [...bms].sort(
    (a: { position: number }, b: { position: number }) =>
      a.position - b.position,
  );
  expect(sorted[0].title).toBe("ZDragSrc");
  expect(sorted[1].title).toBe("ZDropTgt");
});

test("una opción del kebab se puede pulsar aunque tape otra tarjeta (grid)", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  // sm+ so the desktop dropdown shows, but < md so the grid is a single
  // column and the two cards stack (the dropdown overlaps the one below).
  await page.setViewportSize({ width: 700, height: 800 });
  await signup(page, user2);

  await page.request.post("/api/bookmarks", {
    data: {
      url: "https://top.example/",
      title: "TopCard",
      fetchSnapshot: false,
    },
  });
  await page.request.post("/api/bookmarks", {
    data: {
      url: "https://bottom.example/",
      title: "BottomCard",
      fetchSnapshot: false,
    },
  });

  await page.goto("/"); // grid is the default view

  const topCard = page
    .locator("div.group.relative")
    .filter({ hasText: "TopCard" })
    .first();
  await topCard.getByRole("button", { name: "Más acciones" }).click();

  // The portalled dropdown sits above the card below, so the option is
  // clickable and opens the appearance dialog instead of starting a drag.
  await page.getByRole("button", { name: "Apariencia" }).click();
  await expect(
    page.getByRole("heading", { name: "Apariencia" }),
  ).toBeVisible();
});
