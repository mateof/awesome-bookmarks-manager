import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The panel's own search: finds folders as well as links, opening a folder
 * navigates into it, Cmd/Ctrl+K opens the box, and dragging from inside the
 * field to outside the dialog must not close it.
 */
const user = {
  email: "panel.search.e2e@example.com",
  nickname: "panelsearchuser",
  password: "PanelSearchAll24x",
};

test("buscador del panel: carpetas, atajo y arrastre", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const root = await (
    await req.post("/api/folders", { data: { name: "PanelRoot" } })
  ).json();
  const sub = await (
    await req.post("/api/folders", { data: { name: "Documentacion", parentId: root.id } })
  ).json();
  await req.post("/api/bookmarks", {
    data: { url: "https://raiz.example/", title: "EnlaceRaiz", folderId: root.id, fetchSnapshot: false },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://dentro.example/", title: "EnlaceDentro", folderId: sub.id, fetchSnapshot: false },
  });
  await req.post("/api/panels", {
    data: { title: "Buscar", slug: "buscarpanel", folderId: root.id, accessMode: "public" },
  });

  await expect(async () => {
    await page.goto("/panel/buscarpanel");
    await expect(page.getByText("EnlaceRaiz", { exact: true })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });

  // The keyboard shortcut opens it, like the app's search.
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Buscar en el panel…");
  await expect(input).toBeVisible();

  // Dragging from inside the field to the backdrop does not close it.
  const box = (await input.boundingBox())!;
  await input.fill("Documenta");
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 6 });
  await page.mouse.move(30, 650, { steps: 6 });
  await page.mouse.up();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("Documenta");

  // Folders show up in the results and open on click.
  // Only search rows carry data-idx, so this can't hit the card behind.
  await page.locator("[data-idx]").filter({ hasText: "Documentacion" }).first().click();
  await expect(input).toHaveCount(0);
  await expect(page.getByText("EnlaceDentro", { exact: true })).toBeVisible();
  expect(page.url()).toContain("p=");
});
