import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A panel can carry a custom uploaded background (image/gif/video). It is
 * stored MASTER_KEY-sealed and streamed from a public route, overriding the
 * template's decorative scene.
 */
const user = {
  email: "chienshiung.wu@example.com",
  nickname: "chiensw",
  password: "ParityViolation1956",
};

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("panel: fondo personalizado subido se sirve y se muestra", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "BgRoot" } })
  ).json();
  await req.post("/api/bookmarks", {
    data: { url: "https://bg.example/", title: "BgMark", folderId: folder.id, fetchSnapshot: false },
  });
  const panel = await (
    await req.post("/api/panels", {
      data: { title: "BgPanel", slug: "bgpanel", folderId: folder.id, accessMode: "public" },
    })
  ).json();

  // No custom background yet.
  let pub = await (await req.get("/api/public/panel/bgpanel")).json();
  expect(pub.bgAssetKind ?? null).toBeNull();

  // Upload a PNG background.
  const up = await req.post(`/api/panels/${panel.id}/background`, {
    multipart: { file: { name: "bg.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(up.ok(), await up.text()).toBeTruthy();
  expect((await up.json()).bgAssetKind).toBe("image");

  // Public response advertises the asset; the asset streams as an image.
  pub = await (await req.get("/api/public/panel/bgpanel")).json();
  expect(pub.bgAssetKind).toBe("image");
  const bg = await req.get("/api/public/panel/bgpanel/background");
  expect(bg.ok()).toBeTruthy();
  expect(bg.headers()["content-type"]).toContain("image/png");

  // The panel page renders the uploaded background image.
  await expect(async () => {
    await page.goto("/panel/bgpanel");
    await expect(page.getByText("BgMark", { exact: true })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.locator('img[src*="/panel/bgpanel/background"]')).toBeVisible();

  // Removing it clears the asset (404 afterwards).
  const del = await req.delete(`/api/panels/${panel.id}/background`);
  expect(del.ok()).toBeTruthy();
  const bg404 = await req.get("/api/public/panel/bgpanel/background");
  expect(bg404.status()).toBe(404);
});
