import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Panel themes: a template with an animated scene + "list subfolders" renders a
 * decorative background and browsable child lists; per-panel overrides set the
 * heading, browser-tab title and emoji favicon. The template editor shows a
 * live preview that reacts to the chosen scene.
 */

const panelUser = {
  email: "emmy.noether@example.com",
  nickname: "emmyn",
  password: "AbstractAlgebra1882",
};

const editorUser = {
  email: "sofia.kovalevskaya@example.com",
  nickname: "sofiak",
  password: "PartialDiff1889xx",
};

test("panel: fondo de escena, título/icono de pestaña y listado de subcarpetas", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, panelUser);
  const req = page.request;

  // Tree: PanelRoot > Sub > SubSub, each with a bookmark.
  const root = await (
    await req.post("/api/folders", { data: { name: "PanelRoot" } })
  ).json();
  await req.post("/api/bookmarks", {
    data: { url: "https://raiz.example/", title: "Raiz", folderId: root.id, fetchSnapshot: false },
  });
  const sub = await (
    await req.post("/api/folders", { data: { name: "Sub", parentId: root.id } })
  ).json();
  await req.post("/api/bookmarks", {
    data: { url: "https://ensub.example/", title: "EnSub", folderId: sub.id, fetchSnapshot: false },
  });
  const subsub = await (
    await req.post("/api/folders", { data: { name: "SubSub", parentId: sub.id } })
  ).json();
  await req.post("/api/bookmarks", {
    data: { url: "https://profundo.example/", title: "Profundo", folderId: subsub.id, fetchSnapshot: false },
  });

  // Dragon Ball built-in carries scene "dragonballs" + folderPreview. Add the
  // per-panel identity overrides.
  await req.post("/api/panels", {
    data: {
      title: "Panel admin",
      slug: "temapanel",
      folderId: root.id,
      templateId: "builtin:dragonball",
      accessMode: "public",
      displayTitle: "Mi Panel Bonito",
      tabTitle: "Pestaña Custom",
      faviconEmoji: "🐉",
    },
  });

  await expect(async () => {
    await page.goto("/panel/temapanel");
    await expect(page.getByText("Raiz", { exact: true })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });

  // Animated background scene is rendered.
  await expect(page.locator(".pbg-dragonballs")).toBeVisible();

  // The heading uses the display-title override, not the folder name.
  await expect(page.getByRole("heading", { name: "Mi Panel Bonito" })).toBeVisible();

  // Browser tab title + emoji favicon overrides.
  await expect(page).toHaveTitle("Pestaña Custom");
  await expect
    .poll(() => page.locator('link[rel~="icon"]').getAttribute("href"))
    .toContain("data:image/svg+xml");

  // folderPreview: the subfolder "SubSub" is listed under the "Sub" card at the
  // root. Clicking it opens just that folder (its bookmark shows).
  const child = page.getByRole("button", { name: "SubSub", exact: true });
  await expect(child).toBeVisible();
  await child.click();
  await expect(page.getByText("Profundo", { exact: true })).toBeVisible();

  // Up one level opens the parent folder alone (its own bookmark shows).
  await page.getByRole("button", { name: "Subir de nivel" }).click();
  await expect(page.getByText("EnSub", { exact: true })).toBeVisible();
});

test("editor de plantilla: la previsualización refleja el fondo elegido", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, editorUser);

  await page.goto("/panels");
  await page.getByRole("button", { name: "Plantillas" }).click();
  await page.getByRole("button", { name: "Nueva", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Editor de plantilla" })).toBeVisible();

  // The live preview renders sample panels (desktop + mobile); no scene yet.
  await expect(page.getByText("Mis enlaces", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".pbg-galaxy")).toHaveCount(0);

  // Choosing the Galaxy scene makes both previews draw it immediately.
  await page.locator('select:has(option[value="galaxy"])').selectOption("galaxy");
  await expect(page.locator(".pbg-galaxy")).toHaveCount(2);
  await expect(page.locator(".pbg-galaxy").first()).toBeVisible();
});
