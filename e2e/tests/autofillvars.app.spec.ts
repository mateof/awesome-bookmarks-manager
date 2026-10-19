import { type Browser, expect, test } from "@playwright/test";
import { acceptDialog, dismissDialog, seedSpanish, shot, signup } from "../fixtures/app.js";

async function newUser(browser: Browser) {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "autofillvars.e2e@example.com",
    nickname: "autofillvars",
    password: "AutofillVars28xxxx",
  });
  return { ctx, page, req: page.request };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("las variables de autorrelleno se gestionan en una tabla paginada, con búsqueda, filtros y modal", async ({
  browser,
}) => {
  const { ctx, page, req } = await newUser(browser);
  const variables = Array.from({ length: 12 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      id: uuid(i + 1),
      key: `var${n}`,
      label: `Variable ${n}`,
      description: i === 4 ? "Teléfono móvil de contacto" : "",
      value: i % 3 === 0 ? "" : `valor-${n}`,
    };
  });
  const saved = await req.put("/api/autofill/variables", { data: { variables } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const bm = await (
    await req.post("/api/bookmarks", {
      data: { url: "https://example.com/form", title: "Formulario", folderId: null, fetchSnapshot: false },
    })
  ).json();
  const auto = await req.put(`/api/bookmarks/${bm.id}/automation`, {
    data: { steps: [{ action: "fill", selector: "#a", value: "{{var01}}" }] },
  });
  expect(auto.ok(), await auto.text()).toBeTruthy();

  await page.goto("/settings/autofill");
  const rows = page.getByTestId("autofill-variable");
  await expect(rows).toHaveCount(10);
  await expect(page.getByText("1–10 de 12")).toBeVisible();
  await expect(rows.first()).toContainText("1 automatización");
  await shot(page, "60-autofill-variables", { full: true });

  await page.getByRole("button", { name: "Página siguiente" }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByText("Página 2 de 2")).toBeVisible();

  const search = page.getByRole("textbox", { name: "Buscar por nombre, clave o descripción" });
  await search.fill("telefono");
  await expect(rows, "search ignores accents and looks at the description").toHaveCount(1);
  await expect(rows.first()).toContainText("Variable 05");
  await search.fill("");

  await page.getByRole("combobox", { name: "Filtrar por valor" }).selectOption("empty");
  await expect(rows).toHaveCount(4);
  await page.getByRole("combobox", { name: "Filtrar por valor" }).selectOption("all");
  await page.getByRole("combobox", { name: "Filtrar por uso" }).selectOption("used");
  await expect(rows).toHaveCount(1);
  await page.getByRole("combobox", { name: "Filtrar por uso" }).selectOption("all");

  await page.getByRole("button", { name: "Nombre" }).click();
  await expect(rows.first()).toContainText("Variable 12");
  await page.getByRole("button", { name: "Nombre" }).click();
  await expect(rows.first()).toContainText("Variable 01");

  await page.getByRole("button", { name: "Editar Variable 03" }).click();
  const dialog = page.getByTestId("autofill-variable-dialog");
  await expect(page.getByRole("heading", { name: "Editar variable" })).toBeVisible();
  await dialog.getByLabel("Valor", { exact: true }).fill("nuevo-valor");
  await shot(page, "68-autofill-variable-dialog");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Mostrar el valor de Variable 03" }).click();
  await expect(rows.filter({ hasText: "Variable 03" })).toContainText("nuevo-valor");

  await page.getByRole("button", { name: "Editar Variable 01" }).click();
  await dialog.getByLabel("Clave").fill("var01b");
  await expect(dialog).toContainText("1 automatización usa var01");
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Nueva variable" }).click();
  await dialog.getByLabel("Nombre").fill("Variable 02 bis");
  await dialog.getByLabel("Clave").fill("var02");
  await expect(dialog).toContainText("La clave var02 está repetida");
  await expect(dialog.getByRole("button", { name: "Guardar" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Eliminar Variable 01" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("se usa en 1 automatización");
  await dismissDialog(page);
  await expect(page.getByText("1–10 de 12")).toBeVisible();

  await page.getByRole("button", { name: "Eliminar Variable 02" }).click();
  await acceptDialog(page);
  await expect(page.getByText("1–10 de 11")).toBeVisible();
  const after = await (await req.get("/api/autofill/variables")).json();
  expect(after.map((v: { key: string }) => v.key)).not.toContain("var02");
  await ctx.close();
});
