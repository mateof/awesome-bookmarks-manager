import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";
import { selfSignedCert, startFakeDav } from "../fixtures/webdav.js";

/**
 * Listing backups and creating folders on a WebDAV server.
 *
 * Both were broken and neither had a test, which is not a coincidence: the
 * listing resolved its filename prefix as if it were a directory, and folder
 * creation used the library's recursive mode, which throws on the 405 a server
 * returns for a collection that already exists. The fake server answers 405 in
 * exactly that case, so this would fail again if either regressed.
 */
const user = {
  email: "webdav.ops.e2e@example.com",
  nickname: "webdavopsuser",
  password: "ListAndMkcol2026x",
};

test("webdav: lista las copias por prefijo y crea carpetas anidadas", async ({
  browser,
}) => {
  const dav = await startFakeDav(selfSignedCert(), {
    dirs: ["/AwesomeBookmarks", "/otra"],
    files: {
      "/AwesomeBookmarks/awesome-bookmarks-u1-2026-08-18.zip": 1024,
      "/AwesomeBookmarks/awesome-bookmarks-u1-2026-08-17.zip": 2048,
      // Not a backup: must not be listed.
      "/AwesomeBookmarks/notas.txt": 10,
    },
  });

  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const cert = await (
    await req.post("/api/cloud/inspect-cert", { data: { url: dav.url } })
  ).json();
  const creds = {
    url: dav.url,
    username: "u",
    password: "p",
    certFingerprint: cert.fingerprint,
  };

  // Creating a nested folder must succeed even though the first segment is
  // already there and the server answers 405 for it.
  const created = await req.post("/api/cloud/synology/create-dir", {
    data: { ...creds, path: "/AwesomeBookmarks/copias/2026" },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  expect(dav.dirs.has("/AwesomeBookmarks/copias")).toBe(true);
  expect(dav.dirs.has("/AwesomeBookmarks/copias/2026")).toBe(true);
  // It did try the existing one and carried on rather than giving up.
  expect(dav.mkcols).toContain("/AwesomeBookmarks/copias");

  // Idempotent: doing it again is not an error.
  const again = await req.post("/api/cloud/synology/create-dir", {
    data: { ...creds, path: "/AwesomeBookmarks/copias/2026" },
  });
  expect(again.ok(), await again.text()).toBeTruthy();

  // Now the listing, through a saved connection.
  const conn = await (
    await req.post("/api/cloud/connect/synology", {
      data: { label: "Fake NAS", ...creds, basePath: "/AwesomeBookmarks" },
    })
  ).json();

  const listed = await req.get(`/api/cloud/connections/${conn.id}/backups`);
  expect(listed.ok(), await listed.text()).toBeTruthy();
  const backups = await listed.json();

  const names = backups.map((b: { name: string }) => b.name);
  expect(names).toContain("awesome-bookmarks-u1-2026-08-18.zip");
  expect(names).toContain("awesome-bookmarks-u1-2026-08-17.zip");
  // The prefix filters: a stray file in the same folder is not a backup.
  expect(names).not.toContain("notas.txt");
  // And sizes come through, so the UI can show something useful.
  expect(backups.find((b: { name: string }) => b.name.endsWith("18.zip")).size).toBe(
    1024,
  );

  dav.server.close();
  await ctx.close();
});

test("webdav: una copia subida aparece en el listado", async ({ browser }) => {
  const dav = await startFakeDav(selfSignedCert(), { dirs: ["/AwesomeBookmarks"] });

  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "webdav.roundtrip.e2e@example.com",
    nickname: "webdavroundtrip",
    password: "UploadThenList26x",
  });
  const req = page.request;

  const cert = await (
    await req.post("/api/cloud/inspect-cert", { data: { url: dav.url } })
  ).json();
  const conn = await (
    await req.post("/api/cloud/connect/synology", {
      data: {
        label: "Fake NAS",
        url: dav.url,
        username: "u",
        password: "p",
        basePath: "/AwesomeBookmarks",
        certFingerprint: cert.fingerprint,
      },
    })
  ).json();

  // Nothing yet.
  expect(await (await req.get(`/api/cloud/connections/${conn.id}/backups`)).json()).toEqual(
    [],
  );

  // Run a real backup and wait for the job to land the file.
  const started = await req.post(`/api/cloud/connections/${conn.id}/backup`);
  expect(started.ok(), await started.text()).toBeTruthy();

  await expect
    .poll(async () => dav.files.size, { timeout: 30_000 })
    .toBeGreaterThan(0);

  // The upload the user already had working must now also be visible, which
  // is the whole complaint this fixes.
  await expect
    .poll(
      async () =>
        (await (await req.get(`/api/cloud/connections/${conn.id}/backups`)).json())
          .length,
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  dav.server.close();
  await ctx.close();
});
