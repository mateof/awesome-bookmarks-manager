import { type APIRequestContext, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The background colour of shared folders/bookmarks now travels in the share
 * payload, so the linked view shows it and importing keeps it.
 */
const owner = {
  email: "irene.joliot@example.com",
  nickname: "irenej",
  password: "ArtificialRadio1935",
};
const member = {
  email: "marie.tharp@example.com",
  nickname: "mariet",
  password: "OceanFloorMap1957x",
};

test("el color de fondo se comparte y se conserva al importar", async ({
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

  const folder = await (
    await oreq.post("/api/folders", {
      data: { name: "Proyecto", bgColor: "#112233" },
    })
  ).json();
  const bm = await (
    await oreq.post("/api/bookmarks", {
      data: {
        url: "https://ref.example/",
        title: "Ref",
        folderId: folder.id,
        fetchSnapshot: false,
      },
    })
  ).json();
  await oreq.patch(`/api/bookmarks/${bm.id}`, { data: { bgColor: "#445566" } });

  const group = await (
    await oreq.post("/api/groups", { data: { name: "Equipo" } })
  ).json();
  const inv = await (
    await oreq.post(`/api/groups/${group.id}/invitations`, {
      data: { email: member.email, expiresInDays: 7 },
    })
  ).json();
  await mreq.post(`/api/invitations/${inv.token}/accept`);
  await oreq.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id, access: "viewer" },
  });

  // Member sees the colours in the share payload.
  let shareId = "";
  await expect(async () => {
    const list = await (await mreq.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
    const { content } = await (
      await mreq.get(`/api/shared/${shareId}`)
    ).json();
    expect(content.bgColor).toBe("#112233");
    const ref = (content.bookmarks as { title: string; bgColor: string }[]).find(
      (b) => b.title === "Ref",
    );
    expect(ref?.bgColor).toBe("#445566");
  }).toPass({ timeout: 10_000 });

  // Copy-importing keeps the colours.
  const copied = await (
    await mreq.post(`/api/shared/${shareId}/import`, {
      data: { mode: "copy" },
    })
  ).json();
  const folders: Array<{ id: string; name: string; bgColor: string | null }> =
    await (await mreq.get("/api/folders")).json();
  const copyRoot = folders.find((f) => f.id === copied.id)!;
  expect(copyRoot.bgColor).toBe("#112233");
  const bms: Array<{ title: string; bgColor: string | null }> = await (
    await mreq.get("/api/bookmarks")
  ).json();
  expect(bms.find((b) => b.title === "Ref")?.bgColor).toBe("#445566");
});
