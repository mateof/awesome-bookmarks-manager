import { expect, test } from "@playwright/test";
import { openFolder, seedSpanish, signup } from "../fixtures/app.js";

/**
 * The selection action bar belongs to the folder you are looking at. Moving to
 * another folder must clear it: the page component stays mounted across
 * /folder/:id changes, so the bar used to linger with a count referring to
 * items no longer on screen.
 *
 * Navigation here is in-app (clicks), never page.goto: a full reload remounts
 * React and would reset the selection on its own, hiding the bug.
 */
const user = {
  email: "selection.reset.e2e@example.com",
  nickname: "selresetuser",
  password: "ClearOnNavigate24",
};

test("selección: se limpia al cambiar de carpeta", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const parent = await (
    await req.post("/api/folders", { data: { name: "Padre" } })
  ).json();
  await req.post("/api/folders", { data: { name: "Hija", parentId: parent.id } });
  await req.post("/api/folders", { data: { name: "Hermana" } });
  await req.post("/api/bookmarks", {
    data: { url: "https://enpadre.example/", title: "EnPadre", folderId: parent.id, fetchSnapshot: false },
  });

  const bar = page.getByText(/seleccionad/i);
  const selectBookmark = async () => {
    const card = page
      .locator("div.group.relative")
      .filter({ hasText: "EnPadre" })
      .first();
    await card.getByRole("checkbox").first().check();
    await expect(bar).toBeVisible();
  };

  // One real page load, then everything else is client-side navigation.
  await page.goto("/");
  await openFolder(page, "Padre");
  await selectBookmark();

  // Down into a subfolder.
  await openFolder(page, "Hija");
  await expect(bar).toHaveCount(0);

  // Back up via the breadcrumb, select again, then sideways from the sidebar.
  await page.getByRole("button", { name: "Subir de nivel" }).click();
  await expect(page.getByText("EnPadre", { exact: true }).first()).toBeVisible();
  await selectBookmark();
  await page.getByRole("link", { name: "Hermana", exact: true }).first().click();
  await expect(page).toHaveURL(/\/folder\//);
  await expect(bar).toHaveCount(0);

  // And back to the root through the sidebar's "Inicio".
  await page.getByRole("link", { name: "Padre", exact: true }).first().click();
  await selectBookmark();
  await page.getByRole("link", { name: "Inicio", exact: true }).first().click();
  await expect(bar).toHaveCount(0);
});
