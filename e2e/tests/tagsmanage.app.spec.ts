import { expect, test } from "@playwright/test";
import { acceptDialog, seedSpanish, signup } from "../fixtures/app.js";

/**
 * Tidying up a tag library, which is what this screen is really for.
 *
 * One import of a read-later app brings hundreds of tags at once, half of them
 * used by nothing and a good few the same word twice (`receta` next to
 * `recetas`). This is the only screen where the unused ones appear at all,
 * because the filter page hides them.
 */
test("tags: contar, ordenar, ver los que sobran y borrarlos en bloque", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "tags.manage.e2e@example.com",
    nickname: "tagsmanage",
    password: "TagsManage27xxx",
  });
  const req = page.request;

  const mk = async (name: string) =>
    (await req.post("/api/tags", { data: { name } })).json();
  const usado = await mk("usado");
  const poco = await mk("poco");
  await mk("huerfano-1");
  await mk("huerfano-2");

  const carpeta = await (
    await req.post("/api/folders", { data: { name: "Cosas", tagIds: [usado.id] } })
  ).json();
  await Promise.all(
    [1, 2, 3].map((n) =>
      req.post("/api/bookmarks", {
        data: {
          url: `https://cuenta.example/${n}`,
          title: `Enlace ${n}`,
          folderId: carpeta.id,
          tagIds: [usado.id],
          fetchSnapshot: false,
        },
      }),
    ),
  );
  await req.post("/api/bookmarks", {
    data: {
      url: "https://cuenta.example/solo",
      title: "Solo uno",
      folderId: carpeta.id,
      tagIds: [poco.id],
      fetchSnapshot: false,
    },
  });

  await page.goto("/tags");
  const row = (name: string) =>
    page.locator("div").filter({ has: page.getByRole("link", { name, exact: true }) }).last();

  // Counted by the server and split: one folder and three bookmarks is a
  // different situation from four of either, and it decides whether a tag goes.
  await expect(row("usado")).toContainText("1 carpeta");
  await expect(row("usado")).toContainText("3 bookmarks");
  await expect(row("huerfano-1")).toContainText("sin usar");

  // Ordered by use, the most used first, because with hundreds of tags the
  // question is which ones carry the library.
  await page.getByLabel("Orden").selectOption("most");
  const firstLink = page.getByRole("link", { name: /usado|poco|huerfano/ }).first();
  await expect(firstLink).toHaveText("usado");

  // The ones nothing uses, which is what an import leaves behind.
  await page.getByRole("button", { name: /Sin usar \(2\)/ }).click();
  await expect(page.getByRole("link", { name: "huerfano-1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "usado" })).toHaveCount(0);

  // Selected and deleted in one go, with one confirmation instead of two.
  await row("huerfano-1").getByRole("checkbox").check();
  await row("huerfano-2").getByRole("checkbox").check();
  await expect(page.getByText("2 seleccionados")).toBeVisible();
  await page.getByRole("button", { name: "Borrar", exact: true }).click();
  // The app's own confirmation, not the browser's: one for the whole batch
  // instead of one per tag, which is the point of selecting them.
  await acceptDialog(page);

  await expect(async () => {
    const tags = await (await req.get("/api/tags")).json();
    expect(tags.map((t: { name: string }) => t.name).sort()).toEqual([
      "poco",
      "usado",
    ]);
  }).toPass({ timeout: 10_000 });

  // What is in the bin does not count. It is not gone, but it is not there
  // either, and a tag that only survives on deleted items reads as unused.
  const enPapelera = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://cuenta.example/papelera",
        title: "A la papelera",
        folderId: carpeta.id,
        tagIds: [poco.id],
        fetchSnapshot: false,
      },
    })
  ).json();
  await expect(async () => {
    const tags = await (await req.get("/api/tags")).json();
    expect(tags.find((t: { id: string }) => t.id === poco.id).bookmarkCount).toBe(2);
  }).toPass({ timeout: 10_000 });
  await req.delete(`/api/bookmarks/${enPapelera.id}`);
  await expect(async () => {
    const tags = await (await req.get("/api/tags")).json();
    expect(tags.find((t: { id: string }) => t.id === poco.id).bookmarkCount).toBe(1);
  }).toPass({ timeout: 10_000 });

  // Deleting a tag that was in use takes its join rows with it. Leaving them
  // behind, which is what used to happen, meant the folder kept reporting a
  // tag id that resolves to nothing: invisible on screen, and wrong.
  await req.delete(`/api/tags/${usado.id}`);
  await expect(async () => {
    const f = await (await req.get(`/api/folders/${carpeta.id}`)).json();
    expect(f.tagIds ?? []).not.toContain(usado.id);
    const marcadores = await (await req.get("/api/bookmarks")).json();
    for (const b of marcadores) expect(b.tagIds ?? []).not.toContain(usado.id);
  }).toPass({ timeout: 10_000 });

  await ctx.close();
});

/**
 * Merging, and the part of it that is easy to get wrong: a saved filter naming
 * the tag that disappears would silently stop matching anything.
 */
test("tags: fusionar dos deja uno, con sus items y sus filtros guardados", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "tags.merge.e2e@example.com",
    nickname: "tagsmerge",
    password: "TagsMerge27xxxx",
  });
  const req = page.request;

  const receta = await (
    await req.post("/api/tags", { data: { name: "receta" } })
  ).json();
  const recetas = await (
    await req.post("/api/tags", { data: { name: "recetas" } })
  ).json();

  const carpeta = await (
    await req.post("/api/folders", { data: { name: "Cocina" } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://cocina.example/uno",
      title: "Pan bao",
      folderId: carpeta.id,
      tagIds: [recetas.id],
      fetchSnapshot: false,
    },
  });
  // One item already carrying both: the case that a plain UPDATE of the join
  // rows would break, because the pair is the primary key.
  await req.post("/api/bookmarks", {
    data: {
      url: "https://cocina.example/dos",
      title: "Ambos",
      folderId: carpeta.id,
      tagIds: [receta.id, recetas.id],
      fetchSnapshot: false,
    },
  });
  const saved = await (
    await req.post("/api/smart-folders", {
      data: { name: "Recetario", query: { tagIds: [recetas.id], match: "any", text: "", favorite: false } },
    })
  ).json();

  await page.goto("/tags");
  const fila = page
    .locator("div")
    .filter({ has: page.getByRole("link", { name: "recetas", exact: true }) })
    .last();
  await fila.getByRole("button", { name: "Fusionar con otro" }).click();

  const dialog = page.getByTestId("tag-merge");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^receta/ }).first().click();

  await expect(async () => {
    const tags = await (await req.get("/api/tags")).json();
    const names = tags.map((t: { name: string }) => t.name);
    // The one folded away is gone, the survivor stays.
    expect(names).toContain("receta");
    expect(names).not.toContain("recetas");
    // And it now carries both bookmarks, counted once each.
    const superviviente = tags.find((t: { name: string }) => t.name === "receta");
    expect(superviviente.bookmarkCount).toBe(2);
  }).toPass({ timeout: 10_000 });

  // The saved filter names the survivor now. Left alone it would point at a
  // tag that no longer exists and quietly match nothing.
  const smart = await (await req.get(`/api/smart-folders`)).json();
  const mine = smart.find((s: { id: string }) => s.id === saved.id);
  expect(mine.query.tagIds).toEqual([receta.id]);

  await ctx.close();
});
