import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A folder's notes sit above its contents, so a long one used to push every
 * bookmark below the fold. The description is capped at a fixed height and
 * scrolls *inside* that cap — unfolding in place just moved the problem — and
 * a maximise button opens the whole text in a full-screen dialog.
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

test("descripción larga: tope con scroll interno y vista completa", async ({
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

  // Capped: the bookmark is on screen instead of 40 paragraphs down.
  expect(
    (await target.boundingBox())!.y,
    "the bookmark should be visible without scrolling",
  ).toBeLessThan(viewport);

  // The cap never grows: the overflow lives in the region's own scrollbar.
  const region = page.getByTestId("collapsible-text");
  expect((await region.boundingBox())!.height).toBeLessThanOrEqual(248);
  const scrollable = await region.evaluate(
    (el) => el.scrollHeight > el.clientHeight + 8,
  );
  expect(scrollable, "the clipped text should scroll inside the cap").toBe(true);
  await region.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(() => region.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);

  // Maximise: the whole text in a dialog, last paragraph reachable.
  await page.getByRole("button", { name: "Ver completa" }).click();
  await expect(
    page.getByRole("heading", { name: "Texto completo" }),
  ).toBeVisible();
  // The capped copy behind the dialog still holds the paragraph; take the
  // dialog's one.
  const inDialog = page
    .getByText("Parrafo 40 de unas notas", { exact: false })
    .nth(1);
  await inDialog.scrollIntoViewIfNeeded();
  await expect(inDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Texto completo" }),
  ).toHaveCount(0);
});

test("descripción corta: sin scroll y sin botón de vista completa", async ({
  browser,
}) => {
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
  await expect(page.getByRole("button", { name: "Ver completa" })).toHaveCount(0);
});
