import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * First click on a single-line field selects its whole value; a second click
 * (already focused) just places the caret. Dragging selects a fragment, and
 * multi-line fields are deliberately left alone.
 */
const user = {
  email: "select.all.e2e@example.com",
  nickname: "selectalluser",
  password: "SelectAllFirst2024",
};

/** Current selection inside the focused input. */
const selectionOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement | null;
    if (!el || typeof el.selectionStart !== "number") return null;
    return el.value.slice(el.selectionStart, el.selectionEnd ?? el.selectionStart);
  });

test("campos: primer clic selecciona todo, segundo coloca el cursor", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);

  await page.getByRole("button", { name: "Más acciones" }).first().click();
  await page.getByRole("button", { name: "Carpeta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nueva carpeta" })).toBeVisible();

  const field = page.getByPlaceholder("Nombre", { exact: true });
  await field.fill("Documentos importantes");
  // Move focus away so the next click is a genuine "first click".
  await page.getByRole("heading", { name: "Nueva carpeta" }).click();

  const box = (await field.boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // First click: everything selected.
  await page.mouse.click(mid.x, mid.y);
  expect(await selectionOf(page)).toBe("Documentos importantes");

  // Second click on the already-focused field: caret placed, nothing selected.
  await page.mouse.click(mid.x, mid.y);
  expect(await selectionOf(page)).toBe("");

  // Typing after a first click replaces the whole value (the point of it all).
  await page.getByRole("heading", { name: "Nueva carpeta" }).click();
  await page.mouse.click(mid.x, mid.y);
  await page.keyboard.type("Otro");
  await expect(field).toHaveValue("Otro");
});

test("campos: arrastrar selecciona solo el fragmento", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "select.drag.e2e@example.com",
    nickname: "selectdraguser",
    password: "SelectDragOnly2024",
  });

  await page.getByRole("button", { name: "Más acciones" }).first().click();
  await page.getByRole("button", { name: "Carpeta", exact: true }).click();
  const field = page.getByPlaceholder("Nombre", { exact: true });
  await field.fill("AAAAAAAAAAAAAAAAAAAA");
  await page.getByRole("heading", { name: "Nueva carpeta" }).click();

  // Press inside the text and drag a short way: the select-all must not fire.
  const box = (await field.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, y, { steps: 10 });
  await page.mouse.up();

  const sel = await selectionOf(page);
  expect(sel).not.toBe("AAAAAAAAAAAAAAAAAAAA");
});
