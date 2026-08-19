import { expect, test, type Browser } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Editing the *shape* of a folder someone shared with you.
 *
 * Until now an editor share let you retype a node's text and nothing else, and
 * even that never left the shared copy: the owner's own folder never learned
 * about it. The awkward fact behind that is real — the owner's rows are
 * encrypted with the owner's key, and a member does not have it — so the
 * change happens twice: in the shared payload immediately, and in the owner's
 * folders when they are next online.
 *
 * This drives the whole loop: member adds, group sees it at once, owner comes
 * back, the bookmark is in their real folder.
 */
async function mkUser(
  browser: Browser,
  u: { email: string; nickname: string; password: string },
) {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, u);
  return { ctx, page, req: page.request };
}

const owner = {
  email: "shared.edit.owner.e2e@example.com",
  nickname: "sharededitowner",
  password: "OwnerOfTheFolder26x",
};
const member = {
  email: "shared.edit.member.e2e@example.com",
  nickname: "shareditmember",
  password: "MemberWhoEdits26xxx",
};

test("un miembro con permiso crea dentro de la carpeta compartida y llega al dueño", async ({
  browser,
}) => {
  const o = await mkUser(browser, owner);
  const m = await mkUser(browser, member);

  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Equipo" } })
  ).json();
  const group = await (
    await o.req.post("/api/groups", { data: { name: "Curro" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: member.email, expiresInDays: 7 },
    })
  ).json();
  await m.req.post(`/api/invitations/${inv.token}/accept`);
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id, access: "editor" },
  });

  let shareId = "";
  let rev = 0;
  await expect(async () => {
    const list = await (await m.req.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
    const got = await (await m.req.get(`/api/shared/${shareId}`)).json();
    expect(got.content.type).toBe("folder");
    rev = got.rev;
  }).toPass({ timeout: 15_000 });

  // The member creates a subfolder and a bookmark inside it.
  const sub = await (
    await m.req.post(`/api/shared/${shareId}/folders`, {
      data: { name: "Del miembro", baseRev: rev },
    })
  ).json();
  const created = await m.req.post(`/api/shared/${shareId}/bookmarks`, {
    data: {
      folderId: sub.id,
      url: "https://aportado.example/",
      title: "Aportado",
      baseRev: sub.rev,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();

  // The group sees it straight away, without waiting for anyone.
  const seen = await (await m.req.get(`/api/shared/${shareId}`)).json();
  const subNode = seen.content.subfolders.find(
    (f: { name: string }) => f.name === "Del miembro",
  );
  expect(subNode).toBeTruthy();
  expect(subNode.bookmarks[0].title).toBe("Aportado");

  // And so does the owner, looking at the same share.
  const ownerView = await (await o.req.get(`/api/shared/${shareId}`)).json();
  expect(
    ownerView.content.subfolders.some(
      (f: { name: string }) => f.name === "Del miembro",
    ),
  ).toBeTruthy();

  // The write-back reaches the owner's *own* folder, which is the part that
  // used to be missing entirely. The job runs as the owner, so it waits for
  // them; they are online here, so it is a matter of the worker's next tick.
  await expect(async () => {
    const folders: Array<{ id: string; name: string; parentId: string | null }> =
      await (await o.req.get("/api/folders")).json();
    const real = folders.find((f) => f.name === "Del miembro");
    expect(real).toBeTruthy();
    expect(real!.parentId).toBe(folder.id);
    expect(real!.id).toBe(sub.id); // same id, not a copy

    const bms: Array<{ title: string; folderId: string | null }> = await (
      await o.req.get("/api/bookmarks")
    ).json();
    const bm = bms.find((b) => b.title === "Aportado");
    expect(bm).toBeTruthy();
    expect(bm!.folderId).toBe(sub.id);
    // Generous on purpose: the write-back waits for the worker's next poll and
    // then for the re-seal it triggers, and CI is slower than a laptop.
  }).toPass({ timeout: 40_000 });

  await o.ctx.close();
  await m.ctx.close();
});

test("un miembro sin permiso de edición no puede crear nada", async ({
  browser,
}) => {
  const o = await mkUser(browser, {
    email: "shared.edit.ro.owner.e2e@example.com",
    nickname: "shareditroowner",
    password: "ReadOnlyOwner26xxx",
  });
  const m = await mkUser(browser, {
    email: "shared.edit.ro.member.e2e@example.com",
    nickname: "shareditromember",
    password: "ReadOnlyMember26xx",
  });

  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Solo lectura" } })
  ).json();
  const group = await (
    await o.req.post("/api/groups", { data: { name: "Lectura" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "shared.edit.ro.member.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  await m.req.post(`/api/invitations/${inv.token}/accept`);
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id, access: "viewer" },
  });

  let shareId = "";
  await expect(async () => {
    const list = await (await m.req.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
    expect((await m.req.get(`/api/shared/${shareId}`)).ok()).toBeTruthy();
  }).toPass({ timeout: 15_000 });

  const refused = await m.req.post(`/api/shared/${shareId}/folders`, {
    data: { name: "No debería" },
  });
  expect(refused.status()).toBe(403);

  // And someone outside the group gets nothing at all, not even a 403 that
  // would confirm the share exists.
  const stranger = await mkUser(browser, {
    email: "shared.edit.stranger.e2e@example.com",
    nickname: "shareditstranger",
    password: "NotInThisGroup26xx",
  });
  const denied = await stranger.req.post(`/api/shared/${shareId}/folders`, {
    data: { name: "Tampoco" },
  });
  expect(denied.status()).toBe(404);

  await o.ctx.close();
  await m.ctx.close();
  await stranger.ctx.close();
});

test("los botones de crear solo salen con permiso de edición", async ({
  browser,
}) => {
  const o = await mkUser(browser, {
    email: "shared.edit.ui.owner.e2e@example.com",
    nickname: "shareditouiwner",
    password: "UiOwnerOfShare26xx",
  });
  const m = await mkUser(browser, {
    email: "shared.edit.ui.member.e2e@example.com",
    nickname: "shareditouimember",
    password: "UiMemberOfShare26x",
  });

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Interfaz" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "shared.edit.ui.member.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  await m.req.post(`/api/invitations/${inv.token}/accept`);

  const editable = await (
    await o.req.post("/api/folders", { data: { name: "Editable" } })
  ).json();
  const readonly = await (
    await o.req.post("/api/folders", { data: { name: "Mirar" } })
  ).json();
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: editable.id, access: "editor" },
  });
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: readonly.id, access: "viewer" },
  });

  const portals: Record<string, string> = {};
  await expect(async () => {
    const list: Array<{ id: string; label: string | null }> = await (
      await m.req.get("/api/shared")
    ).json();
    expect(list.length).toBe(2);
    for (const s of list) {
      const r = await m.req.post(`/api/shared/${s.id}/import`, {
        data: { mode: "link" },
      });
      expect(r.ok()).toBeTruthy();
      const body = await r.json();
      const content = await (await m.req.get(`/api/shared/${s.id}`)).json();
      portals[content.content.name] = body.id;
    }
  }).toPass({ timeout: 30_000 });

  await m.page.goto(`/linked/${portals["Editable"]}`);
  await expect(m.page.getByRole("button", { name: "Nueva carpeta" })).toBeVisible();
  await expect(m.page.getByRole("button", { name: "Nuevo bookmark" })).toBeVisible();

  await m.page.goto(`/linked/${portals["Mirar"]}`);
  await expect(m.page.getByRole("button", { name: "Nueva carpeta" })).toHaveCount(0);

  await o.ctx.close();
  await m.ctx.close();
});
