import { type BrowserContext, type Page, expect } from "@playwright/test";
import path from "node:path";
import { IMAGES_DIR } from "./config.js";
import type { BookmarkSeed, TestUser } from "./data.js";

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
  // Native confirm() dialogs (deletes) — accept by default so flows proceed.
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
  await openToolbarKebab(page);
  await page.getByRole("button", { name: "Carpeta", exact: true }).click();
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
