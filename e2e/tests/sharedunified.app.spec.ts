import { type Browser, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A shared folder opens on the folder page, not on a reduced copy of it.
 *
 * Sharing used to mean a materialised snapshot sealed for the group, so the
 * recipient needed a separate screen to read it. Key scopes ended that: the
 * recipient gets the **same row**, sealed with a key their group holds. The
 * second screen outlived the reason for it, and the cost showed as features
 * that existed on one page and not the other — tags, attachments, breadcrumbs,
 * the view modes.
 *
 * What this pins down is that the two are now one page, and that moving there
 * did not lose what the reduced one did say: whose it is and what you may do.
 */
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

test("abrir un compartido lleva a la carpeta de verdad, con todo lo suyo", async ({
  browser,
}) => {
  const owner = await newUser(browser, {
    email: "unif.owner.e2e@example.com",
    nickname: "unifowner",
    password: "UnifiedShare28xx",
  });
  const member = await newUser(browser, {
    email: "unif.member.e2e@example.com",
    nickname: "unifmember",
    password: "UnifiedMember28xx",
  });

  const group = await (
    await owner.req.post("/api/groups", { data: { name: "Unificados" } })
  ).json();
  const inv = await (
    await owner.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "unif.member.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  if (!inv.autoAccepted) {
    await member.req.post(`/api/invitations/${inv.token}/accept`);
  }

  const folder = await (
    await owner.req.post("/api/folders", { data: { name: "Compartida real" } })
  ).json();
  await owner.req.post("/api/folders", {
    data: { name: "Dentro", parentId: folder.id },
  });
  const shared = await owner.req.post("/api/shares/to-groups", {
    data: {
      sourceType: "folder",
      sourceId: folder.id,
      groupIds: [group.id],
    },
  });
  expect(shared.ok(), await shared.text()).toBeTruthy();

  // The listing says the row itself is reachable, which is what decides where
  // the link goes.
  await expect(async () => {
    const list = await (await member.req.get("/api/shared")).json();
    expect(list).toHaveLength(1);
    expect(list[0].sourceReachable).toBe(true);
    expect(list[0].sourceId).toBe(folder.id);
  }).toPass({ timeout: 20_000 });

  // Opening it from the list lands on the ordinary folder page. Scoped to the
  // main region: the folder is in the sidebar tree as well, which is itself
  // the point — it is an ordinary folder of theirs now.
  await member.page.goto("/shared");
  await member.page
    .getByRole("main")
    .getByRole("link", { name: /Compartida real/ })
    .click();
  await expect(member.page).toHaveURL(new RegExp(`/folder/${folder.id}$`));

  // The things the reduced page never had.
  await expect(
    member.page.getByRole("button", { name: "Añadir tag" }),
  ).toBeVisible();
  await expect(
    member.page.getByRole("heading", { name: "Adjuntos" }),
  ).toBeVisible();
  await expect(member.page.getByText("Dentro").first()).toBeVisible();

  // And the thing it did have: whose this is and what may be done with it.
  await expect(
    member.page
      .getByRole("main")
      .getByRole("link", { name: /Puede editar/ }),
  ).toBeVisible();

  // The old URL still works, it just hands over rather than rendering its own
  // copy — a link somebody bookmarked or was sent keeps working.
  const list = await (await member.req.get("/api/shared")).json();
  await member.page.goto(`/shared/${list[0].id}`);
  await expect(member.page).toHaveURL(new RegExp(`/folder/${folder.id}$`));

  await owner.ctx.close();
  await member.ctx.close();
});

test("el que comparte llega a su propia carpeta desde la lista", async ({
  browser,
}) => {
  const owner = await newUser(browser, {
    email: "unif.by.e2e@example.com",
    nickname: "unifby",
    password: "UnifiedByMe28xxx",
  });
  const group = await (
    await owner.req.post("/api/groups", { data: { name: "Propios" } })
  ).json();
  const folder = await (
    await owner.req.post("/api/folders", { data: { name: "Mía y compartida" } })
  ).json();
  await owner.req.post("/api/shares/to-groups", {
    data: { sourceType: "folder", sourceId: folder.id, groupIds: [group.id] },
  });

  // "Compartidos por mí" pointed at the same reduced page, which for the owner
  // was a copy of a folder they own outright. It goes to the folder.
  await owner.page.goto("/shared");
  await owner.page.getByRole("button", { name: "Por mí" }).click();
  await owner.page
    .getByRole("main")
    .getByRole("link", { name: /Mía y compartida/ })
    .click();
  await expect(owner.page).toHaveURL(new RegExp(`/folder/${folder.id}$`));
  // Their own folder: no "shared with you" chip, because it is not.
  await expect(owner.page.getByText("Solo lectura")).toHaveCount(0);

  await owner.ctx.close();
});

test("un viewer abre el compartido y no ve botones que darían 403", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "unif.ro.owner.e2e@example.com",
    nickname: "unifroowner",
    password: "UnifiedRoOwn28xx",
  });
  const v = await newUser(browser, {
    email: "unif.ro.viewer.e2e@example.com",
    nickname: "unifroviewer",
    password: "UnifiedRoView28xx",
  });

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Solo mirar" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "unif.ro.viewer.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  if (!inv.autoAccepted) {
    await v.req.post(`/api/invitations/${inv.token}/accept`);
  }
  const members = await (
    await o.req.get(`/api/groups/${group.id}/members`)
  ).json();
  const them = members.find(
    (x: { email: string }) => x.email === "unif.ro.viewer.e2e@example.com",
  );
  await o.req.patch(`/api/groups/${group.id}/members/${them.userId}/role`, {
    data: { role: "viewer" },
  });

  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Para mirar" } })
  ).json();
  await o.req.post("/api/shares/to-groups", {
    data: { sourceType: "folder", sourceId: folder.id, groupIds: [group.id] },
  });

  await expect(async () => {
    const list = await (await v.req.get("/api/shared")).json();
    expect(list).toHaveLength(1);
    expect(list[0].sourceReachable).toBe(true);
  }).toPass({ timeout: 20_000 });

  // The reduced page hid its create buttons for a viewer. The ordinary page
  // did not, because until now nobody but the owner opened it, and sending
  // viewers here without that check would have handed them buttons that come
  // back 403.
  await v.page.goto(`/folder/${folder.id}`);
  await expect(v.page.getByText("Solo lectura")).toBeVisible();
  await expect(
    v.page.getByRole("button", { name: "Nueva carpeta" }),
  ).toHaveCount(0);
  await expect(
    v.page.getByRole("button", { name: "Nuevo bookmark" }),
  ).toHaveCount(0);
  await expect(v.page.getByRole("button", { name: "Añadir tag" })).toHaveCount(
    0,
  );
  // Reading still works, which is the whole point of being a viewer.
  await expect(v.page.getByRole("heading", { name: "Para mirar" })).toBeVisible();

  // And the server agrees, so the buttons are hidden because writing is
  // refused, not instead of it.
  const denied = await v.req.post("/api/folders", {
    data: { name: "No debería", parentId: folder.id },
  });
  expect(denied.ok()).toBe(false);

  await o.ctx.close();
  await v.ctx.close();
});
