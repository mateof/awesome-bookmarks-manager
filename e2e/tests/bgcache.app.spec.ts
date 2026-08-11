import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Regression: a folder/bookmark background image is served from a URL that is
 * stable per id and the blob is overwritten in place, so with a long max-age
 * the browser kept showing the old image after a change. The endpoints now
 * revalidate via an ETag derived from updatedAt: 304 when unchanged, fresh
 * bytes (new ETag) after a change.
 */
const user = {
  email: "chien.wu@example.com",
  nickname: "chienwu",
  password: "BetaDecayParity1956",
};
const user2 = {
  email: "lise.meitner@example.com",
  nickname: "lisem",
  password: "NuclearFission1938x",
};

function extractV(style: string | null): string | null {
  const m = style?.match(/bg-image\?v=([^')]+)/);
  return m ? m[1] : null;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const imgA = Buffer.concat([PNG, Buffer.from("AAAAAAAA")]);
const imgB = Buffer.concat([PNG, Buffer.from("BBBBBBBB")]);

test("el fondo cambia al subir otra imagen (revalidación por ETag)", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Fondo" } })
  ).json();
  const url = `/api/folders/${folder.id}/bg-image`;

  // Upload image A.
  const upA = await req.post(url, {
    multipart: { file: { name: "a.png", mimeType: "image/png", buffer: imgA } },
  });
  expect(upA.ok()).toBeTruthy();

  const getA = await req.get(url);
  expect(getA.status()).toBe(200);
  const etagA = getA.headers().etag;
  expect(etagA).toBeTruthy();
  expect(getA.headers()["cache-control"]).toContain("no-cache");
  const bodyA = await getA.body();

  // Same ETag -> 304 Not Modified.
  const notMod = await req.get(url, { headers: { "If-None-Match": etagA } });
  expect(notMod.status()).toBe(304);

  // A different updatedAt is needed for a distinct ETag; the setter uses
  // millisecond precision, so give it a beat.
  await new Promise((r) => setTimeout(r, 15));

  // Upload image B (different bytes).
  const upB = await req.post(url, {
    multipart: { file: { name: "b.png", mimeType: "image/png", buffer: imgB } },
  });
  expect(upB.ok()).toBeTruthy();

  // The old ETag must NOT 304 anymore; we get fresh bytes and a new ETag.
  const getB = await req.get(url, { headers: { "If-None-Match": etagA } });
  expect(getB.status()).toBe(200);
  const etagB = getB.headers().etag;
  expect(etagB).toBeTruthy();
  expect(etagB).not.toBe(etagA);
  const bodyB = await getB.body();
  expect(bodyB.equals(bodyA)).toBe(false);
  expect(bodyB.equals(imgB)).toBe(true);
});

test("la vista de carpeta refresca el fondo al cambiarlo (URL con versión)", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user2);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Portada" } })
  ).json();
  const url = `/api/folders/${folder.id}/bg-image`;
  await req.post(url, {
    multipart: { file: { name: "a.png", mimeType: "image/png", buffer: imgA } },
  });

  await page.goto(`/folder/${folder.id}`);
  const banner = page.locator('[style*="bg-image"]').first();
  await expect(banner).toBeVisible();
  const v1 = extractV(await banner.getAttribute("style"));
  expect(v1).toBeTruthy();

  // Change the image (a distinct updatedAt needs a beat) and reload.
  await new Promise((r) => setTimeout(r, 15));
  await req.post(url, {
    multipart: { file: { name: "b.png", mimeType: "image/png", buffer: imgB } },
  });
  await page.reload();

  const banner2 = page.locator('[style*="bg-image"]').first();
  await expect(banner2).toBeVisible();
  const v2 = extractV(await banner2.getAttribute("style"));
  expect(v2).toBeTruthy();
  // The versioned URL changed, so the browser refetches the new image.
  expect(v2).not.toBe(v1);
});
