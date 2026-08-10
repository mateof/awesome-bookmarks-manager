import { type APIRequestContext, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Import a shared folder into my own home: it becomes owned folders/bookmarks
 * (the top one marked as shared), so I can manage them like my own.
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

test("importar carpeta compartida a mi inicio con marca de compartida", async ({
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
  expect((await mreq.post(`/api/invitations/${inv.token}/accept`)).ok()).toBeTruthy();
  await oreq.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: proyecto.id, access: "viewer" },
  });

  // Member finds the share, then imports it (retry until the snapshot sealed).
  let shareId = "";
  await expect(async () => {
    const list = await (await mreq.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
  }).toPass({ timeout: 10_000 });

  let imported: { id: string; type: string } = { id: "", type: "" };
  await expect(async () => {
    const r = await mreq.post(`/api/shared/${shareId}/import`);
    expect(r.ok(), await r.text()).toBeTruthy();
    imported = await r.json();
  }).toPass({ timeout: 30_000 });
  expect(imported.type).toBe("folder");

  // The member now owns the subtree: top folder marked shared, rest plain.
  const folders = await (await mreq.get("/api/folders")).json();
  const proy = folders.find((f: { name: string }) => f.name === "Proyecto");
  const docs = folders.find((f: { name: string }) => f.name === "Docs");
  expect(proy?.id).toBe(imported.id);
  expect(proy.shareOrigin).toBe("Equipo Clarke");
  expect(docs).toBeTruthy();
  expect(docs.shareOrigin).toBeNull();

  const bms = await (await mreq.get("/api/bookmarks")).json();
  expect(bms.some((b: { title: string }) => b.title === "Ref")).toBeTruthy();
});
