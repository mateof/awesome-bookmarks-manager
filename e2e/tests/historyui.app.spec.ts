import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The history dialog as the user drives it: versions listed after edits,
 * restoring from the list, duplicating a past version, and the activity tab of
 * a folder.
 */
const user = {
  email: "history.ui.e2e@example.com",
  nickname: "historyuiuser",
  password: "HistoryDialog2024x",
};

test("historial (UI): listar, restaurar y duplicar desde el diálogo", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Docs" } })
  ).json();
  const bm = await (
    await req.post("/api/bookmarks", {
      data: { url: "https://hist.example/", title: "Titulo A", folderId: folder.id, fetchSnapshot: false },
    })
  ).json();
  await req.patch(`/api/bookmarks/${bm.id}`, { data: { title: "Titulo B" } });

  // Open the bookmark and its history.
  await page.goto(`/bookmark/${bm.id}`);
  await expect(page.getByRole("heading", { name: "Titulo B" })).toBeVisible();
  await page.getByRole("button", { name: "Historial" }).click();
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();

  // Both revisions are listed, newest first.
  const restoreButtons = page.getByRole("button", { name: "Restaurar" });
  const forkButtons = page.getByRole("button", { name: "Duplicar" });
  await expect(restoreButtons).toHaveCount(2);
  await expect(page.getByText(/Versión 2/)).toBeVisible();
  await expect(page.getByText(/Versión 1/)).toBeVisible();

  // Restore the oldest one (last row): the title goes back to "Titulo A".
  await restoreButtons.last().click();
  await expect(page.getByText("Restaurado a esa versión.")).toBeVisible();

  // A third revision now exists (the restore itself is recorded).
  await expect(restoreButtons).toHaveCount(3);
  await expect(page.getByText(/Versión 3/)).toBeVisible();

  // Duplicate that same old version into a new bookmark.
  await forkButtons.last().click();
  await expect(page.getByText("Copia creada.")).toBeVisible();

  // Close and check the outcome: the bookmark was restored and a copy exists.
  await page.getByRole("button", { name: "Cerrar" }).first().click();
  await expect(page.getByRole("heading", { name: "Titulo A" })).toBeVisible();

  const all = await (await req.get(`/api/bookmarks?folderId=${folder.id}`)).json();
  expect(all).toHaveLength(2);

  // The folder's activity tab lists events for the folder and its bookmarks.
  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Más acciones" }).first().click();
  await page.getByRole("button", { name: "Historial" }).click();
  await page.getByRole("button", { name: "Actividad" }).click();
  await expect(page.getByText("Sin actividad todavía.")).toHaveCount(0);
  await expect(page.getByText("Titulo A").first()).toBeVisible();
});
