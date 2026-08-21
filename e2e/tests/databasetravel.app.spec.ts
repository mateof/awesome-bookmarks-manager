import { type Browser, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A database has to survive leaving the place it was made.
 *
 * Three destinations, three different reasons:
 *
 * - The `.abz` archive carries the table **whole**, not by reference. An
 *   archive holding only the id would import notes pointing at tables that do
 *   not exist on the other side, which is the quiet loss this format exists to
 *   prevent. The ids are rewritten as the notes are recreated.
 * - A published panel and a group share are materialised copies read without
 *   the owner's session, so the live component cannot fetch anything. The
 *   block is flattened into a static table at build time.
 * - The databases page is what stops a table becoming unreachable when the
 *   note that embedded it is deleted.
 */
const owner = {
  email: "db.travel.e2e@example.com",
  nickname: "dbtravel",
  password: "TravellingTable26x",
};

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

test("una base de datos viaja en el archivo, el panel y el compartido", async ({
  browser,
}) => {
  const o = await newUser(browser, owner);

  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Cartera" } })
  ).json();

  const db = await (
    await o.req.post("/api/databases", { data: { name: "Clientes" } })
  ).json();
  const titleCol = db.columns[0];
  const statusCol = db.columns[1];
  await o.req.patch(`/api/databases/${db.id}/rows/${db.rows[0].id}`, {
    data: {
      cells: {
        [titleCol.id]: "Acme SL",
        [statusCol.id]: statusCol.config.options[2].id,
      },
    },
  });

  await o.req.patch(`/api/folders/${folder.id}`, {
    data: {
      description: `<p>Seguimiento</p><div data-db-id="${db.id}" data-db-name="Clientes"></div>`,
    },
  });

  // --- The archive carries it whole ----------------------------------------
  const exported = await o.req.post("/api/export/archive", {
    data: { scope: "folder", id: folder.id },
  });
  expect(exported.ok(), await exported.text()).toBeTruthy();

  const imported = await o.req.post("/api/import/archive", {
    multipart: {
      file: {
        name: "copia.abz",
        mimeType: "application/zip",
        buffer: await exported.body(),
      },
    },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();

  const all = await (await o.req.get("/api/databases")).json();
  expect(all.filter((d: { name: string }) => d.name === "Clientes")).toHaveLength(
    2,
  );

  const folders = await (await o.req.get("/api/folders")).json();
  const copy = folders.find(
    (f: { name: string; id: string }) =>
      f.name === "Cartera" && f.id !== folder.id,
  );
  // The copy's note points at the *copy* of the table, not at the original.
  const copyDbId = /data-db-id="([0-9a-f-]{36})"/.exec(copy.description)?.[1];
  expect(copyDbId).toBeTruthy();
  expect(copyDbId).not.toBe(db.id);

  // And that copy holds the same content, with its own column ids: keeping the
  // old ones would give rows whose keys match nothing, rendering as blanks.
  const copied = await (await o.req.get(`/api/databases/${copyDbId}`)).json();
  const copiedTitle = copied.columns.find((c: { kind: string }) => c.kind === "text");
  expect(copiedTitle.id).not.toBe(titleCol.id);
  expect(
    copied.rows.some(
      (r: { cells: Record<string, unknown> }) =>
        r.cells[copiedTitle.id] === "Acme SL",
    ),
  ).toBe(true);
  expect(copied.views).toHaveLength(1);

  // --- A published panel gets a static table -------------------------------
  const panel = await (
    await o.req.post("/api/panels", {
      data: {
        title: "Cartera",
        slug: "cartera-db-e2e",
        folderId: folder.id,
        accessMode: "public",
      },
    })
  ).json();

  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await expect(async () => {
    const res = await anonPage.request.get(`/api/public/panel/${panel.slug}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    // Flattened: the reader has no session, so a live block would be an empty
    // box. They get the rows that were there when the copy was built.
    expect(body).toContain("Acme SL");
    expect(body).not.toContain("data-db-id");
  }).toPass({ timeout: 30_000 });
  await anon.close();

  // --- A group share gets the same treatment -------------------------------
  const m = await newUser(browser, {
    email: "db.travel.member.e2e@example.com",
    nickname: "dbtravelmember",
    password: "SharedTable26xxx",
  });
  const group = await (
    await o.req.post("/api/groups", { data: { name: "Equipo" } })
  ).json();
  const inv = await (
    await o.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "db.travel.member.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  await m.req.post(`/api/invitations/${inv.token}/accept`);
  await o.req.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id, access: "viewer" },
  });

  await expect(async () => {
    const list = await (await m.req.get("/api/shared")).json();
    expect(list.length).toBe(1);
    const detail = await (await m.req.get(`/api/shared/${list[0].id}`)).text();
    expect(detail).toContain("Acme SL");
    expect(detail).not.toContain("data-db-id");
  }).toPass({ timeout: 30_000 });
  await m.ctx.close();

  // --- Deleting the note leaves the table reachable ------------------------
  await o.req.patch(`/api/folders/${folder.id}`, {
    data: { description: "<p>sin tabla</p>" },
  });
  await o.page.goto("/databases");
  await expect(o.page.getByText("Clientes").first()).toBeVisible();

  // And it can be deleted from there, which is the only way to reclaim the
  // space once no note points at it.
  const before = await (await o.req.get("/api/databases")).json();
  expect((await o.req.delete(`/api/databases/${db.id}`)).status()).toBe(204);
  const after = await (await o.req.get("/api/databases")).json();
  expect(after.length).toBe(before.length - 1);

  await o.ctx.close();
});
