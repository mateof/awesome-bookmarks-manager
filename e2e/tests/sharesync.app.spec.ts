import { type APIRequestContext, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A read-only ("viewer") group share must stay in sync with the owner's live
 * content: adding a bookmark or subfolder inside the shared folder, renaming
 * it, or deleting content re-materializes the snapshot so members see it.
 */
const owner = {
  email: "radia.perlman@example.com",
  nickname: "radiap",
  password: "SpanningTree1985x",
};
const member = {
  email: "barbara.liskov@example.com",
  nickname: "barbaral",
  password: "SubstitutionPrin1987",
};

interface FolderNode {
  type: "folder";
  name: string;
  bookmarks: { title: string }[];
  subfolders: FolderNode[];
}

test("cambios del propietario en una carpeta compartida llegan a los miembros", async ({
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

  // Owner: a folder with one bookmark.
  const proyecto = await (
    await oreq.post("/api/folders", { data: { name: "Proyecto" } })
  ).json();
  await oreq.post("/api/bookmarks", {
    data: {
      url: "https://example.org/",
      title: "Ref",
      folderId: proyecto.id,
      fetchSnapshot: false,
    },
  });

  // Owner: group + invite member; member accepts; owner shares (viewer).
  const group = await (
    await oreq.post("/api/groups", { data: { name: "Radio Team" } })
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

  // Member sees the share sealed with the initial bookmark.
  let shareId = "";
  await expect(async () => {
    const list = await (await mreq.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
    const { content } = await (
      await mreq.get(`/api/shared/${shareId}`)
    ).json();
    const titles = (content as FolderNode).bookmarks.map((b) => b.title);
    expect(titles).toContain("Ref");
  }).toPass({ timeout: 10_000 });

  // Owner ADDS a bookmark and a subfolder to the shared folder.
  await oreq.post("/api/bookmarks", {
    data: {
      url: "https://example.net/",
      title: "Nuevo",
      folderId: proyecto.id,
      fetchSnapshot: false,
    },
  });
  await oreq.post("/api/folders", {
    data: { name: "SubNueva", parentId: proyecto.id },
  });

  // Member sees both once the snapshot is re-sealed.
  await expect(async () => {
    const { content } = await (
      await mreq.get(`/api/shared/${shareId}`)
    ).json();
    const node = content as FolderNode;
    expect(node.bookmarks.map((b) => b.title)).toContain("Nuevo");
    expect(node.subfolders.map((f) => f.name)).toContain("SubNueva");
  }).toPass({ timeout: 15_000 });

  // Owner renames the folder -> members see the new name.
  await oreq.patch(`/api/folders/${proyecto.id}`, {
    data: { name: "Proyecto Alfa" },
  });
  await expect(async () => {
    const { content } = await (
      await mreq.get(`/api/shared/${shareId}`)
    ).json();
    expect((content as FolderNode).name).toBe("Proyecto Alfa");
  }).toPass({ timeout: 15_000 });
});
