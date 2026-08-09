import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Phase B: version history. Create records v1; edits append versions; restore
 * reverts (and appends); fork creates a new entity from a version; folder
 * activity aggregates subtree events.
 */
const rosalind = {
  email: "rosalind.franklin@example.com",
  nickname: "rosalind",
  password: "Photograph51DNA",
};

interface V {
  id: string;
  rev: number;
  entityType: string;
}

test("versionado: historial, restaurar, duplicar, actividad", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, rosalind);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Notas" } })
  ).json();
  const bm = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://example.com/",
        title: "v1",
        folderId: folder.id,
        fetchSnapshot: false,
      },
    })
  ).json();

  const revsOf = async (id: string): Promise<V[]> =>
    (await (await req.get(`/api/bookmarks/${id}/versions`)).json()) as V[];

  // Create -> exactly one version at rev 1.
  let versions = await revsOf(bm.id);
  expect(versions.length).toBe(1);
  expect(versions.map((v) => v.rev).sort()).toEqual([1]);

  // Edit -> a second version.
  await req.patch(`/api/bookmarks/${bm.id}`, { data: { title: "v2" } });
  versions = await revsOf(bm.id);
  expect(versions.map((v) => v.rev).sort()).toEqual([1, 2]);
  const v1 = versions.find((v) => v.rev === 1)!;

  // Restore to v1 -> title reverts, a new version is appended.
  const restored = await (
    await req.post(`/api/bookmarks/${bm.id}/versions/${v1.id}/restore`, {})
  ).json();
  expect(restored.title).toBe("v1");
  versions = await revsOf(bm.id);
  expect(versions.length).toBe(3);

  // Fork from v1 -> a brand new bookmark with the given title.
  const forked = await (
    await req.post(`/api/bookmarks/${bm.id}/versions/${v1.id}/fork`, {
      data: { title: "Copia" },
    })
  ).json();
  expect(forked.id).not.toBe(bm.id);
  expect(forked.title).toBe("Copia");

  // Folder activity aggregates subtree events (bookmarks included).
  const activity = await (
    await req.get(`/api/folders/${folder.id}/activity`)
  ).json();
  expect(Array.isArray(activity)).toBeTruthy();
  expect(activity.some((a: V) => a.entityType === "bookmark")).toBeTruthy();

  // Folder itself is versioned too.
  await req.patch(`/api/folders/${folder.id}`, { data: { name: "Notas 2" } });
  const fVersions = (await (
    await req.get(`/api/folders/${folder.id}/versions`)
  ).json()) as V[];
  expect(fVersions.length).toBeGreaterThanOrEqual(2);

  await ctx.close();
});
