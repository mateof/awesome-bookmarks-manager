import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Phase C: optimistic concurrency (rev / 409) and cascade soft-delete.
 * Exercised at the API level using the signed-in session cookie that the
 * browser context carries after signup.
 */
const hedy = {
  email: "hedy.lamarr@example.com",
  nickname: "hedy",
  password: "FrequencyHopping1942",
};

test("concurrencia: rev optimista (409) y cascada de borrado", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, hedy);
  const req = page.request;

  // --- Optimistic concurrency ---
  const folder = await (
    await req.post("/api/folders", { data: { name: "Docs" } })
  ).json();
  expect(folder.rev).toBe(1);

  const first = await req.patch(`/api/folders/${folder.id}`, {
    data: { name: "Docs v2", baseRev: 1 },
  });
  expect(first.ok()).toBeTruthy();
  expect((await first.json()).rev).toBe(2);

  // Replaying the old baseRev is a stale write -> 409.
  const stale = await req.patch(`/api/folders/${folder.id}`, {
    data: { name: "Docs v3", baseRev: 1 },
  });
  expect(stale.status()).toBe(409);

  // The current rev works.
  const ok = await req.patch(`/api/folders/${folder.id}`, {
    data: { name: "Docs v3", baseRev: 2 },
  });
  expect(ok.ok()).toBeTruthy();

  // --- Cascade soft-delete ---
  const parent = await (
    await req.post("/api/folders", { data: { name: "Parent" } })
  ).json();
  const child = await (
    await req.post("/api/folders", {
      data: { name: "Child", parentId: parent.id },
    })
  ).json();
  const bm = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://example.org/",
        title: "In parent",
        folderId: parent.id,
        fetchSnapshot: false,
      },
    })
  ).json();

  expect((await req.delete(`/api/folders/${parent.id}`)).ok()).toBeTruthy();

  const folderIds = (await (await req.get("/api/folders")).json()).map(
    (f: { id: string }) => f.id,
  );
  expect(folderIds).not.toContain(parent.id);
  expect(folderIds).not.toContain(child.id); // cascaded, not orphaned

  const bmIds = (await (await req.get("/api/bookmarks")).json()).map(
    (b: { id: string }) => b.id,
  );
  expect(bmIds).not.toContain(bm.id); // cascaded

  await ctx.close();
});
