import { type Browser, expect, test } from "@playwright/test";
import { createFolder, seedSpanish, signup } from "../fixtures/app.js";

/**
 * Tagging a whole selection, and the colour a new tag gets.
 *
 * The bulk operation **adds**. Items in a selection rarely share the same tags,
 * so "set these tags" would quietly strip whatever each one had, and the tags
 * somebody loses that way are exactly the ones they had bothered to put on by
 * hand.
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

test("añadir tags a una selección sin borrar los que ya tenían", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "bulk.tags.e2e@example.com",
    nickname: "bulktags",
    password: "BulkTags28xxxxxx",
  });

  const previo = await (
    await o.req.post("/api/tags", { data: { name: "previo", color: "#64748b" } })
  ).json();
  const nuevo = await (
    await o.req.post("/api/tags", { data: { name: "nuevo", color: "#4b8af3" } })
  ).json();
  const otro = await (
    await o.req.post("/api/tags", { data: { name: "otro", color: "#00a86e" } })
  ).json();

  const folder = await (
    await o.req.post("/api/folders", { data: { name: "Contenedora" } })
  ).json();
  // One of them already carries a tag: it must survive.
  const conTag = await (
    await o.req.post("/api/bookmarks", {
      data: {
        folderId: folder.id,
        url: "https://uno.invalid/",
        title: "Con tag",
        tagIds: [previo.id],
        fetchSnapshot: false,
      },
    })
  ).json();
  const sinTag = await (
    await o.req.post("/api/bookmarks", {
      data: {
        folderId: folder.id,
        url: "https://dos.invalid/",
        title: "Sin tag",
        fetchSnapshot: false,
      },
    })
  ).json();
  const sub = await (
    await o.req.post("/api/folders", {
      data: { name: "Subcarpeta", parentId: folder.id },
    })
  ).json();

  const res = await o.req.post("/api/tags/apply", {
    data: {
      folderIds: [sub.id],
      bookmarkIds: [conTag.id, sinTag.id],
      tagIds: [nuevo.id, otro.id],
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  expect(await res.json()).toEqual({ folders: 1, bookmarks: 2, skipped: 0 });

  const marcadores = await (await o.req.get("/api/bookmarks")).json();
  const a = marcadores.find((b: { id: string }) => b.id === conTag.id);
  const b = marcadores.find((x: { id: string }) => x.id === sinTag.id);
  // The one that already had a tag keeps it and gains the two new ones.
  expect([...a.tagIds].sort()).toEqual([previo.id, nuevo.id, otro.id].sort());
  expect([...b.tagIds].sort()).toEqual([nuevo.id, otro.id].sort());

  const carpetas = await (await o.req.get("/api/folders")).json();
  const s = carpetas.find((f: { id: string }) => f.id === sub.id);
  expect([...s.tagIds].sort()).toEqual([nuevo.id, otro.id].sort());

  // Applying the same tags again changes nothing and bumps no revision: a
  // no-op write would fill the history with entries that say nothing.
  const revBefore = a.rev;
  await o.req.post("/api/tags/apply", {
    data: { folderIds: [], bookmarkIds: [conTag.id], tagIds: [nuevo.id] },
  });
  const after = await (await o.req.get(`/api/bookmarks/${conTag.id}`)).json();
  expect(after.rev).toBe(revBefore);

  await o.ctx.close();
});

test("un elemento que no puedes editar se cuenta aparte, sin tumbar el lote", async ({
  browser,
}) => {
  const owner = await newUser(browser, {
    email: "bulk.owner.e2e@example.com",
    nickname: "bulkowner",
    password: "BulkOwner28xxxxx",
  });
  const viewer = await newUser(browser, {
    email: "bulk.viewer.e2e@example.com",
    nickname: "bulkviewer",
    password: "BulkViewer28xxxx",
  });

  const group = await (
    await owner.req.post("/api/groups", { data: { name: "Lote" } })
  ).json();
  const inv = await (
    await owner.req.post(`/api/groups/${group.id}/invitations`, {
      data: { email: "bulk.viewer.e2e@example.com", expiresInDays: 7 },
    })
  ).json();
  if (!inv.autoAccepted) {
    await viewer.req.post(`/api/invitations/${inv.token}/accept`);
  }
  const members = await (
    await owner.req.get(`/api/groups/${group.id}/members`)
  ).json();
  const them = members.find(
    (x: { email: string }) => x.email === "bulk.viewer.e2e@example.com",
  );
  await owner.req.patch(
    `/api/groups/${group.id}/members/${them.userId}/role`,
    { data: { role: "viewer" } },
  );

  const shared = await (
    await owner.req.post("/api/folders", { data: { name: "Solo lectura" } })
  ).json();
  await owner.req.post("/api/shares/to-groups", {
    data: { sourceType: "folder", sourceId: shared.id, groupIds: [group.id] },
  });
  await expect(async () => {
    const list = await (await viewer.req.get("/api/folders")).json();
    expect(list.some((f: { id: string }) => f.id === shared.id)).toBe(true);
  }).toPass({ timeout: 20_000 });

  const mine = await (
    await viewer.req.post("/api/folders", { data: { name: "Mía" } })
  ).json();
  const tag = await (
    await viewer.req.post("/api/tags", { data: { name: "lote", color: "#e25a61" } })
  ).json();

  // A selection holding one read-only folder should still tag the rest.
  const res = await viewer.req.post("/api/tags/apply", {
    data: { folderIds: [mine.id, shared.id], bookmarkIds: [], tagIds: [tag.id] },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  expect(await res.json()).toEqual({ folders: 1, bookmarks: 0, skipped: 1 });

  await owner.ctx.close();
  await viewer.ctx.close();
});

test("un tag nuevo estrena color en vez de repetir el mismo", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "tag.color.e2e@example.com",
    nickname: "tagcolor",
    password: "TagColour28xxxxx",
  });

  await o.page.goto("/tags");
  const colors: string[] = [];
  for (const name of ["uno", "dos", "tres", "cuatro"]) {
    await o.page.getByRole("button", { name: "Nuevo tag" }).click();
    // The modal has no dialog role, so it is located by its heading and the
    // form fields are taken from the page with the modal open.
    await expect(
      o.page.getByRole("heading", { name: "Nuevo tag" }),
    ).toBeVisible();
    await o.page.locator("input[maxlength='64']").fill(name);
    // The dialog says "Crear" for a new tag and "Guardar" when editing one.
    await o.page.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(
      o.page.getByRole("heading", { name: "Nuevo tag" }),
    ).toHaveCount(0);
    await expect(async () => {
      const list = await (await o.req.get("/api/tags")).json();
      const made = list.find((t: { name: string }) => t.name === name);
      expect(made).toBeTruthy();
      colors.push(made.color.toLowerCase());
    }).toPass({ timeout: 10_000 });
  }

  // Four tags, four different colours. A plain random draw would collide often
  // enough to matter, which defeats the point of colouring them at all.
  expect(new Set(colors).size).toBe(colors.length);

  // And not the same four every time. Walking the palette in order also gives
  // four different colours, so distinctness alone would pass while the first
  // tag is always red and the second always orange: a counter with a paint job.
  // A second account starts from an empty palette, so under the old rule it
  // would get exactly the same sequence.
  const other = await newUser(browser, {
    email: "tag.color2.e2e@example.com",
    nickname: "tagcolor2",
    password: "TagColour28yyyyy",
  });
  const otherColors: string[] = [];
  for (const name of ["uno", "dos", "tres", "cuatro"]) {
    const made = await (
      await other.req.post("/api/tags", { data: { name } })
    ).json();
    otherColors.push(made.color.toLowerCase());
  }
  expect(new Set(otherColors).size).toBe(otherColors.length);
  // Four draws from twenty colours: matching all four by chance is about one
  // in a hundred thousand, which is a price worth paying to catch the order.
  expect(otherColors).not.toEqual(colors);

  await other.ctx.close();
  await o.ctx.close();
});

test("tres tags creados seguidos desde el picker salen de tres colores", async ({
  browser,
}) => {
  const o = await newUser(browser, {
    email: "tag.inline.e2e@example.com",
    nickname: "taginline",
    password: "TagInline28xxxxx",
  });
  await createFolder(o.page, "Con tags");
  const folders = await (await o.req.get("/api/folders")).json();
  const folder = folders.find((f: { name: string }) => f.name === "Con tags");

  // The inline picker on a folder, which is how tags actually get made in
  // day-to-day use: type a name, press enter, repeat.
  await o.page.goto(`/folder/${folder.id}`);
  await o.page.getByRole("button", { name: "Añadir tag" }).click();
  // Typed straight through, with no pause for anything to refetch. That is
  // what a person does, and it is the case where a colour chosen from the
  // client's cached list hands out the same one every time.
  for (const name of ["alfa", "beta", "gamma"]) {
    const box = o.page.getByPlaceholder(/tag/i).last();
    await box.fill(name);
    await box.press("Enter");
  }
  await expect(async () => {
    const list = await (await o.req.get("/api/tags")).json();
    expect(list).toHaveLength(3);
  }).toPass({ timeout: 15_000 });

  const list = await (await o.req.get("/api/tags")).json();
  // All three exist. Clearing the box when the answer came back instead of
  // when the name was submitted used to erase the middle one mid-typing.
  expect(list.map((t: { name: string }) => t.name).sort()).toEqual([
    "alfa",
    "beta",
    "gamma",
  ]);
  const colors = list.map((t: { color: string }) => t.color.toLowerCase());
  // Created back to back, the client's cached tag list has not caught up
  // between them, so anything that decides the colour from that list hands out
  // the same one three times.
  expect(new Set(colors).size).toBe(3);

  await o.ctx.close();
});
