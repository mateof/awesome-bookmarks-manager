import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Coming from another app.
 *
 * The importer used to read one format, the browsers' HTML, and even from that
 * it kept only the folder tree and the links: tags, notes and dates went in
 * the bin. Everybody arriving here is arriving *from* something — wallabag,
 * Pocket (which shut down and posted everyone a zip of CSVs), Raindrop,
 * Pinboard — and what they are afraid of losing is exactly the part that was
 * being dropped.
 */

const wallabag = JSON.stringify([
  {
    id: 1,
    title: "Un artículo guardado",
    url: "https://wallabag.example/uno",
    is_archived: 1,
    is_starred: 0,
    created_at: "2021-04-05T10:00:00+0200",
    tags: ["prensa", "leer"],
    content: "<p>El cuerpo entero del artículo, que no debe acabar en la nota.</p>",
  },
  {
    id: 2,
    title: "Uno con estrella",
    url: "https://wallabag.example/dos",
    is_archived: 0,
    is_starred: 1,
    created_at: "2021-04-06T10:00:00+0200",
    tags: ["prensa"],
  },
]);

const pocket = `title,url,time_added,tags,status
Guardado en Pocket,https://pocket.example/uno,1600000000,tecnologia|leer,unread
Archivado en Pocket,https://pocket.example/dos,1600000100,,archive`;

test("importar desde otras aplicaciones: wallabag y Pocket", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "import.apps.e2e@example.com",
    nickname: "importapps",
    password: "ImportApps27xxx",
  });
  const req = page.request;

  await page.goto("/settings/import-export");
  const file = page.getByLabel("Fichero a importar");
  await expect(file).toBeVisible({ timeout: 20_000 });

  await page.getByLabel(/carpeta envolvente/i).fill("Desde wallabag");
  await file.setInputFiles({
    name: "wallabag-export.json",
    mimeType: "application/json",
    buffer: Buffer.from(wallabag, "utf8"),
  });

  // It says what it recognised. A wallabag export read as an anonymous list of
  // links is the difference between the tags arriving and not, and the only
  // moment anyone can notice is this one.
  await expect(
    page.getByText(/Reconocido como wallabag: 2 marcadores/),
  ).toBeVisible({ timeout: 20_000 });

  await expect(async () => {
    const marcadores = await (await req.get("/api/bookmarks")).json();
    const uno = marcadores.find(
      (b: { url: string }) => b.url === "https://wallabag.example/uno",
    );
    const dos = marcadores.find(
      (b: { url: string }) => b.url === "https://wallabag.example/dos",
    );
    expect(uno).toBeTruthy();
    expect(dos).toBeTruthy();

    const tags = await (await req.get("/api/tags")).json();
    const nameOf = (id: string) =>
      tags.find((t: { id: string }) => t.id === id)?.name;
    expect(uno.tagIds.map(nameOf).sort()).toEqual(
      ["archivado", "leer", "prensa"].sort(),
    );
    // The star is a favourite, which this app does have.
    expect(dos.favorite).toBe(true);
    // The article body is not a description: importing wallabag must not paste
    // whole web pages into every note.
    expect(uno.description ?? "").toBe("");
    // Saved in 2021, not this afternoon.
    expect(String(uno.createdAt)).toContain("2021-04-05");
  }).toPass({ timeout: 30_000 });

  // The same screen, a different app, no setting changed.
  await page.getByLabel(/carpeta envolvente/i).fill("Desde Pocket");
  await file.setInputFiles({
    name: "part_000000.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(pocket, "utf8"),
  });
  await expect(
    page.getByText(/Reconocido como Pocket: 2 marcadores/),
  ).toBeVisible({ timeout: 20_000 });

  await expect(async () => {
    const marcadores = await (await req.get("/api/bookmarks")).json();
    const tags = await (await req.get("/api/tags")).json();
    const nameOf = (id: string) =>
      tags.find((t: { id: string }) => t.id === id)?.name;
    const uno = marcadores.find(
      (b: { url: string }) => b.url === "https://pocket.example/uno",
    );
    const dos = marcadores.find(
      (b: { url: string }) => b.url === "https://pocket.example/dos",
    );
    expect(uno).toBeTruthy();
    // Pocket separates tags with a bar, not a comma: read with the wrong one
    // this is a single tag called "tecnologia|leer".
    expect(uno.tagIds.map(nameOf).sort()).toEqual(
      ["leer", "por leer", "tecnologia"].sort(),
    );
    expect(dos.tagIds.map(nameOf)).toContain("archivado");
  }).toPass({ timeout: 30_000 });

  // Two imports, two wrapper folders, and the tag shared by both files exists
  // once: "leer" came from wallabag and from Pocket.
  const carpetas = await (await req.get("/api/folders")).json();
  const nombres = carpetas.map((f: { name: string }) => f.name);
  expect(nombres).toContain("Desde wallabag");
  expect(nombres).toContain("Desde Pocket");
  const tags = await (await req.get("/api/tags")).json();
  expect(tags.filter((t: { name: string }) => t.name === "leer")).toHaveLength(1);

  await ctx.close();
});
