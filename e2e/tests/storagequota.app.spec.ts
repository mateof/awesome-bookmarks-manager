import { expect, test } from "@playwright/test";
import { adminSession, seedSpanish, signup } from "../fixtures/app.js";

/**
 * Storage accounting and quotas.
 *
 * Two roles are needed: someone who consumes space and an admin who caps them.
 * The admin session is opened first, because the instance grants that role to
 * whoever registers first (see `adminSession`), and only then is the ordinary
 * user created.
 */
const owner = {
  email: "storage.quota.e2e@example.com",
  nickname: "storagequotauser",
  password: "DiskSpaceLimits26x",
};

/** A 1×1 PNG, uploaded repeatedly to move the needle deterministically. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("almacenamiento: se mide, se muestra y el límite frena las subidas", async ({
  browser,
}) => {
  // Opened first so the admin role does not land on `owner`.
  const admin = await adminSession(browser);
  const adminReq = admin.page.request;

  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, owner);
  const req = page.request;

  // Nothing stored yet.
  const empty = await (await req.get("/api/storage/me")).json();
  expect(empty.usedBytes).toBe(0);
  expect(empty.quotaBytes).toBeNull();
  expect(empty.quotaSource).toBe("none");

  const folder = await (
    await req.post("/api/folders", { data: { name: "Con imagen" } })
  ).json();

  // A background image is a blob: it must show up under "images".
  const up = await req.post(`/api/folders/${folder.id}/bg-image`, {
    multipart: {
      file: { name: "a.png", mimeType: "image/png", buffer: PNG },
    },
  });
  expect(up.ok(), await up.text()).toBeTruthy();

  const afterUpload = await (await req.get("/api/storage/me?fresh=1")).json();
  expect(afterUpload.usedBytes).toBeGreaterThan(0);
  expect(afterUpload.breakdown.images).toBeGreaterThan(0);

  // Encrypted rows are counted too, so the total exceeds the blob alone.
  expect(afterUpload.breakdown.database).toBeGreaterThan(0);
  expect(afterUpload.usedBytes).toBeGreaterThan(afterUpload.breakdown.images);

  // The settings screen shows it.
  await page.goto("/settings/storage");
  await expect(
    page.getByRole("heading", { name: "Mi almacenamiento" }),
  ).toBeVisible();
  await expect(page.getByText("Imágenes de fondo")).toBeVisible();
  await expect(page.getByText("sin límite")).toBeVisible();

  /* ---- the quota actually stops a write ------------------------------- */

  const rows = await (await adminReq.get("/api/admin/storage")).json();
  const mine = rows.find(
    (r: { email: string }) => r.email === owner.email,
  );
  expect(mine, "the admin report should list every account").toBeTruthy();
  expect(mine.usedBytes).toBeGreaterThan(0);
  expect(mine.quotaSource).toBe("none");

  // Cap the user just below what they already use: further writes must fail,
  // reads must not.
  const cap = await adminReq.patch(`/api/admin/users/${mine.userId}/quota`, {
    data: { quotaBytes: Math.max(1, mine.usedBytes - 1) },
  });
  expect(cap.ok(), await cap.text()).toBeTruthy();

  const capped = await (await req.get("/api/storage/me")).json();
  expect(capped.quotaBytes).toBe(Math.max(1, mine.usedBytes - 1));
  expect(capped.quotaSource).toBe("user");

  // The upload is refused with 413, not a generic 500.
  const blocked = await req.post(`/api/folders/${folder.id}/bg-image`, {
    multipart: {
      file: { name: "b.png", mimeType: "image/png", buffer: Buffer.concat([PNG, PNG]) },
    },
  });
  expect(blocked.status()).toBe(413);

  // Being over quota never blocks reading or organising your own data.
  expect((await req.get("/api/folders")).ok()).toBeTruthy();
  const stillWorks = await req.post("/api/folders", {
    data: { name: "Sigo pudiendo organizar" },
  });
  expect(stillWorks.ok()).toBeTruthy();

  // The UI says so.
  await page.reload();
  await expect(page.getByText(/Has alcanzado tu límite/)).toBeVisible();

  /* ---- inheritance from the instance default -------------------------- */

  // Clearing the override falls back to the instance default.
  await adminReq.patch(`/api/admin/users/${mine.userId}/quota`, {
    data: { quotaBytes: null },
  });
  await adminReq.patch("/api/admin/settings", {
    data: { defaultStorageQuotaBytes: 5 * 1024 * 1024 * 1024 },
  });

  const inherited = await (await req.get("/api/storage/me")).json();
  expect(inherited.quotaSource).toBe("default");
  expect(inherited.quotaBytes).toBe(5 * 1024 * 1024 * 1024);

  // With headroom again, uploading works.
  const again = await req.post(`/api/folders/${folder.id}/bg-image`, {
    multipart: {
      file: { name: "c.png", mimeType: "image/png", buffer: PNG },
    },
  });
  expect(again.ok(), await again.text()).toBeTruthy();

  // And removing the default restores "no limit" for everyone.
  await adminReq.patch("/api/admin/settings", {
    data: { defaultStorageQuotaBytes: null },
  });
  expect((await (await req.get("/api/storage/me")).json()).quotaSource).toBe("none");

  await admin.ctx.close();
});

test("almacenamiento: un usuario normal no ve el informe de todos", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "storage.nonadmin.e2e@example.com",
    nickname: "storagenonadmin",
    password: "NoPeekingAtOthers26",
  });

  // Own usage: fine. Everyone else's: not.
  expect((await page.request.get("/api/storage/me")).ok()).toBeTruthy();
  expect((await page.request.get("/api/admin/storage")).status()).toBe(403);
  expect(
    (
      await page.request.patch("/api/admin/settings", {
        data: { defaultStorageQuotaBytes: 1024 },
      })
    ).status(),
  ).toBe(403);

  // The admin table is not rendered for them either.
  await page.goto("/settings/storage");
  await expect(
    page.getByRole("heading", { name: "Mi almacenamiento" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Almacenamiento por usuario" }),
  ).toHaveCount(0);
});
