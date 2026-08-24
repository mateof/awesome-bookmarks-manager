import { type Browser, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Sharing a table is not a one-way door.
 *
 * The icon used to be replaced by a coloured, non-interactive `<span>` the
 * moment something was shared, which removed the only way to reach the two
 * things you can only want *after* sharing once: adding a second group, and
 * stopping. It was written when a table could go to one group and "already
 * shared" was a terminal state; key scopes made several groups the point.
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

test("una tabla compartida se puede compartir con más grupos y dejar de compartir", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "manage.owner.e2e@example.com",
    nickname: "manageowner",
    password: "ManageOwner28xxx",
  });
  const m = await newUser(browser, {
    email: "manage.member.e2e@example.com",
    nickname: "managemember",
    password: "ManageMember28xx",
  });

  const uno = await (
    await o.req.post("/api/groups", { data: { name: "Grupo Uno" } })
  ).json();
  const dos = await (
    await o.req.post("/api/groups", { data: { name: "Grupo Dos" } })
  ).json();
  for (const g of [uno, dos]) {
    const inv = await (
      await o.req.post(`/api/groups/${g.id}/invitations`, {
        data: { email: "manage.member.e2e@example.com", expiresInDays: 7 },
      })
    ).json();
    if (!inv.autoAccepted) {
      await m.req.post(`/api/invitations/${inv.token}/accept`);
    }
  }

  const db = await (
    await o.req.post("/api/databases", { data: { name: "Tarifas" } })
  ).json();
  await o.req.post("/api/shares/to-groups", {
    data: { sourceType: "database", sourceId: db.id, groupIds: [uno.id] },
  });

  await o.page.goto("/databases");
  await expect(o.page.getByText("Tarifas").first()).toBeVisible({
    timeout: 20_000,
  });

  // The icon is still a button once shared. It used to become a span.
  const manage = o.page.getByRole("button", {
    name: /Compartida: gestionar grupos/,
  });
  await expect(manage).toBeVisible();
  await manage.click();

  // The dialog says who has it, and offers the groups that do not.
  await expect(o.page.getByText("Compartida ahora con")).toBeVisible();
  await expect(o.page.getByText("Grupo Uno")).toBeVisible();
  await o.page.getByRole("checkbox").first().check();
  await o.page.getByRole("button", { name: /Compartir con 1 grupo/ }).click();

  await expect(async () => {
    const list = await (await o.req.get("/api/shared/by-me")).json();
    expect(list.filter((s: { sourceId: string }) => s.sourceId === db.id))
      .toHaveLength(2);
  }).toPass({ timeout: 20_000 });

  // Both groups reach it.
  await expect(async () => {
    const seen = await (await m.req.get("/api/databases")).json();
    expect(seen.map((d: { name: string }) => d.name)).toContain("Tarifas");
  }).toPass({ timeout: 20_000 });

  // Now stop sharing with one of them, from the same dialog.
  await manage.click();
  await expect(o.page.getByText("Compartida ahora con")).toBeVisible();
  await o.page.getByRole("button", { name: "Dejar de compartir" }).first().click();
  await expect(async () => {
    const list = await (await o.req.get("/api/shared/by-me")).json();
    expect(list.filter((s: { sourceId: string }) => s.sourceId === db.id))
      .toHaveLength(1);
  }).toPass({ timeout: 20_000 });

  await o.ctx.close();
  await m.ctx.close();
});

test("dejar de compartir corta el acceso de verdad", async ({ browser }) => {
  const o = await newUser(browser, {
    email: "revoke.owner.e2e@example.com",
    nickname: "revokeowner",
    password: "RevokeOwner28xxx",
  });
  const m = await newUser(browser, {
    email: "revoke.member.e2e@example.com",
    nickname: "revokemember",
    password: "RevokeMember28xx",
  });

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Cortar" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "revoke.member.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  if (!inv.autoAccepted) {
    await m.req.post(`/api/invitations/${inv.token}/accept`);
  }

  const db = await (
    await o.req.post("/api/databases", { data: { name: "Secreta" } })
  ).json();
  await o.req.post("/api/shares/to-groups", {
    data: { sourceType: "database", sourceId: db.id, groupIds: [group.id] },
  });
  await expect(async () => {
    const seen = await (await m.req.get("/api/databases")).json();
    expect(seen.map((d: { name: string }) => d.name)).toContain("Secreta");
  }).toPass({ timeout: 20_000 });

  const shares = await (await o.req.get("/api/shared/by-me")).json();
  const share = shares.find((s: { sourceId: string }) => s.sourceId === db.id);
  const del = await o.req.delete(
    `/api/groups/${share.groupId}/shares/${share.id}`,
  );
  expect(del.ok(), await del.text()).toBeTruthy();

  // The part that was missing: what makes content visible is the key scope
  // grant, and deleting the share row never touched it. The table stayed
  // readable by the group while the interface said it was no longer shared.
  await expect(async () => {
    const seen = await (await m.req.get("/api/databases")).json();
    expect(seen.map((d: { name: string }) => d.name)).not.toContain("Secreta");
  }).toPass({ timeout: 20_000 });
  const direct = await m.req.get(`/api/databases/${db.id}`);
  expect(direct.ok()).toBe(false);

  await o.ctx.close();
  await m.ctx.close();
});
