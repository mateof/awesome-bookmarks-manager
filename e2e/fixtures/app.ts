import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";
import path from "node:path";
import { IMAGES_DIR } from "./config.js";
import { admin, type BookmarkSeed, type TestUser } from "./data.js";

/**
 * i18next detects language from localStorage key "language" first. Seed it so
 * the UI is Spanish regardless of the runner's navigator locale. addInitScript
 * runs before any page script on every navigation in the context.
 */
export async function seedSpanish(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem("language", "es");
    } catch {
      /* storage may be unavailable on some origins; ignore */
    }
  });
  // Any native dialog the browser still raises on its own (beforeunload and
  // friends) — accept so flows proceed. The app's own confirmations are React
  // components now, not window.confirm, so they are clicked like any button;
  // see acceptDialog below.
  context.on("page", (page) => {
    page.on("dialog", (d) => d.accept().catch(() => {}));
  });
}

/** Save a screenshot into doc/images with a stable, ordered name. */
export async function shot(
  page: Page,
  name: string,
  opts: { full?: boolean } = {},
) {
  await page.screenshot({
    path: path.join(IMAGES_DIR, `${name}.png`),
    fullPage: opts.full ?? false,
    animations: "disabled",
  });
}

/**
 * A user is "home" when the authenticated toolbar shows. The quick-add
 * bookmark button is icon-only, so it is identified by its aria-label.
 */
async function expectHome(page: Page) {
  await expect(
    page.getByRole("button", { name: "Nuevo bookmark", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
}

export async function signup(page: Page, u: TestUser) {
  await page.goto("/signup");
  await page.getByPlaceholder("Email", { exact: true }).fill(u.email);
  await page.getByPlaceholder(/^Nickname/).fill(u.nickname);
  await page.getByPlaceholder(/^Contraseña/).fill(u.password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expectHome(page);
}

export async function login(page: Page, u: TestUser) {
  await page.goto("/login");
  await page.getByPlaceholder("Email o nickname").fill(u.email);
  await page.getByPlaceholder("Contraseña", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expectHome(page);
}

/** Open the page toolbar's kebab (the first "Más acciones" in DOM order). */
async function openToolbarKebab(page: Page) {
  await page.getByRole("button", { name: "Más acciones" }).first().click();
}

export async function createFolder(
  page: Page,
  name: string,
  description?: string,
) {
  await page.getByRole("button", { name: "Nueva carpeta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nueva carpeta" })).toBeVisible();
  await page.getByPlaceholder("Nombre", { exact: true }).fill(name);
  if (description) {
    const editor = page.getByRole("textbox", { name: "Descripción" });
    if (await editor.count()) await editor.first().fill(description);
  }
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nueva carpeta" })).toBeHidden();
}

export async function openFolder(page: Page, name: string) {
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForURL(/\/folder\//);
}

export async function createBookmark(page: Page, b: BookmarkSeed) {
  await page.getByRole("button", { name: "Nuevo bookmark", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nuevo bookmark" })).toBeVisible();
  await page.getByPlaceholder("https://…", { exact: true }).fill(b.url);
  await page.getByPlaceholder(/^Título/).fill(b.title);
  const editor = page.getByRole("textbox", { name: "Descripción" });
  if (await editor.count()) await editor.first().fill(b.description);
  for (const tag of b.tags) {
    const tagInput = page.getByPlaceholder(/Tags|Añade tags/);
    await tagInput.fill(tag);
    await tagInput.press("Enter");
  }
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nuevo bookmark" })).toBeHidden();
}

/**
 * A session holding the admin role.
 *
 * The account is registered by the setup project (see setup/admin.setup.ts)
 * before any spec runs, which is what makes it the instance's first user and
 * therefore its admin. Specs must not rely on being first themselves: file
 * ordering is not a contract.
 */
export async function adminSession(
  browser: Browser,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await login(page, admin);
  return { ctx, page };
}

/**
 * Accept the app's own confirmation dialog.
 *
 * Destructive actions no longer go through `window.confirm`, so nothing
 * auto-accepts them: the dialog is a real element and has to be clicked. That
 * is the point — a test that deletes something now proves the confirmation
 * exists, instead of silently sailing past it.
 */
export async function acceptDialog(page: Page, label = "Confirmar") {
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** Dismiss the app's confirmation dialog, leaving the action undone. */
export async function dismissDialog(page: Page) {
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
}
