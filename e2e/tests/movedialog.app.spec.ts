import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

const mover = {
  email: "elizabeth.blackwell@example.com",
  nickname: "elizabethb",
  password: "FirstWomanMD1849xx",
};
const upUser = {
  email: "rosalind.yalow@example.com",
  nickname: "rosalindy",
  password: "Radioimmuno1977xx",
};

test("el modal de mover empieza replegado y se despliega al expandir", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, mover);
  const req = page.request;

  const padre = await (
    await req.post("/api/folders", { data: { name: "Padre" } })
  ).json();
  await req.post("/api/folders", { data: { name: "Hijo", parentId: padre.id } });
  await req.post("/api/bookmarks", {
    data: { url: "https://m.example/", title: "MoverMe", fetchSnapshot: false },
  });

  await page.goto("/");

  const card = page
    .locator("div.group.relative")
    .filter({ hasText: "MoverMe" })
    .first();
  await card.getByRole("button", { name: "Más acciones" }).click();
  await page.getByRole("button", { name: /Mover a/ }).click();
  await expect(
    page.getByRole("heading", { name: "Mover a carpeta" }),
  ).toBeVisible();

  // The dialog renders folders as buttons (the sidebar tree uses links), so a
  // button named "Hijo" is unambiguously the dialog's subfolder row. Collapsed
  // by default: no such button until we expand its parent.
  await expect(page.getByRole("button", { name: "Hijo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Desplegar" }).click();
  await expect(page.getByRole("button", { name: "Hijo" })).toBeVisible();
});

test("botón subir de nivel vuelve a la carpeta padre", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, upUser);
  const req = page.request;

  const n1 = await (
    await req.post("/api/folders", { data: { name: "Nivel1" } })
  ).json();
  const n2 = await (
    await req.post("/api/folders", { data: { name: "Nivel2", parentId: n1.id } })
  ).json();

  await page.goto(`/folder/${n2.id}`);
  await expect(page.getByRole("heading", { name: "Nivel2" })).toBeVisible();

  await page.getByRole("button", { name: "Subir de nivel" }).click();
  await expect(page).toHaveURL(new RegExp(`/folder/${n1.id}$`));
  await expect(page.getByRole("heading", { name: "Nivel1" })).toBeVisible();
});
