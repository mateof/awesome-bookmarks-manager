import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

test("shot", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "zz.shot10@example.com",
    nickname: "zzshot10",
    password: "PencilOnTextShot26x",
  });
  const req = page.request;
  const f = await (await req.post("/api/folders", {
    data: {
      name: "Con notas",
      description: "<p>Primera línea de las notas de esta carpeta, que debe dejar sitio al lápiz de la esquina.</p><p>Segunda línea con algo más de texto para ver cómo queda el bloque completo.</p>",
    },
  })).json();
  await req.post("/api/bookmarks", { data: { url: "https://x.example/", title: "Un enlace", folderId: f.id, fetchSnapshot: false } });
  await page.goto(`/folder/${f.id}`);
  await expect(page.getByRole("button", { name: "Editar el texto" })).toBeVisible();
  await page.screenshot({ path: "/tmp/pencil.png" });
  await page.getByRole("button", { name: "Editar el texto" }).click();
  await expect(page.getByRole("heading", { name: /Editar el texto de/ })).toBeVisible();
  await page.screenshot({ path: "/tmp/pencil-dialog.png" });
});
