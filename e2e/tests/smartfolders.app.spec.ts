import { expect, test } from "@playwright/test";
import { acceptDialog, seedSpanish, signup } from "../fixtures/app.js";

/**
 * Smart folders: a filter saved under a name. They own no content, so the
 * point of the test is that membership is computed live — an item that starts
 * outside the query appears inside the folder the moment it gains the tag.
 */
const user = {
  email: "smart.folders.e2e@example.com",
  nickname: "smartfolderuser",
  password: "SavedQueries2026x",
};

test("guardar un filtro como carpeta inteligente y verlo vivo", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const leer = await (
    await req.post("/api/tags", { data: { name: "porleer", color: "#0ea5e9" } })
  ).json();

  await req.post("/api/bookmarks", {
    data: {
      url: "https://pendiente.example/",
      title: "Articulo pendiente",
      tagIds: [leer.id],
      fetchSnapshot: false,
    },
  });
  const otro = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://otro.example/",
        title: "Otro articulo",
        fetchSnapshot: false,
      },
    })
  ).json();

  // Build the filter, then save it.
  await page.goto("/filter");
  await page.getByRole("button", { name: /^porleer/ }).click();
  await expect(page.getByText("Articulo pendiente", { exact: true })).toBeVisible();
  await expect(page.getByText("Otro articulo", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Guardar como carpeta" }).click();
  await expect(
    page.getByRole("heading", { name: "Nueva carpeta inteligente" }),
  ).toBeVisible();
  const nameField = page.getByPlaceholder("Por leer, Recetas, Trabajo…");
  // The suggested name is the tag; replace it to prove the field is editable.
  await expect(nameField).toHaveValue("porleer");
  await nameField.fill("Cola de lectura");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nueva carpeta inteligente" }),
  ).toBeHidden();

  // It shows up in the sidebar and the page now carries its name.
  await expect(
    page.getByRole("heading", { name: "Cola de lectura" }),
  ).toBeVisible();
  const sidebarEntry = page.getByRole("link", { name: "Cola de lectura" });
  await expect(sidebarEntry).toBeVisible();
  expect(page.url()).toContain("sf=");

  // Navigate away and come back through the sidebar.
  await page.goto("/");
  await page.getByRole("link", { name: "Cola de lectura" }).click();
  await expect(page).toHaveURL(/\/filter\?.*sf=/);
  await expect(page.getByText("Articulo pendiente", { exact: true })).toBeVisible();
  await expect(page.getByText("Otro articulo", { exact: true })).toHaveCount(0);

  // The folder is a live query, not a snapshot: tagging the other bookmark
  // pulls it in without touching the saved definition.
  await req.patch(`/api/bookmarks/${otro.id}`, {
    data: { tagIds: [leer.id] },
  });
  await page.reload();
  await expect(page.getByText("Otro articulo", { exact: true })).toBeVisible();

  // Changing the query offers to update the saved folder.
  await page.getByRole("button", { name: /^porleer/ }).click();
  await expect(page.getByRole("button", { name: "Actualizar carpeta" })).toBeVisible();

  // Deleting it leaves the items alone and drops the sidebar entry.
  await page.getByRole("button", { name: "Eliminar carpeta inteligente" }).click();
  await acceptDialog(page);
  await expect(page.getByRole("link", { name: "Cola de lectura" })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByText("Articulo pendiente", { exact: true })).toBeVisible();
});
