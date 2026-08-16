import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  createBookmark,
  createFolder,
  openFolder,
  seedSpanish,
  shot,
  signup,
} from "../fixtures/app.js";
import {
  ada,
  alan,
  folders,
  group,
  panel,
  recipeBookmarks,
  researchBookmarks,
} from "../fixtures/data.js";

test.describe.configure({ mode: "serial" });

let ctxA: BrowserContext; // Ada — first user, becomes admin
let pageA: Page;
let ctxB: BrowserContext; // Alan — invited collaborator
let pageB: Page;

let publicSlug = panel.slug;
let passwordSlug = "recetas";

test.afterAll(async () => {
  await ctxA?.close();
  await ctxB?.close();
});

test("01 · registro del primer usuario (admin)", async ({ browser }) => {
  ctxA = await browser.newContext();
  await seedSpanish(ctxA);
  pageA = await ctxA.newPage();

  await pageA.goto("/login");
  await expect(pageA.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await shot(pageA, "01-login");

  await pageA.goto("/signup");
  await expect(pageA.getByRole("heading", { name: "Crear cuenta" })).toBeVisible();
  await shot(pageA, "02-signup");

  await signup(pageA, ada);
  await expect(pageA).toHaveURL(/\/$/);
  await shot(pageA, "03-home-empty");
});

test("02 · crear carpetas", async () => {
  // Open the create-folder dialog manually to capture it before submitting.
  await pageA.getByRole("button", { name: "Nueva carpeta", exact: true }).click();
  await expect(pageA.getByRole("heading", { name: "Nueva carpeta" })).toBeVisible();
  await pageA.getByPlaceholder("Nombre", { exact: true }).fill(folders.research);
  const editor = pageA.getByRole("textbox", { name: "Descripción" });
  if (await editor.count())
    await editor.first().fill("Referencias, papers y documentación.");
  await shot(pageA, "04-folder-dialog");
  await pageA.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(pageA.getByRole("heading", { name: "Nueva carpeta" })).toBeHidden();

  await createFolder(pageA, folders.recipes, "Recetas para el finde.");

  await pageA.goto("/");
  await expect(
    pageA.getByText(folders.research, { exact: true }).first(),
  ).toBeVisible();
  await shot(pageA, "05-folders");
});

test("03 · añadir bookmarks y una subcarpeta", async () => {
  await openFolder(pageA, folders.research);

  // Capture the new-bookmark dialog on the first one.
  const b0 = researchBookmarks[0]!;
  await pageA.getByRole("button", { name: "Nuevo bookmark", exact: true }).click();
  await expect(pageA.getByRole("heading", { name: "Nuevo bookmark" })).toBeVisible();
  await pageA.getByPlaceholder("https://…", { exact: true }).fill(b0.url);
  await pageA.getByPlaceholder(/^Título/).fill(b0.title);
  const editor = pageA.getByRole("textbox", { name: "Descripción" });
  if (await editor.count()) await editor.first().fill(b0.description);
  for (const tag of b0.tags) {
    const ti = pageA.getByPlaceholder(/Tags|Añade tags/);
    await ti.fill(tag);
    await ti.press("Enter");
  }
  await shot(pageA, "06-bookmark-dialog");
  await pageA.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(pageA.getByRole("heading", { name: "Nuevo bookmark" })).toBeHidden();

  for (const b of researchBookmarks.slice(1)) await createBookmark(pageA, b);
  await createFolder(pageA, folders.papers, "Lecturas pendientes.");

  await expect(pageA.getByText(b0.title, { exact: true }).first()).toBeVisible();
  await shot(pageA, "07-bookmarks", { full: true });

  // A few recipes in the other folder.
  await pageA.goto("/");
  await openFolder(pageA, folders.recipes);
  for (const b of recipeBookmarks) await createBookmark(pageA, b);
});

test("04 · compartir una carpeta con otro usuario", async ({ browser }) => {
  // Ada creates a group.
  await pageA.goto("/groups");
  await pageA.getByRole("button", { name: "Nuevo grupo" }).click();
  await expect(pageA.getByRole("heading", { name: "Nuevo grupo" })).toBeVisible();
  await pageA.getByPlaceholder("Nombre", { exact: true }).fill(group.name);
  await pageA.getByPlaceholder(/Descripción/).fill(group.description);
  await pageA.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(pageA.getByText(group.name).first()).toBeVisible();
  await shot(pageA, "08-group");

  // Alan registers so he can accept the invitation.
  ctxB = await browser.newContext();
  await seedSpanish(ctxB);
  pageB = await ctxB.newPage();
  await signup(pageB, alan);

  // Ada opens the group and invites Alan by email.
  await pageA.getByText(group.name).first().click();
  await pageA.waitForURL(/\/groups\//);
  await pageA.getByRole("button", { name: "Invitar" }).click();
  await expect(pageA.getByRole("heading", { name: "Invitar al grupo" })).toBeVisible();
  await pageA.getByPlaceholder("email o nickname").fill(alan.email);
  await pageA.getByRole("button", { name: "Generar invitación" }).click();
  await expect(
    pageA.getByRole("heading", { name: "Invitación creada" }),
  ).toBeVisible();
  await shot(pageA, "09-invite");

  // Alan accepts from the pending-invitations list.
  await pageB.goto("/groups");
  await pageB.getByRole("button", { name: "Aceptar", exact: true }).first().click();
  await expect(pageB.getByText(group.name).first()).toBeVisible();
  await shot(pageB, "10-alan-groups");

  // Ada shares the research folder into the group.
  await pageA.goto("/");
  await openFolder(pageA, folders.research);
  await pageA.getByRole("button", { name: "Más acciones" }).first().click();
  await pageA.getByRole("button", { name: "Compartir con grupo" }).click();
  await expect(
    pageA.getByRole("heading", { name: "Compartir carpeta con grupo" }),
  ).toBeVisible();
  await pageA.getByRole("radio").first().check();
  await shot(pageA, "11-share");
  await pageA.getByRole("button", { name: "Compartir", exact: true }).click();
  await expect(
    pageA.getByRole("heading", { name: "Compartir carpeta con grupo" }),
  ).toBeHidden();

  // Alan sees the shared folder under "Compartidos".
  await pageB.goto("/shared");
  await expect(
    pageB.getByRole("heading", { name: "Compartidos" }),
  ).toBeVisible();
  // The shared item shows the real folder name once the snapshot is sealed.
  await expect(async () => {
    await pageB.reload();
    await expect(
      pageB.getByText(folders.research, { exact: true }).first(),
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await shot(pageB, "12-alan-shared", { full: true });
});

test("05 · generar y ver un panel público", async ({ browser }) => {
  await pageA.goto("/");
  await openFolderCardKebab(pageA, folders.research);
  await pageA.getByRole("button", { name: "Generar panel" }).click();
  await expect(pageA.getByRole("heading", { name: "Generar panel" })).toBeVisible();
  await pageA.getByLabel("Nombre", { exact: true }).fill(panel.name);
  await pageA.getByLabel("URL (slug)").fill(panel.slug);
  await pageA.getByRole("button", { name: "Público", exact: true }).click();
  await shot(pageA, "13-panel-dialog");
  await pageA.getByRole("button", { name: "Generar", exact: true }).click();
  await expect(pageA.getByRole("heading", { name: "Panel creado" })).toBeVisible();
  publicSlug = await readSlugFromCreated(pageA, panel.slug);
  await shot(pageA, "14-panel-created");
  await pageA.getByRole("button", { name: "Cerrar" }).last().click();

  // Public panel view in a fresh, unauthenticated context. The snapshot is
  // materialized asynchronously, so retry until the bookmarks show.
  const ctxC = await browser.newContext();
  await seedSpanish(ctxC);
  const pageC = await ctxC.newPage();
  await expect(async () => {
    await pageC.goto(`/panel/${publicSlug}`);
    await expect(
      pageC.getByText(researchBookmarks[0]!.title).first(),
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await shot(pageC, "15-panel-public", { full: true });
  await ctxC.close();

  // Management page.
  await pageA.goto("/panels");
  await expect(pageA.getByRole("heading", { name: "Paneles" })).toBeVisible();
  await expect(pageA.getByText(panel.name)).toBeVisible();
  await shot(pageA, "16-panels-manage");
});

test("06 · panel protegido con contraseña", async ({ browser }) => {
  await pageA.goto("/");
  await openFolderCardKebab(pageA, folders.recipes);
  await pageA.getByRole("button", { name: "Generar panel" }).click();
  await expect(pageA.getByRole("heading", { name: "Generar panel" })).toBeVisible();
  await pageA.getByLabel("URL (slug)").fill("recetas");
  await pageA.getByRole("button", { name: "Con contraseña" }).click();
  await pageA.getByPlaceholder("Contraseña del panel").fill(panel.password);
  await pageA.getByRole("button", { name: "Generar", exact: true }).click();
  await expect(pageA.getByRole("heading", { name: "Panel creado" })).toBeVisible();
  passwordSlug = await readSlugFromCreated(pageA, "recetas");
  await pageA.getByRole("button", { name: "Cerrar" }).last().click();

  const ctxD = await browser.newContext();
  await seedSpanish(ctxD);
  const pageD = await ctxD.newPage();
  await pageD.goto(`/panel/${passwordSlug}`);
  await expect(
    pageD.getByText("Este panel requiere contraseña."),
  ).toBeVisible({ timeout: 20_000 });
  await shot(pageD, "17-panel-password");
  await pageD.getByPlaceholder("Contraseña").fill(panel.password);
  await pageD.getByRole("button", { name: "Ver panel" }).click();
  await expect(async () => {
    await expect(
      pageD.getByText(recipeBookmarks[0]!.title).first(),
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await shot(pageD, "18-panel-unlocked", { full: true });
  await ctxD.close();
});

test("07 · favoritos y enlaces simbólicos", async () => {
  await pageA.goto("/");

  // Star a bookmark from its card, then show the "Favoritos" bar.
  await openFolder(pageA, folders.research);
  const card = pageA
    .locator("div.group.relative")
    .filter({ hasText: researchBookmarks[0]!.title })
    .first();
  await card.getByRole("button", { name: "Añadir a favoritos" }).click();
  await expect(
    card.getByRole("button", { name: "Quitar de favoritos" }),
  ).toBeVisible();
  await shot(pageA, "25-favorite-star");

  await pageA.getByRole("button", { name: "Favoritos", exact: true }).click();
  await expect(
    pageA.getByText(researchBookmarks[0]!.title, { exact: true }).first(),
  ).toBeVisible();
  await shot(pageA, "26-favorites-bar");
  await pageA.keyboard.press("Escape");

  // Symlink the research folder into a new "Escritorio" folder.
  await pageA.goto("/");
  await createFolder(pageA, "Escritorio");
  await openFolderCardKebab(pageA, folders.research);
  await pageA.getByRole("button", { name: "Crear enlace en…" }).click();
  await expect(
    pageA.getByRole("heading", { name: "Crear enlace simbólico" }),
  ).toBeVisible();
  await shot(pageA, "27-symlink-dialog");
  await pageA.getByRole("button", { name: "Escritorio", exact: true }).click();
  await pageA.getByRole("button", { name: "Crear enlace" }).click();

  await openFolder(pageA, "Escritorio");
  await expect(
    pageA.getByText(folders.research, { exact: true }).first(),
  ).toBeVisible();
  await shot(pageA, "28-symlink-folder");
});

test("08 · personalizar el aspecto de un panel", async () => {
  await pageA.goto("/panels");
  await pageA.getByRole("button", { name: "Plantillas" }).click();
  await shot(pageA, "29-templates-list");

  // The editor: live preview at desktop and phone widths, plus the knobs.
  await pageA.getByRole("button", { name: "Nueva", exact: true }).click();
  await expect(
    pageA.getByRole("heading", { name: "Editor de plantilla" }),
  ).toBeVisible();
  await pageA.locator('select:has(option[value="galaxy"])').selectOption("galaxy");
  await expect(pageA.locator(".pbg-galaxy").first()).toBeVisible();
  await shot(pageA, "30-template-editor");
  await pageA.getByRole("button", { name: "Cancelar" }).click();

  // A public panel using one of the themed built-ins, scene included.
  await pageA.goto("/");
  await openFolderCardKebab(pageA, folders.recipes);
  await pageA.getByRole("button", { name: "Generar panel" }).click();
  await expect(pageA.getByRole("heading", { name: "Generar panel" })).toBeVisible();
  await pageA.getByLabel("Nombre", { exact: true }).fill("Cocina");
  await pageA.getByLabel("URL (slug)").fill("cocina");
  // Galaxia for the docs: screenshots freeze animations, and this scene is
  // already visible on its first frame (stars and planets), unlike scenes that
  // start off-screen.
  const themed = pageA.getByRole("button", { name: /Galaxia/ });
  if (await themed.count()) await themed.first().click();
  await pageA.getByRole("button", { name: "Generar", exact: true }).click();
  await expect(pageA.getByRole("heading", { name: "Panel creado" })).toBeVisible();
  const slug = await readSlugFromCreated(pageA, "cocina");
  await pageA.getByRole("button", { name: "Cerrar" }).last().click();

  const themedPage = await ctxA.newPage();
  await expect(async () => {
    await themedPage.goto(`/panel/${slug}`);
    await expect(
      themedPage.getByRole("button", { name: /Descargar marcadores/ }),
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await shot(themedPage, "31-panel-themed", { full: true });
  await themedPage.close();
});

/** Click the "Más acciones" kebab of a specific folder card by its name. */
async function openFolderCardKebab(page: Page, folderName: string) {
  const card = page.getByRole("link", {
    name: new RegExp(`Seleccionar carpeta ${folderName}\\b`),
  });
  await card.getByRole("button", { name: "Más acciones" }).click();
}

/** Read the panel slug from the "Panel creado" success URL shown in a <code>. */
async function readSlugFromCreated(page: Page, fallback: string) {
  const code = await page.locator("code").first().innerText();
  const m = code.match(/\/panel\/([^\s/]+)/);
  return m ? m[1]! : fallback;
}
