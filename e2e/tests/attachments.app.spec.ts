import { type Browser, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Attachments: real files hanging off a folder or a bookmark.
 *
 * What this pins down, beyond "the upload works":
 *
 * - The bytes come back byte-identical after a round trip through AES-GCM.
 * - An uploaded .html is served as a download with a generic content type,
 *   never rendered on this origin. Serving a user-supplied `text/html` from
 *   the API would be stored XSS with the session cookie attached.
 * - Another account gets nothing, even with the attachment id in hand.
 * - Purging the parent from the trash takes the file with it. An orphan blob
 *   would be unreachable *and* still counted against the quota.
 * - The bytes show up in the storage breakdown, which is the honest answer to
 *   "does this eat my space?".
 */
const owner = {
  email: "attach.owner.e2e@example.com",
  nickname: "attachowner",
  password: "AttachOwner27xx",
};
const stranger = {
  email: "attach.stranger.e2e@example.com",
  nickname: "attachstranger",
  password: "AttachStranger27x",
};

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PDF_ISH = Buffer.from("%PDF-1.4\nfake but not an image\n%%EOF\n");

async function newUser(
  browser: Browser,
  u: { email: string; nickname: string; password: string },
) {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, u);
  return { ctx, page, req: page.request };
}

test("los adjuntos se suben, se descargan intactos y se van con su dueño", async ({
  browser,
}) => {
  const o = await newUser(browser, owner);

  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Contratos" } })
  ).json();
  const bm = await (
    await o.req.post("/api/bookmarks", {
      data: {
        url: "https://papeles.example/",
        title: "Con papeles",
        folderId: folder.id,
        fetchSnapshot: false,
      },
    })
  ).json();

  // --- Upload, to a bookmark and to a folder -------------------------------
  const up = await o.req.post(`/api/bookmarks/${bm.id}/attachments`, {
    multipart: {
      file: { name: "informe final.pdf", mimeType: "application/pdf", buffer: PDF_ISH },
    },
  });
  expect(up.ok(), await up.text()).toBeTruthy();
  const pdf = await up.json();
  // The name survives spaces and its extension; the size is the plaintext one,
  // not the slightly longer sealed blob.
  expect(pdf.name).toBe("informe final.pdf");
  expect(pdf.sizeBytes).toBe(PDF_ISH.length);
  expect(pdf.previewable).toBe(false);

  const upImg = await o.req.post(`/api/bookmarks/${bm.id}/attachments`, {
    multipart: { file: { name: "captura.png", mimeType: "image/png", buffer: PNG } },
  });
  const img = await upImg.json();
  expect(img.previewable).toBe(true);

  const upFolder = await o.req.post(`/api/folders/${folder.id}/attachments`, {
    multipart: { file: { name: "plantilla.pdf", mimeType: "application/pdf", buffer: PDF_ISH } },
  });
  expect(upFolder.ok(), await upFolder.text()).toBeTruthy();

  // Listing is per entity: the folder's file does not leak into the bookmark's.
  const listed = await (
    await o.req.get(`/api/bookmarks/${bm.id}/attachments`)
  ).json();
  expect(listed.map((a: { name: string }) => a.name).sort()).toEqual([
    "captura.png",
    "informe final.pdf",
  ]);

  // --- Download: same bytes out as went in --------------------------------
  const dl = await o.req.get(`/api/attachments/${pdf.id}`);
  expect(dl.ok()).toBeTruthy();
  expect((await dl.body()).equals(PDF_ISH)).toBeTruthy();
  expect(dl.headers()["content-disposition"]).toContain("attachment");
  // The file name survives the header round trip, percent-encoded.
  expect(dl.headers()["content-disposition"]).toContain(
    "informe%20final.pdf",
  );

  // An image may render inline, and with the type sniffed from the bytes.
  const inline = await o.req.get(`/api/attachments/${img.id}?inline=1`);
  expect(inline.headers()["content-type"]).toBe("image/png");
  expect(inline.headers()["content-disposition"]).toContain("inline");
  expect((await inline.body()).equals(PNG)).toBeTruthy();

  // --- An uploaded page is never rendered on this origin ------------------
  const evil = await (
    await o.req.post(`/api/bookmarks/${bm.id}/attachments`, {
      multipart: {
        file: {
          name: "trampa.html",
          mimeType: "text/html",
          buffer: Buffer.from("<script>alert(1)</script>"),
        },
      },
    })
  ).json();
  // Even asking for it inline: it is not an image, so it downloads as bytes.
  const served = await o.req.get(`/api/attachments/${evil.id}?inline=1`);
  expect(served.headers()["content-type"]).toBe("application/octet-stream");
  expect(served.headers()["content-disposition"]).toContain("attachment");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");

  // --- The quota knows about them -----------------------------------------
  const usage = await (await o.req.get("/api/storage/me")).json();
  expect(usage.breakdown.attachments).toBeGreaterThan(0);

  // --- Somebody else's account gets nothing -------------------------------
  const s = await newUser(browser, stranger);
  expect((await s.req.get(`/api/attachments/${pdf.id}`)).status()).toBe(404);
  expect(
    (await s.req.delete(`/api/attachments/${pdf.id}`)).status(),
  ).toBe(404);
  expect(
    (await s.req.get(`/api/bookmarks/${bm.id}/attachments`)).status(),
  ).toBe(404);
  await s.ctx.close();

  // --- Delete one ---------------------------------------------------------
  expect((await o.req.delete(`/api/attachments/${evil.id}`)).status()).toBe(204);
  expect((await o.req.get(`/api/attachments/${evil.id}`)).status()).toBe(404);

  // --- The UI shows the section and the files -----------------------------
  await o.page.goto(`/bookmark/${bm.id}`);
  await expect(
    o.page.getByRole("heading", { name: "Adjuntos" }),
  ).toBeVisible();
  await expect(o.page.getByText("informe final.pdf")).toBeVisible();
  await expect(o.page.getByText("captura.png")).toBeVisible();

  // Uploading from the page itself, not just the API. Picking a file now opens
  // the metadata dialog first: the slug it suggests is the key notes will use
  // to reference the file, so it is worth a look before the upload happens.
  await o.page
    .getByTestId("attachment-input")
    .setInputFiles({
      name: "desde-la-ui.pdf",
      mimeType: "application/pdf",
      buffer: PDF_ISH,
    });
  await expect(
    o.page.getByRole("heading", { name: "Adjuntar fichero" }),
  ).toBeVisible();
  // Suggested from the file name, without the extension.
  await expect(o.page.getByLabel("Slug")).toHaveValue("desde-la-ui");
  await o.page.getByLabel("Descripción").fill("Subido desde la página");
  await o.page.getByRole("button", { name: "Guardar" }).click();
  await expect(o.page.getByText("desde-la-ui.pdf")).toBeVisible();
  await expect(o.page.getByText("#desde-la-ui")).toBeVisible();
  await expect(o.page.getByText("Subido desde la página")).toBeVisible();

  // The folder's own file shows on the folder page, and only that one.
  await o.page.goto(`/folder/${folder.id}`);
  await expect(o.page.getByText("plantilla.pdf")).toBeVisible();
  await expect(o.page.getByText("informe final.pdf")).toHaveCount(0);

  // --- Purging the parent takes the files with it -------------------------
  expect((await o.req.delete(`/api/bookmarks/${bm.id}`)).status()).toBe(204);
  const purge = await o.req.delete(`/api/trash/bookmark/${bm.id}`);
  expect(purge.ok(), await purge.text()).toBeTruthy();
  // The attachment id is now unreachable — the row went with the bookmark.
  expect((await o.req.get(`/api/attachments/${pdf.id}`)).status()).toBe(404);
  expect((await o.req.get(`/api/attachments/${img.id}`)).status()).toBe(404);

  await o.ctx.close();
});

test("un fichero demasiado grande se rechaza y no deja rastro", async ({
  browser,
}) => {
  const u = await newUser(browser, {
    email: "attach.big.e2e@example.com",
    nickname: "attachbig",
    password: "AttachTooBig27xx",
  });
  const folder = await (
    await u.req.post("/api/folders", { data: { name: "Pesados" } })
  ).json();

  // Just over the 25 MB per-file ceiling.
  const huge = Buffer.alloc(25 * 1024 * 1024 + 1024, 7);
  const res = await u.req.post(`/api/folders/${folder.id}/attachments`, {
    multipart: {
      file: { name: "enorme.bin", mimeType: "application/octet-stream", buffer: huge },
    },
  });
  expect(res.ok()).toBeFalsy();

  // Rejected before the row exists: nothing half-written is left listed.
  const list = await (
    await u.req.get(`/api/folders/${folder.id}/attachments`)
  ).json();
  expect(list).toEqual([]);

  await u.ctx.close();
});

test("los adjuntos viajan en el archivo .abz", async ({ browser }) => {
  const u = await newUser(browser, {
    email: "attach.abz.e2e@example.com",
    nickname: "attachabz",
    password: "AttachArchive27x",
  });

  const folder = await (
    await u.req.post("/api/folders", { data: { name: "Con papeles dentro" } })
  ).json();
  const bm = await (
    await u.req.post("/api/bookmarks", {
      data: {
        url: "https://exporta.example/",
        title: "Exportable",
        folderId: folder.id,
        fetchSnapshot: false,
      },
    })
  ).json();
  await u.req.post(`/api/folders/${folder.id}/attachments`, {
    multipart: {
      file: { name: "acta.pdf", mimeType: "application/pdf", buffer: PDF_ISH },
    },
  });
  await u.req.post(`/api/bookmarks/${bm.id}/attachments`, {
    multipart: {
      file: { name: "logo.png", mimeType: "image/png", buffer: PNG },
    },
  });

  const exported = await u.req.post("/api/export/archive", {
    data: { scope: "folder", id: folder.id },
  });
  expect(exported.ok(), await exported.text()).toBeTruthy();

  const imported = await u.req.post("/api/import/archive", {
    multipart: {
      file: {
        name: "copia.abz",
        mimeType: "application/zip",
        buffer: await exported.body(),
      },
    },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();

  // The copy is a different folder with its own attachment rows, and the
  // bytes survived being unsealed for the archive and resealed on import.
  const folders = await (await u.req.get("/api/folders")).json();
  const copy = folders.find(
    (f: { name: string; id: string }) =>
      f.name === "Con papeles dentro" && f.id !== folder.id,
  );
  expect(copy).toBeTruthy();

  const copied = await (
    await u.req.get(`/api/folders/${copy.id}/attachments`)
  ).json();
  expect(copied).toHaveLength(1);
  expect(copied[0].name).toBe("acta.pdf");
  const back = await u.req.get(`/api/attachments/${copied[0].id}`);
  expect((await back.body()).equals(PDF_ISH)).toBeTruthy();

  // The bookmark inside the exported subtree kept its file too.
  const bookmarks = await (await u.req.get("/api/bookmarks")).json();
  const bmCopy = bookmarks.find(
    (b: { title: string; id: string }) =>
      b.title === "Exportable" && b.id !== bm.id,
  );
  const bmFiles = await (
    await u.req.get(`/api/bookmarks/${bmCopy.id}/attachments`)
  ).json();
  expect(bmFiles.map((a: { name: string }) => a.name)).toEqual(["logo.png"]);

  // Duplicating carries them too, and without decrypting anything: the blob's
  // AAD is scoped to the user, so the sealed bytes stay valid under a new id.
  const dup = await (
    await u.req.post(`/api/bookmarks/${bm.id}/copy`, { data: {} })
  ).json();
  const dupFiles = await (
    await u.req.get(`/api/bookmarks/${dup.id}/attachments`)
  ).json();
  expect(dupFiles).toHaveLength(1);
  expect(dupFiles[0].name).toBe("logo.png");
  expect(
    (await (await u.req.get(`/api/attachments/${dupFiles[0].id}`)).body()).equals(
      PNG,
    ),
  ).toBeTruthy();

  // Same for a whole folder subtree.
  const dupFolder = await (
    await u.req.post(`/api/folders/${folder.id}/copy`, { data: {} })
  ).json();
  const dupFolderFiles = await (
    await u.req.get(`/api/folders/${dupFolder.id}/attachments`)
  ).json();
  expect(dupFolderFiles.map((a: { name: string }) => a.name)).toEqual([
    "acta.pdf",
  ]);

  await u.ctx.close();
});
