import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A panel offers a "Descargar marcadores" button that produces a Netscape
 * bookmarks file (the format Chrome/Firefox/Edge import), preserving the folder
 * hierarchy. The file is built in the browser from the tree already on screen.
 */
const user = {
  email: "panel.download.e2e@example.com",
  nickname: "paneldluser",
  password: "ExportToBrowser24x",
};

test("panel: descarga un fichero de marcadores importable", async ({ browser }) => {
  const ctx = await browser.newContext({ acceptDownloads: true });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const root = await (
    await req.post("/api/folders", { data: { name: "Raiz" } })
  ).json();
  const sub = await (
    await req.post("/api/folders", { data: { name: "Subcarpeta", parentId: root.id } })
  ).json();
  await req.post("/api/bookmarks", {
    data: { url: "https://arriba.example/", title: "Arriba", folderId: root.id, fetchSnapshot: false },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://abajo.example/", title: "Abajo", folderId: sub.id, fetchSnapshot: false },
  });
  await req.post("/api/panels", {
    data: { title: "PanelDescarga", slug: "paneldescarga", folderId: root.id, accessMode: "public" },
  });

  await expect(async () => {
    await page.goto("/panel/paneldescarga");
    await expect(page.getByText("Arriba", { exact: true })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Descargar marcadores/ }).click(),
  ]);

  const path = await download.path();
  const html = await readFile(path!, "utf8");

  // Importable format, with the whole hierarchy inside one wrapper folder named
  // after the heading the visitor sees (the panel's display title).
  expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
  expect(html).toContain("<H3>Raiz</H3>");
  expect(html).toContain("<H3>Subcarpeta</H3>");
  expect(html).toContain('<A HREF="https://arriba.example/">Arriba</A>');
  expect(html).toContain('<A HREF="https://abajo.example/">Abajo</A>');

  // The nested bookmark really is nested, not flattened next to the root one.
  expect(html.indexOf("Subcarpeta")).toBeLessThan(html.indexOf("Abajo"));
  expect(download.suggestedFilename()).toMatch(/\.html$/);
});
