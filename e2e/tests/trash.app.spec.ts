import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The trash. Deletes were always soft, so what is under test is the other
 * half: that a cascade delete comes back as one piece, that a restore lands
 * the items where they were, and that purging is the only thing that actually
 * destroys data.
 */
const user = {
  email: "trash.restore.e2e@example.com",
  nickname: "trashuser",
  password: "SoftDeletesLive26",
};

test("restaurar una carpeta borrada devuelve todo su contenido", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const parent = await (
    await req.post("/api/folders", { data: { name: "Proyecto" } })
  ).json();
  const child = await (
    await req.post("/api/folders", {
      data: { name: "Notas", parentId: parent.id },
    })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://dentro.example/",
      title: "Enlace dentro",
      folderId: child.id,
      fetchSnapshot: false,
    },
  });
  const loose = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://suelto.example/",
        title: "Enlace suelto",
        fetchSnapshot: false,
      },
    })
  ).json();

  // Empty to start with.
  await page.goto("/trash");
  await expect(page.getByRole("heading", { name: "Papelera" })).toBeVisible();
  await expect(page.getByText("La papelera está vacía.")).toBeVisible();

  // Delete the parent (cascade) and the loose bookmark (on its own).
  await req.delete(`/api/folders/${parent.id}`);
  await req.delete(`/api/bookmarks/${loose.id}`);

  await page.reload();
  await expect(page.getByText("La papelera está vacía.")).toHaveCount(0);

  // The cascade collapses into one card naming the folder the user deleted,
  // with the rest of the subtree folded inside it. Two cards in total: the
  // folder and the separately-deleted bookmark.
  const cards = page.getByTestId("trash-item");
  await expect(cards).toHaveCount(2);
  const folderCard = cards.filter({ hasText: "Proyecto" });
  await expect(folderCard).toHaveCount(1);
  await expect(folderCard).toContainText("Incluye 2 elementos más");
  // The children are not cards of their own; they sit behind the disclosure.
  await expect(page.getByText("Notas", { exact: true })).toBeHidden();
  await folderCard.getByText("Ver contenido").click();
  await expect(page.getByText("Notas", { exact: true })).toBeVisible();
  await expect(page.getByText("Enlace dentro", { exact: true })).toBeVisible();

  // The loose bookmark is its own card, with no contents.
  await expect(cards.filter({ hasText: "Enlace suelto" })).toHaveCount(1);

  // Restoring the folder brings back all three rows at once.
  await folderCard.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText(/Restaurados 3 elementos/)).toBeVisible();

  // Back in place, nested exactly as before.
  await page.goto(`/folder/${child.id}`);
  await expect(page.getByText("Enlace dentro", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notas" })).toBeVisible();

  // The loose bookmark stayed in the trash: restoring a folder must not
  // resurrect things deleted in a different action.
  await page.goto("/trash");
  const remaining = page.getByTestId("trash-item");
  await expect(remaining).toHaveCount(1);
  await expect(remaining).toContainText("Enlace suelto");
  // "Proyecto" is back in the sidebar, so scope the check to the trash list.
  await expect(remaining.filter({ hasText: "Proyecto" })).toHaveCount(0);

  // Emptying the trash is the only destructive step, and it is explicit.
  await page.getByRole("button", { name: "Vaciar papelera" }).click();
  await expect(page.getByText("La papelera está vacía.")).toBeVisible();
  await expect(page.getByTestId("trash-item")).toHaveCount(0);

  // Purged for real: the row is gone from the API, not just hidden.
  const stillThere = await req.get(`/api/bookmarks/${loose.id}`);
  expect(stillThere.status()).toBe(404);
});
