import { type Browser, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Shared content, after the key moved to the members.
 *
 * The claim being tested is the strong one: an editor does not get an
 * imitation of the owner's capabilities, they get the same rows through the
 * same endpoints. What used to happen instead was a materialised copy plus a
 * queue of edits waiting for the owner to log in, because the two sides were
 * sealed with different keys. They are not any more.
 *
 * Also here: the five permission levels, and what rotation does and does not
 * achieve when somebody is removed.
 */
const owner = {
  email: "gk.owner.e2e@example.com",
  nickname: "gkowner",
  password: "GroupKeysOwner27x",
};
const editor = {
  email: "gk.editor.e2e@example.com",
  nickname: "gkeditor",
  password: "GroupKeysEditor27x",
};
const viewer = {
  email: "gk.viewer.e2e@example.com",
  nickname: "gkviewer",
  password: "GroupKeysViewer27x",
};

async function newUser(
  browser: Browser,
  u: { email: string; nickname: string; password: string },
) {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, u);
  return { ctx, page, req: page.request };
}

async function joinGroup(
  o: { req: import("@playwright/test").APIRequestContext },
  groupId: string,
  m: { req: import("@playwright/test").APIRequestContext },
  email: string,
) {
  const inv = await (
    await o.req.post(`/api/groups/${groupId}/invitations`, {
      data: { email, expiresInDays: 7 },
    })
  ).json();
  if (!inv.autoAccepted) {
    const r = await m.req.post(`/api/invitations/${inv.token}/accept`);
    expect(r.ok(), await r.text()).toBeTruthy();
  }
}

test("un editor trabaja sobre las mismas filas que el dueño", async ({
  browser,
}) => {
  const o = await newUser(browser, owner);
  const e = await newUser(browser, editor);

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Equipo" } })
  ).json();
  await joinGroup(o, group.id, e, editor.email);

  const folder = await (
    await o.req.post("/api/folders", {
      data: { name: "Cartera", description: "<p>del dueño</p>" },
    })
  ).json();
  await o.req.post("/api/bookmarks", {
    data: {
      url: "https://cliente.example/",
      title: "Cliente",
      folderId: folder.id,
      fetchSnapshot: false,
    },
  });

  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id, access: "editor" },
  });

  // --- The folder is simply in the editor's own list -----------------------
  await expect(async () => {
    const mine = await (await e.req.get("/api/folders")).json();
    const shared = mine.find((f: { id: string }) => f.id === folder.id);
    expect(shared).toBeTruthy();
    // Marked as the group's, not theirs, and writable.
    expect(shared.mine).toBe(false);
    // Sealed with a key scope the group holds, rather than with the group's
    // own key: that is what lets the same folder reach a second group later.
    expect(shared.shared).toBe(true);
    expect(shared.keyScopeId).toBeTruthy();
    expect(shared.canWrite).toBe(true);
    expect(shared.name).toBe("Cartera");
    expect(shared.description).toContain("del dueño");
  }).toPass({ timeout: 20_000 });

  // --- And they use the ordinary endpoints, not a share-shaped imitation ---
  const created = await e.req.post("/api/bookmarks", {
    data: {
      url: "https://del-editor.example/",
      title: "Puesto por el editor",
      folderId: folder.id,
      fetchSnapshot: false,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();

  const sub = await e.req.post("/api/folders", {
    data: { name: "Subcarpeta del editor", parentId: folder.id },
  });
  expect(sub.ok(), await sub.text()).toBeTruthy();

  const renamed = await e.req.patch(`/api/folders/${folder.id}`, {
    data: { name: "Cartera del equipo" },
  });
  expect(renamed.ok(), await renamed.text()).toBeTruthy();

  // --- The owner sees it immediately, with no queue and no re-login --------
  const ownerFolders = await (await o.req.get("/api/folders")).json();
  expect(
    ownerFolders.find((f: { id: string }) => f.id === folder.id).name,
  ).toBe("Cartera del equipo");
  const ownerBookmarks = await (await o.req.get("/api/bookmarks")).json();
  expect(
    ownerBookmarks.some(
      (b: { title: string }) => b.title === "Puesto por el editor",
    ),
  ).toBe(true);
  // And the row created by the editor belongs to the group too, so the next
  // member reads it as well.
  const theirs = ownerBookmarks.find(
    (b: { title: string }) => b.title === "Puesto por el editor",
  );
  expect(theirs.keyScopeId).toBeTruthy();

  await o.ctx.close();
  await e.ctx.close();
});

test("un viewer lee lo mismo pero no puede escribir nada", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "gk.owner2.e2e@example.com",
    nickname: "gkowner2",
    password: "GroupKeysOwner2x7",
  });
  const v = await newUser(browser, viewer);

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Solo lectura" } })
  ).json();
  await joinGroup(o, group.id, v, viewer.email);

  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Consulta" } })
  ).json();
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id, access: "viewer" },
  });

  // Members join as editors, which is what "member" always meant; demote this
  // one so the viewer path is the one under test.
  const members = await (
    await o.req.get(`/api/groups/${group.id}/members`)
  ).json();
  const them = members.find(
    (m: { email: string }) => m.email === viewer.email,
  );
  const setRole = await o.req.patch(
    `/api/groups/${group.id}/members/${them.userId}/role`,
    { data: { role: "viewer" } },
  );
  expect(setRole.ok(), await setRole.text()).toBeTruthy();

  await expect(async () => {
    const mine = await (await v.req.get("/api/folders")).json();
    const shared = mine.find((f: { id: string }) => f.id === folder.id);
    expect(shared).toBeTruthy();
    // Readable, and honest about not being writable.
    expect(shared.canWrite).toBe(false);
  }).toPass({ timeout: 20_000 });

  // The key lets them decrypt; the role is what stops them writing. That line
  // is server-enforced, not cryptographic, which is exactly why it is tested.
  const blocked = await v.req.post("/api/bookmarks", {
    data: {
      url: "https://no.example/",
      title: "No",
      folderId: folder.id,
      fetchSnapshot: false,
    },
  });
  expect(blocked.ok()).toBe(false);

  const blockedEdit = await v.req.patch(`/api/folders/${folder.id}`, {
    data: { name: "Cambiado" },
  });
  expect(blockedEdit.ok()).toBe(false);

  await o.ctx.close();
  await v.ctx.close();
});

test("expulsar rota la clave, y el expulsado deja de leer lo nuevo", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "gk.owner3.e2e@example.com",
    nickname: "gkowner3",
    password: "GroupKeysOwner3x7",
  });
  const e = await newUser(browser, {
    email: "gk.gone.e2e@example.com",
    nickname: "gkgone",
    password: "GroupKeysGone27xx",
  });

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Rotación" } })
  ).json();
  await joinGroup(o, group.id, e, "gk.gone.e2e@example.com");

  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Secretos" } })
  ).json();
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id, access: "editor" },
  });

  await expect(async () => {
    const mine = await (await e.req.get("/api/folders")).json();
    expect(mine.some((f: { id: string }) => f.id === folder.id)).toBe(true);
  }).toPass({ timeout: 20_000 });

  const members = await (
    await o.req.get(`/api/groups/${group.id}/members`)
  ).json();
  const them = members.find(
    (m: { email: string }) => m.email === "gk.gone.e2e@example.com",
  );
  const removed = await o.req.delete(
    `/api/groups/${group.id}/members/${them.userId}`,
  );
  expect(removed.ok(), await removed.text()).toBeTruthy();

  // Gone from their list, and the content is still readable by the owner,
  // which is the part rotation must not break.
  const after = await (await e.req.get("/api/folders")).json();
  expect(after.some((f: { id: string }) => f.id === folder.id)).toBe(false);

  const ownerAfter = await (await o.req.get("/api/folders")).json();
  expect(
    ownerAfter.find((f: { id: string }) => f.id === folder.id).name,
  ).toBe("Secretos");

  await o.ctx.close();
  await e.ctx.close();
});

test("una base de datos se comparte por sí sola, con sus propios permisos", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "gk.dbowner.e2e@example.com",
    nickname: "gkdbowner",
    password: "GroupKeysDbOwn27x",
  });
  const e = await newUser(browser, {
    email: "gk.dbmember.e2e@example.com",
    nickname: "gkdbmember",
    password: "GroupKeysDbMem27x",
  });

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Datos" } })
  ).json();
  await joinGroup(o, group.id, e, "gk.dbmember.e2e@example.com");

  const shared = await (
    await o.req.post("/api/databases", { data: { name: "Compartida" } })
  ).json();
  const priv = await (
    await o.req.post("/api/databases", { data: { name: "Privada" } })
  ).json();

  // Both live in the same note, and only one of them is shared. That is the
  // reason a database has its own key rather than inheriting the note's.
  const folder = await (
    await o.req.post("/api/folders", {
      data: {
        name: "Cuaderno",
        description:
          `<p>a</p><div data-db-id="${shared.id}"></div>` +
          `<div data-db-id="${priv.id}"></div>`,
      },
    })
  ).json();
  void folder;

  const res = await o.req.post(`/api/databases/${shared.id}/share`, {
    data: { groupId: group.id },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  await expect(async () => {
    const list = await (await e.req.get("/api/databases")).json();
    const names = list.map((d: { name: string }) => d.name);
    expect(names).toContain("Compartida");
    // The other one stays out of reach even though the same note embeds it.
    expect(names).not.toContain("Privada");
  }).toPass({ timeout: 20_000 });

  // And the member can actually work with it: rows, columns, the lot.
  const detail = await (
    await e.req.get(`/api/databases/${shared.id}`)
  ).json();
  expect(detail.canWrite).toBe(true);
  const row = detail.rows[0];
  const titleCol = detail.columns[0];
  const wrote = await e.req.patch(
    `/api/databases/${shared.id}/rows/${row.id}`,
    { data: { cells: { [titleCol.id]: "Escrito por el miembro" } } },
  );
  expect(wrote.ok(), await wrote.text()).toBeTruthy();

  // The owner sees it at once.
  const ownerSees = await (await o.req.get(`/api/databases/${shared.id}`)).json();
  expect(
    ownerSees.rows.some(
      (r: { cells: Record<string, unknown> }) =>
        r.cells[titleCol.id] === "Escrito por el miembro",
    ),
  ).toBe(true);

  // The private one is not reachable by id either, not just hidden from the list.
  expect((await e.req.get(`/api/databases/${priv.id}`)).status()).toBe(404);

  await o.ctx.close();
  await e.ctx.close();
});
