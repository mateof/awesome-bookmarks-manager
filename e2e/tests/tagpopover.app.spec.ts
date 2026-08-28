import { expect, test } from "@playwright/test";
import { openFolder, seedSpanish, signup } from "../fixtures/app.js";

/**
 * The tag suggestions float over the dialog instead of stretching it.
 *
 * In the flow, the list is part of the form: with a library of a few hundred
 * tags the dialog grew, its buttons went past the bottom of the screen, and
 * picking a tag meant scrolling through the whole form to see the options.
 * In a portal it lies on top, keeps its own scrollbar, and the dialog does not
 * move at all.
 */
test("tags: la lista flota sobre el diálogo y no lo estira", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "tag.popover.e2e@example.com",
    nickname: "tagpopover",
    password: "TagPopover27xxx",
  });
  const req = page.request;

  // Enough that the list has to scroll rather than merely being long.
  await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      req.post("/api/tags", { data: { name: `apunte-${String(i).padStart(2, "0")}` } }),
    ),
  );
  const folder = await (
    await req.post("/api/folders", { data: { name: "Notas" } })
  ).json();

  await page.goto("/");
  await openFolder(page, "Notas");
  await page.getByRole("button", { name: "Nuevo bookmark", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nuevo bookmark" })).toBeVisible();

  // Where the dialog's own button sits before the list exists. If the list
  // joined the form, this is what would be pushed down and off the screen.
  const crear = page.getByRole("button", { name: "Crear", exact: true });
  const before = (await crear.boundingBox())!.y;

  const tagBox = page.getByPlaceholder(/Tags|Añade tags/);
  await tagBox.fill("apunte");
  const list = page.getByTestId("tag-suggestions");
  await expect(list).toBeVisible();

  // Out of the dialog altogether: the panel hangs off `document.body`, which
  // is the only place no ancestor's `overflow` can clip it and no ancestor's
  // height can be changed by it.
  expect(
    await list.evaluate(
      (el) => el.parentElement?.parentElement === document.body,
    ),
  ).toBe(true);

  // The dialog has not moved a pixel.
  expect((await crear.boundingBox())!.y).toBe(before);

  // And the list carries its own scrollbar instead of handing thirty rows to
  // the dialog to find room for.
  expect(
    await list.evaluate((el) => {
      const box = el.parentElement!;
      return box.scrollHeight > box.clientHeight + 1;
    }),
  ).toBe(true);

  // Still usable: the first row is highlighted, so Enter takes it.
  await page.keyboard.press("Enter");
  await expect(page.getByText("apunte-00", { exact: true }).first()).toBeVisible();

  await ctx.close();
});
