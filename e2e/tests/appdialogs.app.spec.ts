import { expect, test } from "@playwright/test";
import {
  acceptDialog,
  createFolder,
  dismissDialog,
  seedSpanish,
  signup,
} from "../fixtures/app.js";

/**
 * Confirmations are the app's own components now, not `window.confirm`.
 *
 * The assertion that matters is not "a dialog appears" but that cancelling
 * really leaves the data alone: a confirmation that does not actually gate the
 * action is worse than none, because it teaches the user to trust it.
 */
const user = {
  email: "app.dialogs.e2e@example.com",
  nickname: "appdialogsuser",
  password: "OwnDialogsPlease26",
};

test("confirmación propia: cancelar no borra, confirmar sí", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();

  // A native dialog would be invisible to this listener's assertions, so
  // record any that slip through and fail if one does.
  const nativeDialogs: string[] = [];
  page.on("dialog", (d) => {
    nativeDialogs.push(d.message());
    void d.dismiss().catch(() => {});
  });

  await signup(page, user);
  await createFolder(page, "Carpeta frágil");

  await page.getByText("Carpeta frágil", { exact: true }).first().click();
  await page.waitForURL(/\/folder\//);

  const kebab = page.getByRole("button", { name: "Más acciones" }).first();
  // Two menu entries share the label (the page kebab and a card's); the page
  // one is first in DOM order.
  const deleteItem = page.getByRole("button", { name: "Eliminar carpeta" }).first();

  // Cancel: the folder survives.
  await kebab.click();
  await deleteItem.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Carpeta frágil");
  await dismissDialog(page);
  await expect(page.getByRole("heading", { name: "Carpeta frágil" })).toBeVisible();

  // Escape also means "no".
  await kebab.click();
  await deleteItem.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Carpeta frágil" })).toBeVisible();

  // Confirm: now it goes.
  await kebab.click();
  await deleteItem.click();
  await acceptDialog(page);
  await expect(page.getByText("Carpeta frágil", { exact: true })).toHaveCount(0);

  // Nothing ever reached the browser's own dialogs.
  expect(nativeDialogs, "no native window.confirm should be used").toEqual([]);
});
