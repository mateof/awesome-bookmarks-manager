import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The in-process cache of decrypted lists.
 *
 * Speed is easy to measure and easy to believe. The risk this cache introduces
 * is staleness, so that is what gets tested: every kind of mutation, checked
 * through a read that would happily serve a cached answer. Validity is derived
 * from the data (row count, sum of `rev`, latest `updated_at`) rather than
 * announced by the writers, and this is what proves that holds.
 */
const user = {
  email: "decoded.cache.e2e@example.com",
  nickname: "decodedcacheuser",
  password: "NeverServeStale26x",
};

test("caché descifrada: ninguna mutación deja datos obsoletos", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const list = async () => (await (await req.get("/api/bookmarks")).json()) as
    Array<{ id: string; title: string; folderId: string | null; favorite: boolean; tagIds: string[] }>;
  const folders = async () =>
    (await (await req.get("/api/folders")).json()) as Array<{
      id: string;
      name: string;
      parentId: string | null;
    }>;

  const home = await (
    await req.post("/api/folders", { data: { name: "Origen" } })
  ).json();
  const away = await (
    await req.post("/api/folders", { data: { name: "Destino" } })
  ).json();

  // Create: a fresh row must appear even though a list was already cached.
  await list();
  const created = await (
    await req.post("/api/bookmarks", {
      data: { url: "https://uno.example/", title: "Uno", folderId: home.id, fetchSnapshot: false },
    })
  ).json();
  expect((await list()).map((b) => b.title)).toContain("Uno");

  // Update: the edit has to win over the cached copy.
  await req.patch(`/api/bookmarks/${created.id}`, { data: { title: "Uno editado" } });
  expect((await list()).find((b) => b.id === created.id)?.title).toBe("Uno editado");

  // Move: this one changes the row *without* bumping rev, which is the case
  // the signature alone could miss.
  await req.post(`/api/bookmarks/${created.id}/move`, {
    data: { newFolderId: away.id, position: 0 },
  });
  expect((await list()).find((b) => b.id === created.id)?.folderId).toBe(away.id);

  // Tag change, which arrives through the same update path.
  const tag = await (
    await req.post("/api/tags", { data: { name: "cacheado", color: "#2563eb" } })
  ).json();
  await req.patch(`/api/bookmarks/${created.id}`, { data: { tagIds: [tag.id] } });
  expect((await list()).find((b) => b.id === created.id)?.tagIds).toEqual([tag.id]);

  // Favourite toggle.
  await req.patch(`/api/bookmarks/${created.id}`, { data: { favorite: true } });
  expect((await list()).find((b) => b.id === created.id)?.favorite).toBe(true);

  // Folder rename, through the folder list's own cache.
  await folders();
  await req.patch(`/api/folders/${home.id}`, { data: { name: "Origen renombrado" } });
  expect((await folders()).find((f) => f.id === home.id)?.name).toBe(
    "Origen renombrado",
  );

  // Folder move.
  await req.post(`/api/folders/${away.id}/move`, {
    data: { newParentId: home.id, position: 0 },
  });
  expect((await folders()).find((f) => f.id === away.id)?.parentId).toBe(home.id);

  // Search reads the same cached list, so it must see the edit too.
  const found = await (
    await req.get("/api/search?q=editado")
  ).json();
  expect(
    found.some((h: { bookmark: { id: string } }) => h.bookmark.id === created.id),
  ).toBe(true);

  // Delete: soft-deleted rows must drop out.
  await req.delete(`/api/bookmarks/${created.id}`);
  expect((await list()).map((b) => b.id)).not.toContain(created.id);

  // Restore from the trash brings it back.
  await req.post("/api/trash/restore", {
    data: { type: "bookmark", id: created.id },
  });
  expect((await list()).map((b) => b.id)).toContain(created.id);

  // A write through a different surface (the v1 API with a token) must be seen
  // by the session-authenticated read: one cache serves both.
  const token = (
    await (
      await req.post("/api/extension/tokens", { data: { label: "cache-e2e" } })
    ).json()
  ).token as string;
  await req.post("/api/v1/bookmarks", {
    headers: { authorization: `Bearer ${token}` },
    data: { url: "https://porv1.example/", title: "Desde v1", fetchSnapshot: false },
  });
  expect((await list()).map((b) => b.title)).toContain("Desde v1");

  await ctx.close();
});

test("caché descifrada: no se filtra entre usuarios", async ({ browser }) => {
  const a = await browser.newContext();
  await seedSpanish(a);
  const pageA = await a.newPage();
  await signup(pageA, {
    email: "decoded.cache.a.e2e@example.com",
    nickname: "decodedcachea",
    password: "MineOnlyPlease26x",
  });
  await pageA.request.post("/api/bookmarks", {
    data: { url: "https://privado.example/", title: "Solo de A", fetchSnapshot: false },
  });
  await pageA.request.get("/api/bookmarks"); // populate A's entry

  const b = await browser.newContext();
  await seedSpanish(b);
  const pageB = await b.newPage();
  await signup(pageB, {
    email: "decoded.cache.b.e2e@example.com",
    nickname: "decodedcacheb",
    password: "NotYoursEither26xx",
  });

  const seenByB = await (await pageB.request.get("/api/bookmarks")).json();
  expect(seenByB).toEqual([]);

  await a.close();
  await b.close();
});
