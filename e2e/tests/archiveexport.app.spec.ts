import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The export side of the .abz format.
 *
 * The import dialog has always asked for a passphrase "if the file is
 * encrypted", but the export was fired straight from the menu with no options,
 * so there was no way to produce an encrypted file in the first place. The
 * dialog closes that gap, and also exposes the snapshots, which the server
 * accepted all along.
 */
const user = {
  email: "archive.exportui.e2e@example.com",
  nickname: "archiveexportui",
  password: "PassphraseOnExport26",
};

test("exportar .abz: se puede cifrar con contraseña desde la interfaz", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Credenciales" } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://banco.example/",
      title: "Acceso al banco",
      folderId: folder.id,
      fetchSnapshot: false,
    },
  });

  await page.goto(`/folder/${folder.id}`);
  await expect(page.getByRole("heading", { name: "Credenciales" })).toBeVisible();

  const kebab = page.getByRole("button", { name: "Más acciones" }).first();
  await kebab.click();
  await page.getByText("Exportar (formato de la app)").first().click();
  await expect(
    page.getByRole("heading", { name: "Exportar en formato de la app" }),
  ).toBeVisible();

  const exportBtn = page.getByRole("button", { name: "Exportar", exact: true });

  // A passphrase under 8 characters, or one that does not match its
  // confirmation, cannot be exported: there is no recovering from a typo here.
  await page.getByLabel("Contraseña (opcional, cifra el archivo)").fill("corta");
  await expect(
    page.getByText("La contraseña debe tener al menos 8 caracteres."),
  ).toBeVisible();
  await expect(exportBtn).toBeDisabled();

  await page
    .getByLabel("Contraseña (opcional, cifra el archivo)")
    .fill("contrasena-larga-de-verdad");
  await page.getByLabel("Repite la contraseña").fill("otra-cosa");
  await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
  await expect(exportBtn).toBeDisabled();

  await page
    .getByLabel("Repite la contraseña")
    .fill("contrasena-larga-de-verdad");
  await expect(exportBtn).toBeEnabled();

  const downloading = page.waitForEvent("download");
  await exportBtn.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toContain(".abz");
  const bytes = await readFile((await download.path())!);

  // The file really is encrypted: it refuses to import without the passphrase
  // and goes through with it.
  const noPass = await req.post("/api/import/archive", {
    multipart: {
      file: { name: "c.abz", mimeType: "application/zip", buffer: bytes },
    },
  });
  expect(noPass.status()).toBe(400);
  expect(await noPass.text()).toMatch(/cifrado|contraseña/i);

  const ok = await req.post("/api/import/archive", {
    multipart: {
      file: { name: "c.abz", mimeType: "application/zip", buffer: bytes },
      passphrase: "contrasena-larga-de-verdad",
    },
  });
  expect(ok.ok(), await ok.text()).toBeTruthy();
  expect((await ok.json()).bookmarks).toBe(1);

  await ctx.close();
});

test("exportar .abz: sin contraseña avisa, y un bookmark suelto también se exporta", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "archive.exportone.e2e@example.com",
    nickname: "archiveexportone",
    password: "SingleBookmarkAbz26",
  });
  const req = page.request;

  const bm = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://suelto.example/",
        title: "Suelto",
        fetchSnapshot: false,
      },
    })
  ).json();

  await page.goto(`/bookmark/${bm.id}`);
  await page.getByRole("button", { name: "Más acciones" }).first().click();
  await page.getByText("Exportar (formato de la app)").first().click();

  // With no passphrase the dialog says plainly what the file is.
  await expect(page.getByText(/copia en claro de tus datos/)).toBeVisible();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const bytes = await readFile((await (await downloading).path())!);

  // Unencrypted, so it imports with no passphrase, and carries the one
  // bookmark the scope asked for.
  const imported = await req.post("/api/import/archive", {
    multipart: {
      file: { name: "s.abz", mimeType: "application/zip", buffer: bytes },
    },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();
  const result = await imported.json();
  expect(result.bookmarks).toBe(1);
  expect(result.folders).toBe(0);

  await ctx.close();
});
