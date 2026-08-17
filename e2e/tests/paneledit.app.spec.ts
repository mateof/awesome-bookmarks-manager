import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Editing a panel and reopening the dialog must show what was just saved.
 * The dialog is backed by its own detail query, so saving had to refresh that
 * cache too: invalidating only the panel list left the stale copy behind and
 * the form came back with the previous values.
 */
const user = {
  email: "panel.edit.e2e@example.com",
  nickname: "paneledituser",
  password: "ReopenShowsSaved24",
};

test("editar panel: al reabrir el modal se ven los datos guardados", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Fuente" } })
  ).json();
  await req.post("/api/panels", {
    data: { title: "Antiguo", slug: "antiguo", folderId: folder.id, accessMode: "public" },
  });

  await page.goto("/panels");
  await expect(page.getByText("Antiguo").first()).toBeVisible();

  // Edit: change the name, the slug and the displayed title.
  await page.getByRole("button", { name: "Editar" }).first().click();
  await expect(page.getByRole("heading", { name: "Editar panel" })).toBeVisible();
  await page.getByLabel("Nombre", { exact: true }).fill("Nuevo nombre");
  await page.getByLabel("URL (slug)").fill("nuevo-slug");
  await page.getByText("Título, pestaña e icono").click();
  await page.getByLabel("Título mostrado").fill("Encabezado nuevo");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: "Editar panel" })).toBeHidden();

  // It really was saved.
  const panels = await (await req.get("/api/panels")).json();
  const saved = panels.find((p: { slug: string }) => p.slug === "nuevo-slug");
  expect(saved).toBeTruthy();
  expect(saved.title).toBe("Nuevo nombre");
  expect(saved.displayTitle).toBe("Encabezado nuevo");

  // Reopening the dialog shows the saved values, not the previous ones.
  await page.getByRole("button", { name: "Editar" }).first().click();
  await expect(page.getByRole("heading", { name: "Editar panel" })).toBeVisible();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Nuevo nombre");
  await expect(page.getByLabel("URL (slug)")).toHaveValue("nuevo-slug");
  await page.getByText("Título, pestaña e icono").click();
  await expect(page.getByLabel("Título mostrado")).toHaveValue("Encabezado nuevo");
});
