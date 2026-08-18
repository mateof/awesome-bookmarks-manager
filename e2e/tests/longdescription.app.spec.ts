import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A folder's notes sit above its contents, so a long one used to push every
 * bookmark below the fold. The description is now clamped with a "Ver más" /
 * "Ver menos" toggle.
 *
 * The assertion that matters is not "the button exists" but "the bookmarks are
 * reachable without scrolling", which is the actual complaint, so the test
 * measures where the first bookmark lands on screen.
 */
const user = {
  email: "long.description.e2e@example.com",
  nickname: "longdescuser",
  password: "TallNotesFold2026x",
};

const LONG = Array.from(
  { length: 40 },
  (_, i) => `<p>Parrafo ${i + 1} de unas notas verdaderamente largas.</p>`,
).join("");

test("descripción larga: se recorta, se despliega y se vuelve a replegar", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Con notas", description: LONG },
    })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://abajo.example/",
      title: "Bookmark del fondo",
      folderId: folder.id,
      fetchSnapshot: false,
    },
  });

  await page.goto(`/folder/${folder.id}`);
  const first = page.getByText("Parrafo 1 de unas notas", { exact: false });
  await expect(first).toBeVisible();

  const viewport = page.viewportSize()!.height;
  const target = page.getByText("Bookmark del fondo", { exact: true });

  // Collapsed: the bookmark is on screen instead of 40 paragraphs down.
  const collapsedTop = (await target.boundingBox())!.y;
  expect(
    collapsedTop,
    "the bookmark should be visible without scrolling",
  ).toBeLessThan(viewport);

  // The text block itself is clamped. (The clipped paragraphs are still in the
  // DOM and Playwright counts them as "visible" — an ancestor's overflow is
  // not visibility — so the height of the clamped region is what to assert.)
  const region = page.getByTestId("collapsible-text");
  const clampedHeight = (await region.boundingBox())!.height;
  expect(clampedHeight).toBeLessThanOrEqual(180);

  const more = page.getByRole("button", { name: "Ver más" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();

  // Expanded: the whole text is laid out and the bookmark got pushed down.
  const less = page.getByRole("button", { name: "Ver menos" });
  await expect(less).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(async () => (await region.boundingBox())!.height)
    .toBeGreaterThan(clampedHeight * 3);
  const expandedTop = (await target.boundingBox())!.y;
  expect(expandedTop).toBeGreaterThan(collapsedTop);

  // And it folds back to where it started.
  await less.click();
  await expect(page.getByRole("button", { name: "Ver más" })).toBeVisible();
  await expect
    .poll(async () => (await region.boundingBox())!.height)
    .toBeLessThanOrEqual(180);
  expect((await target.boundingBox())!.y).toBeCloseTo(collapsedTop, -1);
});

test("descripción corta: no aparece el botón", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "short.description.e2e@example.com",
    nickname: "shortdescuser",
    password: "ShortNotesPlain26x",
  });

  const folder = await (
    await page.request.post("/api/folders", {
      data: { name: "Nota breve", description: "<p>Dos palabras.</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await expect(page.getByText("Dos palabras.")).toBeVisible();
  // A control that does nothing is worse than no control.
  await expect(page.getByRole("button", { name: "Ver más" })).toHaveCount(0);
});
