import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Two pickers that stopped scaling with the library.
 *
 * The folder one was a `<select>` holding every folder as a flat line labelled
 * with its whole path. Fine for a dozen; with two hundred it is a native list
 * on a phone with no search, and the shape of the library — the thing people
 * navigate by — flattened into repeated prefixes. It is reached from the share
 * target, which is exactly where somebody is filing a link in a hurry.
 *
 * The tag one already suggested as you typed and could only be used with the
 * mouse: the suggestions were there and the arrow keys did nothing.
 */
test("elegir carpeta: árbol que se despliega y búsqueda que lo ignora", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "folder.picker.e2e@example.com",
    nickname: "folderpicker",
    password: "FolderPicker27xx",
  });
  const req = page.request;

  const raiz = await (
    await req.post("/api/folders", { data: { name: "Trabajo" } })
  ).json();
  const media = await (
    await req.post("/api/folders", {
      data: { name: "Proveedores", parentId: raiz.id },
    })
  ).json();
  await req.post("/api/folders", {
    data: { name: "Contratos", parentId: media.id },
  });
  await req.post("/api/folders", { data: { name: "Personal" } });

  await page.goto("/share-target?url=https%3A%2F%2Fejemplo.invalid%2F&title=Uno");
  await page.getByRole("button", { name: "Inicio" }).click();
  const picker = page.getByTestId("folder-picker");
  await expect(picker).toBeVisible({ timeout: 20_000 });

  // Closed to begin with: a tree that opens everything is the flat list again.
  await expect(picker.getByRole("button", { name: "Contratos" })).toHaveCount(0);
  await picker.getByRole("button", { name: "Desplegar" }).first().click();
  await expect(picker.getByRole("button", { name: "Proveedores" })).toBeVisible();
  await picker.getByRole("button", { name: "Desplegar" }).first().click();
  await expect(picker.getByRole("button", { name: "Contratos" })).toBeVisible();

  // And the search ignores the tree: you type the name because you do not
  // remember which branch it is on. It shows the path, which is what tells two
  // folders of the same name apart.
  await page.getByLabel("Buscar una carpeta…").fill("contra");
  const hit = picker.getByRole("button", { name: /Contratos/ });
  await expect(hit).toBeVisible();
  await expect(hit).toContainText("Trabajo / Proveedores / Contratos");
  await hit.click();

  // The choice comes back on the button that opened it, spelled out in full.
  await expect(
    page.getByRole("button", { name: /Trabajo \/ Proveedores \/ Contratos/ }),
  ).toBeVisible();

  await ctx.close();
});

test("tags: flechas para elegir una sugerencia y Enter para añadirla", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "tag.keys.e2e@example.com",
    nickname: "tagkeys",
    password: "TagKeys27xxxxxx",
  });
  const req = page.request;

  for (const name of ["contabilidad", "contratos", "contactos"]) {
    await req.post("/api/tags", { data: { name } });
  }
  const folder = await (
    await req.post("/api/folders", { data: { name: "Cosas" } })
  ).json();

  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Añadir tag" }).click();
  const box = page.getByPlaceholder(/tag/i).first();
  await box.fill("cont");
  const list = page.getByTestId("tag-suggestions");
  await expect(list).toBeVisible();

  // Nothing is highlighted until an arrow says so. With a highlight already
  // on, typing a new name that happens to be a prefix of an existing tag and
  // pressing Enter would add the wrong one instead of creating yours.
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(0);

  // Read the order off the list itself rather than assuming one: what the
  // second arrow press lands on has to be the second row on screen, whatever
  // order the tags come back in.
  const suggestions = page.getByRole("button", {
    name: /^(contabilidad|contactos|contratos)$/,
  });
  await expect(suggestions).toHaveCount(3);
  const names = (await suggestions.allTextContents()).map((s) => s.trim());

  await page.keyboard.press("ArrowUp");
  // Up from nothing-selected is the last row, which here is "create «cont»" —
  // reachable in one press rather than four.
  await expect(list.locator('[data-idx="3"][aria-selected="true"]')).toHaveCount(1);

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(list.locator('[data-idx="1"][aria-selected="true"]')).toHaveCount(1);
  await page.keyboard.press("Enter");

  // The tag that was added is the highlighted one: not the first match, and
  // not "cont", which is what Enter alone would have created.
  await expect(async () => {
    const after = await (await req.get(`/api/folders/${folder.id}`)).json();
    const tags = await (await req.get("/api/tags")).json();
    const applied = after.tagIds.map(
      (id: string) => tags.find((t: { id: string }) => t.id === id)?.name,
    );
    expect(applied).toEqual([names[1]]);
  }).toPass({ timeout: 10_000 });

  await ctx.close();
});
