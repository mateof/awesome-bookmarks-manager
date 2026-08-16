import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Panels rebuild themselves in the background when their content changes, so
 * the published page no longer needs a manual "Regenerar" — including content
 * that only belongs to the panel through a symlink.
 */
const user = {
  email: "panel.autosync.e2e@example.com",
  nickname: "autosyncuser",
  password: "PanelAutoSync2024x",
};

test("paneles: se regeneran solos al cambiar su contenido", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const root = await (
    await req.post("/api/folders", { data: { name: "AutoRoot" } })
  ).json();
  await req.post("/api/bookmarks", {
    data: { url: "https://uno.example/", title: "Uno", folderId: root.id, fetchSnapshot: false },
  });
  await req.post("/api/panels", {
    data: { title: "AutoPanel", slug: "autopanel", folderId: root.id, accessMode: "public" },
  });

  await expect(async () => {
    const r = await (await req.get("/api/public/panel/autopanel")).json();
    expect(JSON.stringify(r.root)).toContain("Uno");
  }).toPass({ timeout: 30_000 });

  // Add a bookmark: the panel picks it up without touching "Regenerar".
  await req.post("/api/bookmarks", {
    data: { url: "https://dos.example/", title: "Dos", folderId: root.id, fetchSnapshot: false },
  });
  await expect(async () => {
    const r = await (await req.get("/api/public/panel/autopanel")).json();
    expect(JSON.stringify(r.root)).toContain("Dos");
  }).toPass({ timeout: 30_000 });

  // Content reachable only through a symlink also triggers a rebuild.
  const otra = await (
    await req.post("/api/folders", { data: { name: "Otra" } })
  ).json();
  await req.post("/api/aliases", {
    data: { targetType: "folder", targetId: otra.id, parentId: root.id },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://tres.example/", title: "Tres", folderId: otra.id, fetchSnapshot: false },
  });
  await expect(async () => {
    const r = await (await req.get("/api/public/panel/autopanel")).json();
    expect(JSON.stringify(r.root)).toContain("Tres");
  }).toPass({ timeout: 30_000 });
});
