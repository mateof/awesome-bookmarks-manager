import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A folder's notes sit above its contents, so a long one used to push every
 * bookmark below the fold. The description is capped at a fixed height and
 * scrolls inside that cap, and two controls offer the ways out: unfold it here
 * or open the whole thing in a dialog.
 *
 * The assertion that matters is not "the button exists" but "the bookmarks are
 * reachable without scrolling", which is the actual complaint, so the test
 * measures where the first bookmark lands on screen. It is also what caught
 * the cost of the section's frame and controls: they took about fifty pixels,
 * and the cap had to give them back rather than take them from the folder's
 * own contents.
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

test("una nota sin tabla tiene los dos controles, igual que una con tabla", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "both.controls.e2e@example.com",
    nickname: "bothcontrols",
    password: "BothControls26xx",
  });

  const folder = await (
    await page.request.post("/api/folders", {
      data: { name: "Sin tabla", description: LONG },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  const region = page.getByTestId("collapsible-text");
  await expect(region).toBeVisible({ timeout: 20_000 });

  // Both, on prose. They used to be split by whether the note happened to
  // contain a table, which was two features landing a version apart rather
  // than a rule anybody could state.
  const unfold = page.getByRole("button", { name: "Desplegar la descripción" });
  const full = page.getByRole("button", { name: "Ver completa" });
  await expect(unfold).toBeVisible();
  await expect(full).toBeVisible();

  // Folded is still the default: unfolding in place is what the cap exists to
  // prevent, so it has to be asked for rather than assumed.
  const capped = (await region.boundingBox())!.height;
  expect(capped).toBeLessThanOrEqual(210);

  await unfold.click();
  await expect(async () => {
    expect((await region.boundingBox())!.height).toBeGreaterThan(capped);
  }).toPass({ timeout: 5000 });
  await expect(
    page.getByRole("button", { name: "Replegar la descripción" }),
  ).toBeVisible();

  // And the dialog still works from the unfolded state: they are two ways of
  // reading, not two states of one control.
  await full.click();
  await expect(
    page.getByRole("heading", { name: "Texto completo" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await ctx.close();
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
