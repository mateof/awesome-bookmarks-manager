import { type Browser, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A shared folder should look like the folder its owner designed: same
 * background, same icon, same tags, same forced text tone. None of that used
 * to survive the share, because the payload carried only the name, the text
 * and a background colour, and because the icon bytes are sealed with the
 * owner's key (a member cannot read them, and the owner may be offline).
 *
 * The share therefore keeps its own copy of every icon/background, re-sealed
 * with the group key, served from /shared/:id/asset/:node/:kind.
 */
const owner = {
  email: "sharelook.owner.e2e@example.com",
  nickname: "sharelookowner",
  password: "OwnerDesignsIt26x",
};
const member = {
  email: "sharelook.member.e2e@example.com",
  nickname: "sharelookmember",
  password: "MemberSeesIt26xx",
};

// 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

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

test("la carpeta compartida conserva el diseño del dueño y sube de nivel", async ({
  browser,
}) => {
  const o = await newUser(browser, owner);
  const m = await newUser(browser, member);

  // Owner: a folder with the full treatment, plus a subfolder to drill into.
  const tag = await (
    await o.req.post("/api/tags", { data: { name: "diseño", color: "#c026d3" } })
  ).json();
  const root = await (
    await o.req.post("/api/folders", {
      data: { name: "Estudio", bgColor: "#0b1120", tagIds: [tag.id] },
    })
  ).json();
  await o.req.patch(`/api/folders/${root.id}`, { data: { textTone: "light" } });
  const iconUp = await o.req.post(`/api/folders/${root.id}/icon`, {
    multipart: { file: { name: "i.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(iconUp.ok(), await iconUp.text()).toBeTruthy();

  const sub = await (
    await o.req.post("/api/folders", {
      data: { name: "Bocetos", parentId: root.id, bgColor: "#7c3aed" },
    })
  ).json();
  const subIcon = await o.req.post(`/api/folders/${sub.id}/icon`, {
    multipart: { file: { name: "s.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(subIcon.ok()).toBeTruthy();
  await o.req.post("/api/bookmarks", {
    data: {
      url: "https://boceto.example/",
      title: "Boceto uno",
      folderId: sub.id,
      tagIds: [tag.id],
      fetchSnapshot: false,
    },
  });

  // Share it with the member.
  const group = await (
    await o.req.post("/api/groups", { data: { name: "Taller" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: member.email, expiresInDays: 7 },
    })
  ).json();
  await m.req.post(`/api/invitations/${inv.token}/accept`);
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: root.id, access: "viewer" },
  });

  // The payload carries the design, not just the text.
  let shareId = "";
  await expect(async () => {
    const list = await (await m.req.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
    const { content } = (await (
      await m.req.get(`/api/shared/${shareId}`)
    ).json()) as {
      content: {
        icon: string | null;
        textTone: string | null;
        tags: { name: string }[];
        subfolders: { icon: string | null; bgColor: string | null }[];
      };
    };
    expect(content.textTone).toBe("light");
    expect(content.tags.map((t) => t.name)).toContain("diseño");
    expect(content.icon).toBeTruthy();
    expect(content.subfolders[0]?.icon).toBeTruthy();
    expect(content.subfolders[0]?.bgColor).toBe("#7c3aed");
  }).toPass({ timeout: 15_000 });

  // The member can fetch the icon bytes, which live in the share's own copy
  // (the owner's endpoint would need the owner's key).
  const asset = await m.req.get(
    `/api/shared/${shareId}/asset/${root.id}/icon`,
  );
  expect(asset.ok(), await asset.text()).toBeTruthy();
  expect(asset.headers()["content-type"]).toContain("image/png");
  expect((await asset.body()).equals(PNG)).toBeTruthy();

  // A stranger to the group gets nothing.
  const outsider = await newUser(browser, {
    email: "sharelook.outsider.e2e@example.com",
    nickname: "sharelookout",
    password: "NotInThisGroup26x",
  });
  const denied = await outsider.req.get(
    `/api/shared/${shareId}/asset/${root.id}/icon`,
  );
  expect(denied.status()).toBe(404);
  await outsider.ctx.close();

  // In the UI: link the share into the member's home and browse it.
  let portalId = "";
  await expect(async () => {
    const r = await m.req.post(`/api/shared/${shareId}/import`, {
      data: { mode: "link" },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    portalId = (await r.json()).id;
  }).toPass({ timeout: 30_000 });

  await m.page.goto(`/linked/${portalId}`);
  await expect(m.page.getByRole("heading", { name: "Estudio" })).toBeVisible();
  // The subfolder card shows the owner's icon, not a generic folder. Same
  // card component as your own folders now, so the same markup.
  const subCard = m.page
    .locator("div.group.relative")
    .filter({ has: m.page.getByText("Bocetos", { exact: true }) })
    .first();
  await expect(subCard.locator("img")).toBeVisible();

  // At the root there is nothing to go up to.
  await expect(m.page.getByRole("button", { name: "Subir de nivel" })).toHaveCount(0);

  // The sidebar lists the share's folders too now, so aim at the card.
  await m.page
    .locator("div.group.relative")
    .filter({ hasText: "Bocetos" })
    .first()
    .click();
  await expect(m.page.getByText("Boceto uno", { exact: true })).toBeVisible();

  // The bookmark's title opens the link itself: the personal detail page
  // would 404 here, because the id belongs to the owner.
  const titleLink = m.page.getByRole("link", { name: "Boceto uno" }).first();
  await expect(titleLink).toHaveAttribute("href", "https://boceto.example/");
  await expect(titleLink).toHaveAttribute("target", "_blank");

  // Where you are lives in the URL, so a refresh keeps you in the subfolder
  // instead of dumping you back at the root of the share.
  expect(new URL(m.page.url()).searchParams.get("p")).toBe(sub.id);
  await m.page.reload();
  await expect(m.page.getByText("Boceto uno", { exact: true })).toBeVisible();
  await expect(m.page.getByRole("heading", { name: "Bocetos" })).toBeVisible();

  // Up one level: back to the share's root.
  await m.page.getByRole("button", { name: "Subir de nivel" }).click();
  await expect(m.page.getByRole("heading", { name: "Estudio" })).toBeVisible();
  await expect(m.page.getByText("Boceto uno", { exact: true })).toHaveCount(0);

  // Copy-importing carries the design into the member's own tree: the icon is
  // re-sealed with their key, and the tag is matched/created by name.
  const copied = await (
    await m.req.post(`/api/shared/${shareId}/import`, { data: { mode: "copy" } })
  ).json();
  const folders: Array<{
    id: string;
    name: string;
    iconBlobPath: string | null;
    textTone: string | null;
    tagIds?: string[];
  }> = await (await m.req.get("/api/folders")).json();
  const copyRoot = folders.find((f) => f.id === copied.id)!;
  expect(copyRoot.iconBlobPath).toBeTruthy();
  expect(copyRoot.textTone).toBe("light");
  const myTags: Array<{ id: string; name: string }> = await (
    await m.req.get("/api/tags")
  ).json();
  const mine = myTags.find((t) => t.name === "diseño");
  expect(mine).toBeTruthy();
  expect(copyRoot.tagIds ?? []).toContain(mine!.id);
  // And the copy's icon is served by the member's own endpoint.
  const own = await m.req.get(`/api/folders/${copied.id}/icon`);
  expect(own.ok()).toBeTruthy();
  expect((await own.body()).equals(PNG)).toBeTruthy();

  await o.ctx.close();
  await m.ctx.close();
});
