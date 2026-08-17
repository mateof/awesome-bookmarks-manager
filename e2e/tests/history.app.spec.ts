import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Version history: snapshots are recorded on create and on every edit, the list
 * reads newest-first, restoring brings back a past state (and is itself
 * undoable), forking creates an independent copy, and the folder activity feed
 * covers the whole subtree.
 */
const user = {
  email: "history.e2e@example.com",
  nickname: "historyuser",
  password: "VersionHistory2024",
};

interface VersionMeta {
  id: string;
  rev: number;
  entityId: string;
  entityType: string;
  createdAt: string;
}

test("historial: instantáneas, orden, restaurar, duplicar y actividad", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Historial" } })
  ).json();
  const bm = await (
    await req.post("/api/bookmarks", {
      data: { url: "https://v1.example/", title: "V1", folderId: folder.id, fetchSnapshot: false },
    })
  ).json();

  const versionsOf = async (id: string): Promise<VersionMeta[]> =>
    (await req.get(`/api/bookmarks/${id}/versions`)).json();

  // 1. Creating records exactly one baseline snapshot, at the entity's rev.
  let versions = await versionsOf(bm.id);
  expect(versions).toHaveLength(1);
  expect(versions[0]!.rev).toBe(bm.rev);

  // 2. Each edit adds a snapshot. These land inside the same second on purpose:
  //    the ordering must not depend on the clock's granularity.
  await req.patch(`/api/bookmarks/${bm.id}`, { data: { title: "V2" } });
  await req.patch(`/api/bookmarks/${bm.id}`, { data: { title: "V3" } });
  await req.patch(`/api/bookmarks/${bm.id}`, { data: { title: "V4" } });

  versions = await versionsOf(bm.id);
  expect(versions).toHaveLength(4);

  // 3. Newest first, with no repeated or missing revisions.
  const revs = versions.map((v) => v.rev);
  expect(revs).toEqual([...revs].sort((a, b) => b - a));
  expect(new Set(revs).size).toBe(revs.length);

  // The newest snapshot holds the newest content.
  const newest = await (await req.get(`/api/versions/${versions[0]!.id}`)).json();
  expect(newest.snapshot.title).toBe("V4");

  // 4. Restore an older state: content reverts, rev moves forward, and the
  //    restore itself is recorded so it can be undone.
  const v2 = versions.find((v) => v.rev === 2)!;
  const before = await (await req.get(`/api/versions/${v2.id}`)).json();
  await req.post(`/api/bookmarks/${bm.id}/versions/${v2.id}/restore`);

  const restored = await (await req.get(`/api/bookmarks/${bm.id}`)).json();
  expect(restored.title).toBe(before.snapshot.title);
  expect(restored.rev).toBeGreaterThan(4);

  versions = await versionsOf(bm.id);
  expect(versions).toHaveLength(5);
  expect(versions[0]!.rev).toBe(restored.rev);

  // 5. Fork ("duplicar"): a new bookmark with the old content, the original
  //    untouched, and a history of its own.
  const forkRes = await req.post(
    `/api/bookmarks/${bm.id}/versions/${v2.id}/fork`,
    { data: { title: "Copia V2" } },
  );
  expect(forkRes.status()).toBe(201);
  const fork = await forkRes.json();
  expect(fork.id).not.toBe(bm.id);
  expect(fork.url).toBe(before.snapshot.url);

  const forkVersions = await versionsOf(fork.id);
  expect(forkVersions).toHaveLength(1);
  expect(forkVersions[0]!.entityId).toBe(fork.id);

  const originalAfterFork = await (await req.get(`/api/bookmarks/${bm.id}`)).json();
  expect(originalAfterFork.rev).toBe(restored.rev);
  expect(await versionsOf(bm.id)).toHaveLength(5);

  // 6. Activity covers the folder and the bookmarks inside it, newest first.
  await req.patch(`/api/folders/${folder.id}`, { data: { name: "Historial 2" } });
  const activity = await (
    await req.get(`/api/folders/${folder.id}/activity`)
  ).json();

  const kinds = new Set(activity.map((a: { entityType: string }) => a.entityType));
  expect(kinds).toContain("folder");
  expect(kinds).toContain("bookmark");

  // Every entry belongs to the folder or to a bookmark living in it.
  const liveIds = new Set([folder.id, bm.id, fork.id]);
  for (const a of activity as { entityId: string }[]) {
    expect(liveIds).toContain(a.entityId);
  }

  // Consistency: the feed holds every snapshot of the entities in the subtree.
  const expected =
    (await versionsOf(bm.id)).length +
    (await versionsOf(fork.id)).length +
    ((await (await req.get(`/api/folders/${folder.id}/versions`)).json()) as [])
      .length;
  expect(activity).toHaveLength(expected);

  const times = (activity as { createdAt: string }[]).map((a) => a.createdAt);
  expect(times).toEqual([...times].sort().reverse());
});

test("historial: restaurar recupera descripción, tags y nombre de carpeta", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "history.fields.e2e@example.com",
    nickname: "histfields",
    password: "RestoreFields2024x",
  });
  const req = page.request;

  const tagA = await (
    await req.post("/api/tags", { data: { name: "uno", color: "#ff0000" } })
  ).json();
  const tagB = await (
    await req.post("/api/tags", { data: { name: "dos", color: "#00ff00" } })
  ).json();

  // A bookmark that starts with a description and one tag.
  const folder = await (
    await req.post("/api/folders", {
      data: { name: "Campos", description: "<p>Original</p>" },
    })
  ).json();
  const bm = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://campos.example/",
        title: "Campos",
        description: "<p>Descripción original</p>",
        folderId: folder.id,
        tagIds: [tagA.id],
        fetchSnapshot: false,
      },
    })
  ).json();

  const firstVersion = (
    await (await req.get(`/api/bookmarks/${bm.id}/versions`)).json()
  )[0];

  // Change everything that a snapshot is supposed to carry.
  await req.patch(`/api/bookmarks/${bm.id}`, {
    data: {
      title: "Cambiado",
      description: "<p>Otra cosa</p>",
      tagIds: [tagB.id],
      bgColor: "#123456",
    },
  });

  // Restoring must bring back description and tags, not just the title.
  await req.post(`/api/bookmarks/${bm.id}/versions/${firstVersion.id}/restore`);
  const back = await (await req.get(`/api/bookmarks/${bm.id}`)).json();
  expect(back.title).toBe("Campos");
  expect(back.description).toContain("Descripción original");
  expect(back.tagIds).toEqual([tagA.id]);

  // Same for a folder: name and description.
  const folderV1 = (
    await (await req.get(`/api/folders/${folder.id}/versions`)).json()
  )[0];
  await req.patch(`/api/folders/${folder.id}`, {
    data: { name: "Renombrada", description: "<p>Editada</p>" },
  });
  await req.post(`/api/folders/${folder.id}/versions/${folderV1.id}/restore`);
  const folderBack = await (await req.get(`/api/folders/${folder.id}`)).json();
  expect(folderBack.name).toBe("Campos");
  expect(folderBack.description).toContain("Original");

  // Forking a folder version leaves the original alone and creates a sibling.
  const forkRes = await req.post(
    `/api/folders/${folder.id}/versions/${folderV1.id}/fork`,
    { data: { name: "Campos (copia)" } },
  );
  expect(forkRes.status()).toBe(201);
  const fork = await forkRes.json();
  expect(fork.id).not.toBe(folder.id);
  expect(fork.parentId).toBe(folder.parentId);
  expect(fork.name).toBe("Campos (copia)");
  expect(
    await (await req.get(`/api/folders/${fork.id}/versions`)).json(),
  ).toHaveLength(1);
});
