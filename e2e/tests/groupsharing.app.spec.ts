import { type Browser, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Permissions live on the group, and sharing goes to several at once.
 *
 * The inconsistency being removed: a share carried its own access level
 * ("viewer" / "editor") *and* every member had a role in the group. Two
 * answers to the same question, and they could disagree, so an editor of the
 * group could be looking at a share marked read-only. The role wins, and the
 * question is no longer asked.
 *
 * The trade, stated so it is a decision rather than an accident: a group is now
 * the unit of access. Two different levels for the same people means two
 * groups.
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

async function join(
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
    await m.req.post(`/api/invitations/${inv.token}/accept`);
  }
}

test("el permiso de un miembro se cambia y decide lo que puede hacer", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "gs.owner.e2e@example.com",
    nickname: "gsowner",
    password: "GroupShareOwner28x",
  });
  const m = await newUser(browser, {
    email: "gs.member.e2e@example.com",
    nickname: "gsmember",
    password: "GroupShareMemb28xx",
  });

  const group = await (
    await o.req.post("/api/groups", { data: { name: "Equipo" } })
  ).json();
  await join(o, group.id, m, "gs.member.e2e@example.com");

  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Carpeta" } })
  ).json();
  // No access level in the body any more: the role decides.
  const shared = await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id },
  });
  expect(shared.ok(), await shared.text()).toBeTruthy();

  const members = await (
    await o.req.get(`/api/groups/${group.id}/members`)
  ).json();
  const them = members.find(
    (x: { email: string }) => x.email === "gs.member.e2e@example.com",
  );
  // Joining makes you an editor, which is what "member" always meant.
  expect(them.role).toBe("editor");

  // As an editor they can write.
  await expect(async () => {
    const r = await m.req.patch(`/api/folders/${folder.id}`, {
      data: { name: "Renombrada por el miembro" },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }).toPass({ timeout: 20_000 });

  // Demote to viewer: same content, no writing.
  const demote = await o.req.patch(
    `/api/groups/${group.id}/members/${them.userId}/role`,
    { data: { role: "viewer" } },
  );
  expect(demote.ok(), await demote.text()).toBeTruthy();

  const blocked = await m.req.patch(`/api/folders/${folder.id}`, {
    data: { name: "No" },
  });
  expect(blocked.ok()).toBe(false);
  // Still readable: demoting changes what the server allows, not what the key
  // opens, so no re-encryption happened.
  const stillThere = await (await m.req.get("/api/folders")).json();
  expect(
    stillThere.find((f: { id: string }) => f.id === folder.id).name,
  ).toBe("Renombrada por el miembro");

  // The ladder holds: nobody may grant a level at or above their own.
  const overreach = await m.req.patch(
    `/api/groups/${group.id}/members/${them.userId}/role`,
    { data: { role: "admin" } },
  );
  expect(overreach.ok()).toBe(false);

  // And it is changeable from the interface, not only by API.
  await o.page.goto(`/groups/${group.id}`);
  const select = o.page.getByLabel(/Permiso de gs.member/);
  await expect(select).toBeVisible();
  await select.selectOption("admin");
  await expect(async () => {
    const after = await (
      await o.req.get(`/api/groups/${group.id}/members`)
    ).json();
    expect(
      after.find((x: { email: string }) => x.email === "gs.member.e2e@example.com")
        .role,
    ).toBe("admin");
  }).toPass({ timeout: 10_000 });

  await o.ctx.close();
  await m.ctx.close();
});

test("compartir una tabla con varios grupos a la vez", async ({ browser }) => {
  const o = await newUser(browser, {
    email: "gs.multi.e2e@example.com",
    nickname: "gsmulti",
    password: "ShareToMany28xxx",
  });
  const a = await newUser(browser, {
    email: "gs.a.e2e@example.com",
    nickname: "gsa",
    password: "MemberOfOne28xxx",
  });
  const b = await newUser(browser, {
    email: "gs.b.e2e@example.com",
    nickname: "gsb",
    password: "MemberOfTwo28xxx",
  });

  const g1 = await (
    await o.req.post("/api/groups", { data: { name: "Uno" } })
  ).json();
  const g2 = await (
    await o.req.post("/api/groups", { data: { name: "Dos" } })
  ).json();
  await join(o, g1.id, a, "gs.a.e2e@example.com");
  await join(o, g2.id, b, "gs.b.e2e@example.com");

  const db = await (
    await o.req.post("/api/databases", { data: { name: "Precios" } })
  ).json();
  await o.req.patch(`/api/databases/${db.id}/rows/${db.rows[0].id}`, {
    data: { cells: { [db.columns[0].id]: "Tarifa" } },
  });

  // One call, both groups.
  const res = await o.req.post("/api/shares/to-groups", {
    data: {
      sourceType: "database",
      sourceId: db.id,
      groupIds: [g1.id, g2.id],
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const outcome = await res.json();
  expect(outcome).toHaveLength(2);
  expect(outcome.every((r: { error?: string }) => !r.error)).toBe(true);

  // Both members reach it, and can work with it at their group level.
  for (const who of [a, b]) {
    await expect(async () => {
      const list = await (await who.req.get("/api/databases")).json();
      expect(list.map((d: { name: string }) => d.name)).toContain("Precios");
    }).toPass({ timeout: 20_000 });
  }
  const asA = await (await a.req.get(`/api/databases/${db.id}`)).json();
  expect(asA.canWrite).toBe(true);
  expect(
    asA.rows.some(
      (r: { cells: Record<string, unknown> }) =>
        r.cells[asA.columns[0].id] === "Tarifa",
    ),
  ).toBe(true);

  // One scope, both groups. The content was sealed once and the second group
  // was handed the key: no copy, no re-encryption.
  const owner = await (await o.req.get("/api/databases")).json();
  const row = owner.find((d: { id: string }) => d.id === db.id);
  expect(row.shared).toBe(true);
  expect(row.keyScopeId).toBeTruthy();

  // A group the sharer does not belong to is refused, and says which one,
  // rather than failing the whole call.
  const stranger = await newUser(browser, {
    email: "gs.stranger.e2e@example.com",
    nickname: "gsstranger",
    password: "NotYourGroup28xx",
  });
  const other = await (
    await stranger.req.post("/api/groups", { data: { name: "Ajeno" } })
  ).json();
  const mixed = await (
    await o.req.post("/api/shares/to-groups", {
      data: {
        sourceType: "database",
        sourceId: db.id,
        groupIds: [g1.id, other.id],
      },
    })
  ).json();
  expect(mixed.find((r: { groupId: string }) => r.groupId === other.id).error)
    .toBeTruthy();
  expect(
    mixed.find((r: { groupId: string }) => r.groupId === g1.id).error,
  ).toBeFalsy();
  await stranger.ctx.close();

  await o.ctx.close();
  await a.ctx.close();
  await b.ctx.close();
});

test("el diálogo de compartir ya no pregunta permisos y admite varios grupos", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "gs.ui.e2e@example.com",
    nickname: "gsui",
    password: "ShareDialogUI28xx",
  });

  await o.req.post("/api/groups", { data: { name: "Grupo A" } });
  await o.req.post("/api/groups", { data: { name: "Grupo B" } });
  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Para compartir" } })
  ).json();

  await o.page.goto(`/folder/${folder.id}`);
  await o.page.getByRole("button", { name: "Más acciones" }).first().click();
  await o.page.getByRole("button", { name: "Compartir con grupo" }).click();

  // The access buttons are gone: the level belongs to the group.
  await expect(o.page.getByRole("button", { name: "Solo lectura" })).toHaveCount(0);
  await expect(o.page.getByRole("button", { name: "Puede editar" })).toHaveCount(0);
  await expect(o.page.getByText(/permiso que ya tenga en el grupo/)).toBeVisible();

  // Two groups at once, which the radio buttons could not do.
  await o.page.getByRole("checkbox").first().check();
  await o.page.getByRole("checkbox").last().check();
  await o.page.getByRole("button", { name: "Compartir con 2 grupos" }).click();

  await expect(async () => {
    const shares = await (await o.req.get("/api/shared/by-me")).json();
    expect(shares).toHaveLength(2);
  }).toPass({ timeout: 20_000 });

  await o.ctx.close();
});
