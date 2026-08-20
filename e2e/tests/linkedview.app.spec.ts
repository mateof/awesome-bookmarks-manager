import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The linked-share ("symlink") portal opens as a native card view in the
 * member's home: browse subfolders, and (for editor shares) edit a node in
 * place. Live: reads the current share content.
 */
const owner = {
  email: "annie.easley@example.com",
  nickname: "anniee",
  password: "RocketScientist1955",
};
const member = {
  email: "kathleen.antonelli@example.com",
  nickname: "kathleena",
  password: "EniacProgrammer1945",
};

test("vista enlazada nativa: navegar subcarpetas y editar (editor)", async ({
  browser,
}) => {
  const octx = await browser.newContext();
  await seedSpanish(octx);
  const opage = await octx.newPage();
  await signup(opage, owner);
  const oreq = opage.request;

  const mctx = await browser.newContext();
  await seedSpanish(mctx);
  const mpage = await mctx.newPage();
  await signup(mpage, member);
  const mreq = mpage.request;

  // Owner: Portafolio > (bookmark Guía, subfolder Sub > bookmark Interno).
  const port = await (
    await oreq.post("/api/folders", { data: { name: "Portafolio" } })
  ).json();
  await oreq.post("/api/bookmarks", {
    data: {
      url: "https://guia.example/",
      title: "Guía",
      folderId: port.id,
      fetchSnapshot: false,
    },
  });
  const sub = await (
    await oreq.post("/api/folders", { data: { name: "Sub", parentId: port.id } })
  ).json();
  await oreq.post("/api/bookmarks", {
    data: {
      url: "https://interno.example/",
      title: "Interno",
      folderId: sub.id,
      fetchSnapshot: false,
    },
  });

  // Group + invite + accept + share as editor.
  const group = await (
    await oreq.post("/api/groups", { data: { name: "Estudio" } })
  ).json();
  const inv = await (
    await oreq.post(`/api/groups/${group.id}/invitations`, {
      data: { email: member.email, expiresInDays: 7 },
    })
  ).json();
  await mreq.post(`/api/invitations/${inv.token}/accept`);
  await oreq.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: port.id, access: "editor" },
  });

  // Member link-imports (retry until the snapshot is sealed).
  let shareId = "";
  await expect(async () => {
    const list = await (await mreq.get("/api/shared")).json();
    expect(list.length).toBe(1);
    shareId = list[0].id;
  }).toPass({ timeout: 10_000 });
  let portalId = "";
  await expect(async () => {
    const r = await mreq.post(`/api/shared/${shareId}/import`, {
      data: { mode: "link" },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    portalId = (await r.json()).id;
  }).toPass({ timeout: 30_000 });

  // Native linked view: heading + bookmark card + subfolder card.
  await mpage.goto(`/linked/${portalId}`);
  await expect(
    mpage.getByRole("heading", { name: "Portafolio" }),
  ).toBeVisible();
  await expect(mpage.getByText("Guía", { exact: true })).toBeVisible();

  // Drill into the subfolder and back via breadcrumb.
  await mpage.getByText("Sub", { exact: true }).click();
  await expect(mpage.getByText("Interno", { exact: true })).toBeVisible();
  await mpage.getByRole("button", { name: "Portafolio" }).click();
  await expect(mpage.getByText("Guía", { exact: true })).toBeVisible();

  // Edit the "Guía" bookmark in place (editor share). The shared folder now
  // renders with the same grid as your own, so the editor lives in the card's
  // kebab exactly like everywhere else.
  const guiaCard = mpage
    .locator("div.group.relative")
    .filter({ has: mpage.getByText("Guía", { exact: true }) })
    .first();
  await guiaCard.getByRole("button", { name: "Más acciones" }).click();
  await mpage.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(
    mpage.getByRole("heading", { name: "Editar elemento compartido" }),
  ).toBeVisible();
  await mpage.getByPlaceholder("Título").fill("Guía v2");
  await mpage.getByRole("button", { name: "Guardar" }).click();
  await expect(mpage.getByText("Guía v2", { exact: true })).toBeVisible();

  // The edit reached the shared payload.
  const { content } = await (await mreq.get(`/api/shared/${shareId}`)).json();
  const titles = (content.bookmarks as { title: string }[]).map((b) => b.title);
  expect(titles).toContain("Guía v2");
});
