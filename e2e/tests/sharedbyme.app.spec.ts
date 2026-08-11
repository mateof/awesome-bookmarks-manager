import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Regression: opening a share from "shared by me" returned "could not load"
 * because the content route authorized against the "shared with me" list,
 * which deliberately excludes your own shares. Any group member (including the
 * one who shared it) may read the content.
 */
const owner = {
  email: "maria.goeppert@example.com",
  nickname: "mariag",
  password: "NuclearShell1963x",
};

test("el creador puede abrir el contenido de un share propio (por mí)", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, owner);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "Proyecto" } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://ref.example/",
      title: "Ref",
      folderId: folder.id,
      fetchSnapshot: false,
    },
  });
  const group = await (
    await req.post("/api/groups", { data: { name: "Equipo" } })
  ).json();
  await req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id, access: "viewer" },
  });

  // The share shows under "shared by me" once sealed.
  let shareId = "";
  await expect(async () => {
    const byMe = await (await req.get("/api/shared/by-me")).json();
    expect(byMe.length).toBe(1);
    expect(byMe[0].payloadStatus).toBe("ready");
    shareId = byMe[0].id;
  }).toPass({ timeout: 10_000 });

  // Opening its content must succeed (not "not_found").
  const res = await (await req.get(`/api/shared/${shareId}`)).json();
  expect(res.error).toBeUndefined();
  expect(res.content?.type).toBe("folder");
  expect(res.content?.name).toBe("Proyecto");
  expect(
    (res.content?.bookmarks as { title: string }[]).some(
      (b) => b.title === "Ref",
    ),
  ).toBe(true);
});
