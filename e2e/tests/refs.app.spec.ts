import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * References inside a description, and the metadata that makes files
 * referenceable.
 *
 * The properties worth pinning down:
 *
 * - A chip survives the round trip through the server's sanitiser. The
 *   `data-ref` attributes are exactly the kind of thing a sanitiser strips by
 *   default, and when that happens the reference silently becomes plain text.
 * - A chip shows the target's *current* title, not the one frozen at insert
 *   time, and says so when the target is gone.
 * - Slugs are unique per account, and a collision is refused rather than
 *   quietly renamed: the slug is the key the user's own notes write down.
 * - Saving without closing twice in a row works. The first save bumps the
 *   row's revision, so a dialog that kept the original would turn its own
 *   change into a conflict.
 */
const user = {
  email: "refs.notes.e2e@example.com",
  nickname: "refsnotes",
  password: "RefsInNotes2026x",
};

const PDF_ISH = Buffer.from("%PDF-1.4\nreferenciable\n%%EOF\n");

test("referencias a carpetas, bookmarks y adjuntos dentro de una nota", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const target = await (
    await req.post("/api/folders", {
      data: { name: "Contratos", description: "<p>Los papeles serios</p>" },
    })
  ).json();
  const notes = await (
    await req.post("/api/folders", {
      data: { name: "Cuaderno", description: "<p>notas</p>" },
    })
  ).json();
  const bm = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://proveedor.example/panel",
        title: "Panel del proveedor",
        description: "<p>Acceso mensual</p>",
        folderId: target.id,
        fetchSnapshot: false,
      },
    })
  ).json();

  // --- A file, with the metadata that makes it referenceable ---------------
  const up = await req.post(`/api/folders/${target.id}/attachments`, {
    multipart: {
      file: { name: "Acta Marzo.pdf", mimeType: "application/pdf", buffer: PDF_ISH },
      slug: "acta-marzo",
      description: "El acta firmada",
    },
  });
  expect(up.ok(), await up.text()).toBeTruthy();
  const acta = await up.json();
  expect(acta.slug).toBe("acta-marzo");
  expect(acta.description).toBe("El acta firmada");

  // The slug is unique per account: asking for a taken one is refused, not
  // silently changed into something else.
  const clash = await req.post(`/api/folders/${target.id}/attachments`, {
    multipart: {
      file: { name: "otro.pdf", mimeType: "application/pdf", buffer: PDF_ISH },
      slug: "acta-marzo",
    },
  });
  expect(clash.status()).toBe(409);

  // Without an explicit slug one is suggested from the file name, and nudged
  // aside when that is taken.
  const auto = await (
    await req.post(`/api/folders/${target.id}/attachments`, {
      multipart: {
        file: {
          name: "Acta Marzo.pdf",
          mimeType: "application/pdf",
          buffer: PDF_ISH,
        },
      },
    })
  ).json();
  expect(auto.slug).toBe("acta-marzo-2");

  // --- Insert the references through the UI --------------------------------
  await page.goto(`/folder/${notes.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();
  const editor = page.locator(".tiptap.ProseMirror").first();
  await editor.click();
  await expect(editor).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Ver ");

  // "@" opens the entity picker and never reaches the text.
  await page.keyboard.type("@");
  await expect(
    page.getByRole("heading", { name: "Referenciar una carpeta o un bookmark" }),
  ).toBeVisible();
  await page.getByPlaceholder("Buscar por nombre o URL…").fill("Panel del");
  await page.getByRole("button", { name: /Panel del proveedor/ }).first().click();

  await page.keyboard.type(" y ");
  await page.keyboard.type("#");
  await expect(
    page.getByRole("heading", { name: "Referenciar un fichero adjunto" }),
  ).toBeVisible();
  await page.getByPlaceholder("Buscar por slug o nombre…").fill("acta-marzo");
  // Both files are called "Acta Marzo.pdf"; the slug is what tells them apart,
  // so pick by that rather than by a name they share.
  await page
    .getByRole("button")
    .filter({ has: page.getByText("acta-marzo", { exact: true }) })
    .click();

  await page.getByRole("button", { name: "Guardar y cerrar" }).click();

  // --- The chips survived the server ---------------------------------------
  await expect(async () => {
    const after = await (await req.get(`/api/folders/${notes.id}`)).json();
    expect(after.description).toContain('data-ref="bookmark"');
    expect(after.description).toContain(`data-ref-id="${bm.id}"`);
    expect(after.description).toContain('data-ref="asset"');
    expect(after.description).toContain('data-ref-slug="acta-marzo"');
  }).toPass({ timeout: 10_000 });

  // --- And they render as live chips ---------------------------------------
  await page.reload();
  const chip = page.locator('a[data-ref="bookmark"]').first();
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("Panel del proveedor");

  // Hovering shows the card: URL on top, description underneath.
  await chip.hover();
  const tip = page.getByTestId("ref-tooltip");
  await expect(tip).toBeVisible({ timeout: 5000 });
  await expect(tip).toContainText("https://proveedor.example/panel");
  await expect(tip).toContainText("Acceso mensual");

  // The label navigates to the bookmark's own page.
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`/bookmark/${bm.id}`));

  // --- The chip tracks a rename, rather than freezing the old title --------
  await req.patch(`/api/bookmarks/${bm.id}`, {
    data: { title: "Panel renombrado" },
  });
  await page.goto(`/folder/${notes.id}`);
  await expect(page.locator('a[data-ref="bookmark"]').first()).toContainText(
    "Panel renombrado",
  );

  // --- And says so when the target is gone ---------------------------------
  await req.delete(`/api/bookmarks/${bm.id}`);
  await page.reload();
  await expect(page.locator('a[data-ref="bookmark"]').first()).toHaveClass(
    /ab-ref-missing/,
  );

  await ctx.close();
});

test("guardar sin cerrar dos veces seguidas no provoca conflicto", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "refs.saveopen.e2e@example.com",
    nickname: "refssaveopen",
    password: "SaveKeepOpen2026x",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Borrador", description: "<p>uno</p>" },
    })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Editar el texto" }).click();

  const editor = page.locator(".tiptap.ProseMirror");
  await editor.click();
  await expect(editor).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("dos");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Guardado")).toBeVisible();

  // The dialog is still open. A second save must not collide with the
  // revision the first one just created.
  await editor.click();
  await expect(editor).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("tres");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Guardado")).toBeVisible();
  // A conflict would surface as this message instead of a clean save.
  await expect(page.getByText(/conflicto|modificado/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Guardar y cerrar" }).click();
  await expect(
    page.getByRole("button", { name: "Guardar y cerrar" }),
  ).toHaveCount(0);

  const after = await (await req.get(`/api/folders/${folder.id}`)).json();
  expect(after.description).toContain("tres");

  await ctx.close();
});

test("editar el nombre, la descripción y el slug de un adjunto", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "refs.slugedit.e2e@example.com",
    nickname: "refsslugedit",
    password: "SlugEditing2026xx",
  });
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Archivo" } })
  ).json();
  const a = await (
    await req.post(`/api/folders/${folder.id}/attachments`, {
      multipart: {
        file: { name: "informe.pdf", mimeType: "application/pdf", buffer: PDF_ISH },
      },
    })
  ).json();
  expect(a.slug).toBe("informe");

  const patched = await req.patch(`/api/attachments/${a.id}`, {
    data: {
      name: "Informe anual",
      description: "El definitivo",
      slug: "informe-anual",
    },
  });
  expect(patched.ok(), await patched.text()).toBeTruthy();
  const updated = await patched.json();
  expect(updated.name).toBe("Informe anual");
  expect(updated.slug).toBe("informe-anual");

  // An invalid slug is refused rather than mangled into something else.
  expect(
    (
      await req.patch(`/api/attachments/${a.id}`, {
        data: { slug: "Con Mayúsculas" },
      })
    ).status(),
  ).toBe(400);

  // Resolving by slug is what a note actually does.
  const resolved = await (
    await req.post("/api/refs/resolve", {
      data: { refs: [{ type: "asset", slug: "informe-anual" }] },
    })
  ).json();
  expect(resolved[0].found).toBe(true);
  expect(resolved[0].title).toBe("Informe anual");
  expect(resolved[0].description).toBe("El definitivo");

  // The slug moved, so the old key finds nothing. That is the honest answer:
  // a note referring to the old slug should show as broken, not silently
  // resolve to whatever took the name.
  const stale = await (
    await req.post("/api/refs/resolve", {
      data: { refs: [{ type: "asset", slug: "informe" }] },
    })
  ).json();
  expect(stale[0].found).toBe(false);

  // The UI shows the slug on the row.
  await page.goto(`/folder/${folder.id}`);
  await expect(page.getByText("#informe-anual")).toBeVisible();
  await expect(page.getByText("El definitivo")).toBeVisible();

  await ctx.close();
});
