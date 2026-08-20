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

test("mover, etiquetar y colorear dentro del compartido, y llega al dueño", async ({
  browser,
}) => {
  const o = await mkUser(browser, {
    email: "shared.ops.owner.e2e@example.com",
    nickname: "sharedopsowner",
    password: "AllOpsOwner26xxxx",
  });
  const m = await mkUser(browser, {
    email: "shared.ops.member.e2e@example.com",
    nickname: "sharedopsmember",
    password: "AllOpsMember26xxx",
  });

  const root = await (
    await o.req.post("/api/folders", { data: { name: "Proyecto" } })
  ).json();
  const dest = await (
    await o.req.post("/api/folders", {
      data: { name: "Destino", parentId: root.id },
    })
  ).json();
  const bm = await (
    await o.req.post("/api/bookmarks", {
      data: {
        url: "https://mover.example/",
        title: "Muevete",
        folderId: root.id,
        fetchSnapshot: false,
      },
    })
  ).json();

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Ops" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "shared.ops.member.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  await m.req.post(`/api/invitations/${inv.token}/accept`);
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: root.id, access: "editor" },
  });

  let shareId = "";
  let rev = 0;
  await expect(async () => {
    const list = await (await m.req.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
    const got = await (await m.req.get(`/api/shared/${shareId}`)).json();
    expect(got.content.bookmarks?.length).toBe(1);
    rev = got.rev;
  }).toPass({ timeout: 15_000 });

  // Move the bookmark into the subfolder.
  const moved = await m.req.post(
    `/api/shared/${shareId}/node/${bm.id}/move`,
    { data: { folderId: dest.id, baseRev: rev } },
  );
  expect(moved.ok(), await moved.text()).toBeTruthy();
  rev = (await moved.json()).rev;

  // Tag it (by name: the owner's tag ids mean nothing here).
  const tagged = await m.req.put(`/api/shared/${shareId}/node/${bm.id}/tags`, {
    data: { tags: ["urgente"], baseRev: rev },
  });
  expect(tagged.ok(), await tagged.text()).toBeTruthy();
  rev = (await tagged.json()).rev;

  // And colour it.
  const coloured = await m.req.put(
    `/api/shared/${shareId}/node/${bm.id}/appearance`,
    { data: { bgColor: "#123456", baseRev: rev } },
  );
  expect(coloured.ok(), await coloured.text()).toBeTruthy();

  // The group sees all three at once.
  const seen = await (await m.req.get(`/api/shared/${shareId}`)).json();
  const destNode = seen.content.subfolders.find(
    (f: { name: string }) => f.name === "Destino",
  );
  expect(destNode.bookmarks[0].title).toBe("Muevete");
  expect(destNode.bookmarks[0].tags.map((t: { name: string }) => t.name)).toContain(
    "urgente",
  );
  expect(destNode.bookmarks[0].bgColor).toBe("#123456");

  // And the owner's own bookmark ends up moved, tagged and coloured. The tag
  // is matched by name in *their* account, creating it if they lacked it.
  await expect(async () => {
    const bms: Array<{
      id: string;
      folderId: string | null;
      bgColor: string | null;
      tagIds: string[];
    }> = await (await o.req.get("/api/bookmarks")).json();
    const real = bms.find((b) => b.id === bm.id)!;
    expect(real.folderId).toBe(dest.id);
    expect(real.bgColor).toBe("#123456");
    const tags: Array<{ id: string; name: string }> = await (
      await o.req.get("/api/tags")
    ).json();
    const urgente = tags.find((t) => t.name === "urgente");
    expect(urgente).toBeTruthy();
    expect(real.tagIds).toContain(urgente!.id);
  }).toPass({ timeout: 40_000 });

  await o.ctx.close();
  await m.ctx.close();
});

test("favorito y reordenar dentro del compartido llegan al dueño", async ({
  browser,
}) => {
  const o = await mkUser(browser, {
    email: "shared.fav.owner.e2e@example.com",
    nickname: "sharedfavowner",
    password: "StarAndOrderOwn26x",
  });
  const m = await mkUser(browser, {
    email: "shared.fav.member.e2e@example.com",
    nickname: "sharedfavmember",
    password: "StarAndOrderMem26x",
  });

  const root = await (
    await o.req.post("/api/folders", { data: { name: "Lista" } })
  ).json();
  const ids: string[] = [];
  for (const title of ["Uno", "Dos", "Tres"]) {
    const b = await (
      await o.req.post("/api/bookmarks", {
        data: {
          url: `https://${title.toLowerCase()}.example/`,
          title,
          folderId: root.id,
          fetchSnapshot: false,
        },
      })
    ).json();
    ids.push(b.id);
  }

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Orden" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "shared.fav.member.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  await m.req.post(`/api/invitations/${inv.token}/accept`);
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: root.id, access: "editor" },
  });

  let shareId = "";
  let rev = 0;
  await expect(async () => {
    const list = await (await m.req.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
    const got = await (await m.req.get(`/api/shared/${shareId}`)).json();
    expect(got.content.bookmarks.map((b: { title: string }) => b.title)).toEqual([
      "Uno",
      "Dos",
      "Tres",
    ]);
    rev = got.rev;
  }).toPass({ timeout: 15_000 });

  // Star the last one.
  const starred = await m.req.put(
    `/api/shared/${shareId}/node/${ids[2]}/favorite`,
    { data: { favorite: true, baseRev: rev } },
  );
  expect(starred.ok(), await starred.text()).toBeTruthy();
  rev = (await starred.json()).rev;

  // And drag it to the front: a move to index 0 inside the same folder.
  const moved = await m.req.post(`/api/shared/${shareId}/node/${ids[2]}/move`, {
    data: { folderId: root.id, position: 0, baseRev: rev },
  });
  expect(moved.ok(), await moved.text()).toBeTruthy();

  // The order travels in the shared copy, which is the whole point.
  const seen = await (await m.req.get(`/api/shared/${shareId}`)).json();
  expect(seen.content.bookmarks.map((b: { title: string }) => b.title)).toEqual([
    "Tres",
    "Uno",
    "Dos",
  ]);
  expect(
    seen.content.bookmarks.find((b: { title: string }) => b.title === "Tres")
      .favorite,
  ).toBe(true);

  // And both reach the owner's own rows.
  await expect(async () => {
    const bms: Array<{ id: string; favorite: boolean; position: number }> =
      await (await o.req.get("/api/bookmarks")).json();
    const tres = bms.find((b) => b.id === ids[2])!;
    expect(tres.favorite).toBe(true);
    const mine = bms
      .filter((b) => ids.includes(b.id))
      .sort((a, b) => a.position - b.position)
      .map((b) => b.id);
    expect(mine[0]).toBe(ids[2]);
  }).toPass({ timeout: 40_000 });

  await o.ctx.close();
  await m.ctx.close();
});

test("icono, fondo y árbol lateral de una carpeta compartida", async ({
  browser,
}) => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const o = await mkUser(browser, {
    email: "shared.assets.owner.e2e@example.com",
    nickname: "sharedassetsown",
    password: "IconsInShare26xxx",
  });
  const m = await mkUser(browser, {
    email: "shared.assets.member.e2e@example.com",
    nickname: "sharedassetsmem",
    password: "IconsInShareMem26x",
  });

  const root = await (
    await o.req.post("/api/folders", { data: { name: "Raiz" } })
  ).json();
  const sub = await (
    await o.req.post("/api/folders", { data: { name: "Rama", parentId: root.id } })
  ).json();
  await o.req.post("/api/folders", {
    data: { name: "Hoja", parentId: sub.id },
  });

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Assets" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "shared.assets.member.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  await m.req.post(`/api/invitations/${inv.token}/accept`);
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: root.id, access: "editor" },
  });

  let shareId = "";
  await expect(async () => {
    const list = await (await m.req.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
    expect((await m.req.get(`/api/shared/${shareId}`)).ok()).toBeTruthy();
  }).toPass({ timeout: 15_000 });

  // The member gives the shared folder itself an icon.
  const up = await m.req.post(
    `/api/shared/${shareId}/node/${root.id}/asset/icon`,
    { multipart: { file: { name: "i.png", mimeType: "image/png", buffer: PNG } } },
  );
  expect(up.ok(), await up.text()).toBeTruthy();

  // The group sees it at once, served from the share's own store.
  const seen = await (await m.req.get(`/api/shared/${shareId}`)).json();
  expect(seen.content.icon).toBeTruthy();
  const served = await m.req.get(
    `/api/shared/${shareId}/asset/${root.id}/icon`,
  );
  expect(served.ok()).toBeTruthy();
  expect((await served.body()).equals(PNG)).toBeTruthy();

  // And it becomes the owner's own icon, sealed with their key.
  await expect(async () => {
    const folders: Array<{ id: string; iconBlobPath: string | null }> = await (
      await o.req.get("/api/folders")
    ).json();
    expect(folders.find((f) => f.id === root.id)?.iconBlobPath).toBeTruthy();
    const own = await o.req.get(`/api/folders/${root.id}/icon`);
    expect(own.ok()).toBeTruthy();
    expect((await own.body()).equals(PNG)).toBeTruthy();
  }).toPass({ timeout: 40_000 });

  // The sidebar shows the share as a tree, not as a leaf: a linked portal's
  // children live in the payload, not in the member's own folders.
  let portalId = "";
  await expect(async () => {
    const r = await m.req.post(`/api/shared/${shareId}/import`, {
      data: { mode: "link" },
    });
    expect(r.ok()).toBeTruthy();
    portalId = (await r.json()).id;
  }).toPass({ timeout: 30_000 });

  await m.page.goto(`/linked/${portalId}`);
  const sidebar = m.page.locator("nav").first();
  await expect(sidebar.getByText("Rama", { exact: true })).toBeVisible();
  // And drilling in from the sidebar lands on that folder inside the share.
  await sidebar.getByText("Rama", { exact: true }).click();
  await expect(m.page.getByRole("heading", { name: "Rama" })).toBeVisible();
  await expect(sidebar.getByText("Hoja", { exact: true })).toBeVisible();

  await o.ctx.close();
  await m.ctx.close();
});

test("editar en el compartido usa los mismos diálogos que mis carpetas", async ({
  browser,
}) => {
  // The complaint this pins down: the shared flows used to be bare uploads,
  // while personal folders get the icon library, emoji, and the background
  // picker with its modes. The fix is reuse, so the assertions look for the
  // personal dialogs' own controls inside a share.
  const o = await mkUser(browser, {
    email: "shared.parity.owner.e2e@example.com",
    nickname: "sharedparityown",
    password: "SameDialogsOwn26xx",
  });
  const m = await mkUser(browser, {
    email: "shared.parity.member.e2e@example.com",
    nickname: "sharedparitymem",
    password: "SameDialogsMem26xx",
  });

  const root = await (
    await o.req.post("/api/folders", { data: { name: "Paridad" } })
  ).json();
  await o.req.post("/api/folders", {
    data: { name: "Hija", parentId: root.id },
  });
  const group = await (
    await o.req.post("/api/groups", { data: { name: "Mismo" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "shared.parity.member.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  await m.req.post(`/api/invitations/${inv.token}/accept`);
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: root.id, access: "editor" },
  });

  let shareId = "";
  let portalId = "";
  await expect(async () => {
    const list = await (await m.req.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
    const r = await m.req.post(`/api/shared/${shareId}/import`, {
      data: { mode: "link" },
    });
    expect(r.ok()).toBeTruthy();
    portalId = (await r.json()).id;
  }).toPass({ timeout: 30_000 });

  await m.page.goto(`/linked/${portalId}`);
  const card = m.page
    .locator("div.group.relative")
    .filter({ hasText: "Hija" })
    .first();

  // The kebab's Apariencia opens the personal appearance dialog: its text-tone
  // control only exists there.
  await card.getByRole("button", { name: "Más acciones" }).click();
  // The toolbar has its own Apariencia for the current folder; the kebab's
  // entry renders after it.
  await m.page.getByRole("button", { name: "Apariencia" }).last().click();
  await expect(
    m.page.getByRole("heading", { name: "Apariencia" }),
  ).toBeVisible();
  await expect(m.page.getByText("Color del texto")).toBeVisible();
  await expect(m.page.getByRole("button", { name: "Imagen" })).toBeVisible();
  await m.page.keyboard.press("Escape");

  // Editar opens the full form with the icon library — the exact thing the
  // bare upload was missing — plus tags and the background picker.
  await card.getByRole("button", { name: "Más acciones" }).click();
  await m.page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(
    m.page.getByRole("heading", { name: "Editar elemento compartido" }),
  ).toBeVisible();
  await expect(m.page.getByRole("button", { name: "Biblioteca" })).toBeVisible();
  await expect(m.page.getByPlaceholder(/tag/i).first()).toBeVisible();

  // Pick a predefined emoji from the library — the same path the sidebar
  // test walks on a personal folder — then rename, and save.
  await m.page.getByRole("button", { name: "Biblioteca" }).click();
  await m.page.getByRole("button", { name: "Emojis" }).click();
  await m.page.getByRole("button", { name: "🚀" }).first().click();
  await m.page.getByPlaceholder("Nombre").first().fill("Hija renombrada");
  await m.page.getByRole("button", { name: "Guardar", exact: true }).click();

  // Saved into the share: new name, and the icon is a real asset the group
  // can fetch.
  await expect(async () => {
    const got = await (await m.req.get(`/api/shared/${shareId}`)).json();
    const child = got.content.subfolders[0];
    expect(child.name).toBe("Hija renombrada");
    expect(child.icon).toBeTruthy();
    const served = await m.req.get(
      `/api/shared/${shareId}/asset/${child.id}/icon`,
    );
    expect(served.ok()).toBeTruthy();
  }).toPass({ timeout: 10_000 });

  await o.ctx.close();
  await m.ctx.close();
});
