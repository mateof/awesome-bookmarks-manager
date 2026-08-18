import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The app's own portable archive (.abz).
 *
 * The property that matters is that it carries what the HTML export cannot
 * (tags, descriptions, colours, favourites, icons) and that importing creates
 * **copies**: new ids, tags matched by name. A restore replaces by id, which
 * is right for your own backup and wrong for a folder someone sent you.
 */
const owner = {
  email: "archive.export.e2e@example.com",
  nickname: "archiveexport",
  password: "PortableFormat26x",
};

test("archivo .abz: exporta una carpeta y se importa como copia", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, owner);
  const req = page.request;

  const tag = await (
    await req.post("/api/tags", { data: { name: "referencia", color: "#2563eb" } })
  ).json();
  const root = await (
    await req.post("/api/folders", {
      data: { name: "Proyecto", description: "<p>Notas del proyecto</p>", bgColor: "#0b3a2e" },
    })
  ).json();
  const child = await (
    await req.post("/api/folders", { data: { name: "Subcarpeta", parentId: root.id } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://dentro.example/uno",
      title: "Uno",
      description: "<p>Con descripción</p>",
      folderId: child.id,
      tagIds: [tag.id],
      favorite: true,
      fetchSnapshot: false,
    },
  });

  // Export the subtree.
  const exported = await req.post("/api/export/archive", {
    data: { scope: "folder", id: root.id },
  });
  expect(exported.ok(), await exported.text()).toBeTruthy();
  expect(exported.headers()["content-disposition"]).toContain(".abz");
  const bytes = await exported.body();
  expect(bytes.length).toBeGreaterThan(0);

  // Import it back, into the root this time.
  const imported = await req.post("/api/import/archive", {
    multipart: {
      file: { name: "copia.abz", mimeType: "application/zip", buffer: bytes },
    },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();
  const result = await imported.json();
  expect(result.folders).toBe(2);
  expect(result.bookmarks).toBe(1);

  // Copies, not replacements: the originals are still there alongside them.
  const folders = await (await req.get("/api/folders")).json();
  expect(folders.filter((f: { name: string }) => f.name === "Proyecto")).toHaveLength(2);
  const originals = folders.filter((f: { id: string }) => f.id === root.id);
  expect(originals).toHaveLength(1);

  // And the metadata the HTML export cannot carry came through.
  const bookmarks = await (await req.get("/api/bookmarks")).json();
  const copies = bookmarks.filter((b: { title: string }) => b.title === "Uno");
  expect(copies).toHaveLength(2);
  for (const b of copies) {
    expect(b.description).toContain("Con descripción");
    expect(b.favorite).toBe(true);
    expect(b.tagIds).toContain(tag.id); // matched by name, not duplicated
  }
  // The tag was reused rather than cloned.
  expect(
    (await (await req.get("/api/tags")).json()).filter(
      (t: { name: string }) => t.name === "referencia",
    ),
  ).toHaveLength(1);

  const copiedRoot = folders.find(
    (f: { name: string; id: string }) => f.name === "Proyecto" && f.id !== root.id,
  );
  expect(copiedRoot.bgColor).toBe("#0b3a2e");
  expect(copiedRoot.description).toContain("Notas del proyecto");

  await ctx.close();
});

test("archivo .abz: con contraseña, y sin ella no se abre", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "archive.crypt.e2e@example.com",
    nickname: "archivecrypt",
    password: "SealedArchive2026x",
  });
  const req = page.request;

  await req.post("/api/bookmarks", {
    data: { url: "https://secreto.example/", title: "Secreto", fetchSnapshot: false },
  });

  const exported = await req.post("/api/export/archive", {
    data: { scope: "account", passphrase: "una-contrasena-larga" },
  });
  expect(exported.ok()).toBeTruthy();
  const bytes = await exported.body();

  // No passphrase: refused, and told why.
  const noPass = await req.post("/api/import/archive", {
    multipart: { file: { name: "c.abz", mimeType: "application/zip", buffer: bytes } },
  });
  expect(noPass.status()).toBe(400);
  expect(await noPass.text()).toMatch(/cifrado|contraseña/i);

  // Wrong passphrase: refused, and does not import half of it.
  const wrong = await req.post("/api/import/archive", {
    multipart: {
      file: { name: "c.abz", mimeType: "application/zip", buffer: bytes },
      passphrase: "otra-contrasena-larga",
    },
  });
  expect(wrong.status()).toBe(400);

  // Right passphrase: through.
  const ok = await req.post("/api/import/archive", {
    multipart: {
      file: { name: "c.abz", mimeType: "application/zip", buffer: bytes },
      passphrase: "una-contrasena-larga",
    },
  });
  expect(ok.ok(), await ok.text()).toBeTruthy();
  expect((await ok.json()).bookmarks).toBe(1);

  await ctx.close();
});

test("archivo .abz: un export de otra cuenta se importa igual", async ({
  browser,
}) => {
  // The point of the format: it leaves the account it came from. A cloud
  // backup cannot do this, because its contents are sealed with the owner's
  // key.
  const a = await browser.newContext();
  await seedSpanish(a);
  const pageA = await a.newPage();
  await signup(pageA, {
    email: "archive.share.a.e2e@example.com",
    nickname: "archivesharea",
    password: "SenderAccount26xx",
  });
  await pageA.request.post("/api/bookmarks", {
    data: { url: "https://compartido.example/", title: "De A", fetchSnapshot: false },
  });
  const bytes = await (
    await pageA.request.post("/api/export/archive", { data: { scope: "account" } })
  ).body();

  const b = await browser.newContext();
  await seedSpanish(b);
  const pageB = await b.newPage();
  await signup(pageB, {
    email: "archive.share.b.e2e@example.com",
    nickname: "archiveshareb",
    password: "ReceiverAccount26x",
  });

  const imported = await pageB.request.post("/api/import/archive", {
    multipart: { file: { name: "de-a.abz", mimeType: "application/zip", buffer: bytes } },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();

  const mine = await (await pageB.request.get("/api/bookmarks")).json();
  expect(mine.map((x: { title: string }) => x.title)).toContain("De A");

  await a.close();
  await b.close();
});
