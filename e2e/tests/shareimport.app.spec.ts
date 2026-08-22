import { type APIRequestContext, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Importing a shared folder has two modes:
 *  - link (default): a single live "symlink" portal (linkedShareId set,
 *    shared badge), no subtree copied.
 *  - copy: a fully-owned point-in-time snapshot (subtree copied, no badge).
 */
const owner = {
  email: "edith.clarke@example.com",
  nickname: "edithc",
  password: "PowerEngineer1919x",
};
const member = {
  email: "beatrice.hicks@example.com",
  nickname: "beatriceh",
  password: "FirstWomanASME1950",
};

interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  shareOrigin: string | null;
  linkedShareId: string | null;
  mine: boolean;
  keyGroupId: string | null;
  keyScopeId: string | null;
  shared: boolean;
}

test("importar carpeta compartida: modo enlace (symlink) y modo copia", async ({
  browser,
}) => {
  const mk = async (u: {
    email: string;
    nickname: string;
    password: string;
  }): Promise<APIRequestContext> => {
    const ctx = await browser.newContext();
    await seedSpanish(ctx);
    const page = await ctx.newPage();
    await signup(page, u);
    return page.request;
  };
  const oreq = await mk(owner);
  const mreq = await mk(member);

  // Owner: a folder with a subfolder and a bookmark.
  const proyecto = await (
    await oreq.post("/api/folders", { data: { name: "Proyecto" } })
  ).json();
  await oreq.post("/api/folders", {
    data: { name: "Docs", parentId: proyecto.id },
  });
  await oreq.post("/api/bookmarks", {
    data: {
      url: "https://example.org/",
      title: "Ref",
      folderId: proyecto.id,
      fetchSnapshot: false,
    },
  });

  // Owner: group + invite member; member accepts; owner shares the folder.
  const group = await (
    await oreq.post("/api/groups", { data: { name: "Equipo Clarke" } })
  ).json();
  const inv = await (
    await oreq.post(`/api/groups/${group.id}/invitations`, {
      data: { email: member.email, expiresInDays: 7 },
    })
  ).json();
  expect(
    (await mreq.post(`/api/invitations/${inv.token}/accept`)).ok(),
  ).toBeTruthy();
  await oreq.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: proyecto.id, access: "viewer" },
  });

  // Member finds the share (retry until the snapshot sealed).
  let shareId = "";
  await expect(async () => {
    const list = await (await mreq.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
  }).toPass({ timeout: 10_000 });

  const destino = await (
    await mreq.post("/api/folders", { data: { name: "Destino" } })
  ).json();

  // --- Mode: link -> a single portal folder into "Destino".
  let linked: { id: string; type: string } = { id: "", type: "" };
  await expect(async () => {
    const r = await mreq.post(`/api/shared/${shareId}/import`, {
      data: { parentId: destino.id, mode: "link" },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    linked = await r.json();
  }).toPass({ timeout: 30_000 });
  expect(linked.type).toBe("folder");

  let folders: FolderRow[] = await (await mreq.get("/api/folders")).json();
  const portal = folders.find((f) => f.id === linked.id)!;
  expect(portal.name).toBe("Proyecto");
  expect(portal.parentId).toBe(destino.id);
  expect(portal.shareOrigin).toBe("Equipo Clarke");
  expect(portal.linkedShareId).toBe(shareId);
  // Link does not *copy* anything: the subtree the member can now see is the
  // group's own rows, not duplicates of them. They show up because the group
  // owns them and this member holds the group key, which is the point of the
  // whole arrangement, and they are marked as not being theirs.
  const groupDocs = folders.find((f) => f.name === "Docs");
  expect(groupDocs).toBeTruthy();
  expect(groupDocs!.mine).toBe(false);
  expect(groupDocs!.shared).toBe(true);
  expect(folders.filter((f) => f.name === "Docs")).toHaveLength(1);
  // A viewer share stays read-only, and now that is enforced by the role
  // rather than by the member simply not having the rows.
  const addInto = await mreq.post("/api/bookmarks", {
    data: {
      url: "https://blocked.example/",
      title: "No",
      folderId: portal.id,
      fetchSnapshot: false,
    },
  });
  expect(addInto.ok()).toBe(false);

  // --- Mode: copy -> a fully-owned snapshot at root (no badge).
  const copied = await (
    await mreq.post(`/api/shared/${shareId}/import`, {
      data: { parentId: null, mode: "copy" },
    })
  ).json();
  expect(copied.type).toBe("folder");

  folders = await (await mreq.get("/api/folders")).json();
  const copy = folders.find((f) => f.id === copied.id)!;
  expect(copy.name).toBe("Proyecto");
  expect(copy.parentId).toBeNull();
  expect(copy.shareOrigin).toBeNull();
  expect(copy.linkedShareId).toBeNull();
  const docs = folders.find(
    (f) => f.name === "Docs" && f.parentId === copy.id,
  );
  expect(docs).toBeTruthy();
  expect(docs!.shareOrigin).toBeNull();
  const bmsAfterCopy = await (await mreq.get("/api/bookmarks")).json();
  expect(bmsAfterCopy.some((b: { title: string }) => b.title === "Ref")).toBe(
    true,
  );
});
