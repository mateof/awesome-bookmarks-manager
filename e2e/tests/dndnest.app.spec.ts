import { expect, test, type Page } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Dropping something *into* a folder.
 *
 * The folder icon doubles as the drop target, and the card's action cluster
 * (grip, star, kebab) is absolutely positioned in the top-right corner. Both
 * are positioned elements, and the icon comes later in the DOM, so at equal
 * z-index the icon paints over the cluster. On a narrow grid card that lands
 * the icon squarely on top of the grip: pressing the grip pressed the icon,
 * and the card could not be dragged at all.
 *
 * The grid is the default view, so this test drives the whole journey there:
 * grab the grip, drop on another folder's icon, and check the move reached the
 * server.
 */
const user = {
  email: "dnd.nest.e2e@example.com",
  nickname: "dndnest",
  password: "DropInsideFolder26x",
};

const NEST = "Suelta aquí para mover dentro de esta carpeta";

async function dragOnto(page: Page, handle: ReturnType<Page["locator"]>, target: ReturnType<Page["locator"]>) {
  const hb = (await handle.boundingBox())!;
  const tb = (await target.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 20, { steps: 5 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

const card = (page: Page, text: string) =>
  page.locator("div.group.relative").filter({ hasText: text }).first();
const grip = (page: Page, text: string) =>
  card(page, text).getByRole("button", { name: "Arrastrar para reordenar" });

test("arrastrar una carpeta dentro de otra desde la rejilla", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const dest = await (
    await req.post("/api/folders", { data: { name: "Destino" } })
  ).json();
  const mover = await (
    await req.post("/api/folders", { data: { name: "Movil" } })
  ).json();

  await page.goto("/");

  // The grip has to be the topmost thing at its own coordinates, or the press
  // never reaches it. This is the assertion that fails without the fix.
  const gb = (await grip(page, "Movil").boundingBox())!;
  const topmost = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return el?.closest("button")?.getAttribute("aria-label") ?? "";
    },
    [gb.x + gb.width / 2, gb.y + gb.height / 2],
  );
  expect(topmost).toBe("Arrastrar para reordenar");

  await dragOnto(page, grip(page, "Movil"), card(page, "Destino").getByTitle(NEST));

  await expect(async () => {
    const folders: Array<{ id: string; parentId: string | null }> = await (
      await req.get("/api/folders")
    ).json();
    expect(folders.find((f) => f.id === mover.id)?.parentId).toBe(dest.id);
  }).toPass({ timeout: 5000 });
});

test("arrastrar un bookmark dentro de una carpeta, y a la carpeta del lateral", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "dnd.nest.bm.e2e@example.com",
    nickname: "dndnestbm",
    password: "BookmarkIntoIt26xx",
  });
  const req = page.request;

  const dest = await (
    await req.post("/api/folders", { data: { name: "Destino" } })
  ).json();
  const other = await (
    await req.post("/api/folders", { data: { name: "Otra" } })
  ).json();
  const bm = await (
    await req.post("/api/bookmarks", {
      data: { url: "https://mover.example/", title: "Muevete", fetchSnapshot: false },
    })
  ).json();

  // Onto a folder card's icon.
  await page.goto("/");
  await dragOnto(page, grip(page, "Muevete"), card(page, "Destino").getByTitle(NEST));
  await expect(async () => {
    const after = await (await req.get(`/api/bookmarks/${bm.id}`)).json();
    expect(after.folderId).toBe(dest.id);
  }).toPass({ timeout: 5000 });

  // And onto a folder in the sidebar tree, which is the other way in.
  await page.goto(`/folder/${dest.id}`);
  const sidebarOther = page.getByRole("link", { name: "Otra" }).first();
  await dragOnto(page, grip(page, "Muevete"), sidebarOther);
  await expect(async () => {
    const after = await (await req.get(`/api/bookmarks/${bm.id}`)).json();
    expect(after.folderId).toBe(other.id);
  }).toPass({ timeout: 5000 });
});
