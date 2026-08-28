import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The tag filter of a panel, when the panel has a lot of tags.
 *
 * It listed every tag at once, so a library with a hundred of them opened with
 * the filter filling the screen and the links themselves below the fold: the
 * way *into* the panel had become the panel. Now it is capped, it scrolls, it
 * opens up on demand, and it has a search of its own — because when there are
 * enough tags to need a filter, the filter needs a filter.
 */
test("panel: el filtro de tags se acota, se despliega y se busca", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.tags.e2e@example.com",
    nickname: "paneltags",
    password: "PanelTags27xxxx",
  });
  const req = page.request;

  const root = await (
    await req.post("/api/folders", { data: { name: "Panelón" } })
  ).json();

  // Forty tags, one bookmark each: enough that the bar has to give up on
  // showing them all at once.
  const tags = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      req
        .post("/api/tags", { data: { name: `etiqueta-${String(i).padStart(2, "0")}` } })
        .then((r) => r.json()),
    ),
  );
  // One with an accent, to check the search ignores them.
  const conAcento = await (
    await req.post("/api/tags", { data: { name: "botánica" } })
  ).json();

  await Promise.all(
    [...tags, conAcento].map((tag, i) =>
      req.post("/api/bookmarks", {
        data: {
          url: `https://panel.example/${i}`,
          title: `Enlace ${i}`,
          folderId: root.id,
          tagIds: [tag.id],
          fetchSnapshot: false,
        },
      }),
    ),
  );

  await req.post("/api/panels", {
    data: {
      title: "Con tags",
      slug: "contags",
      folderId: root.id,
      accessMode: "public",
    },
  });

  await expect(async () => {
    await page.goto("/panel/contags");
    await expect(page.getByTestId("panel-tag-filter")).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 30_000 });

  const bar = page.getByTestId("panel-tag-filter");
  const list = bar.locator("div").filter({ has: page.getByText("etiqueta-00") }).last();

  // Capped and scrolling, rather than as tall as the tag list happens to be.
  const capped = await list.evaluate((el) => ({
    height: Math.round(el.getBoundingClientRect().height),
    scrolls: el.scrollHeight > el.clientHeight + 1,
  }));
  expect(capped.height).toBeLessThan(120);
  expect(capped.scrolls).toBe(true);

  // It opens up on demand, and closes again.
  await bar.getByRole("button", { name: /ver todos/ }).click();
  const opened = await list.evaluate((el) =>
    Math.round(el.getBoundingClientRect().height),
  );
  expect(opened).toBeGreaterThan(capped.height);
  await bar.getByRole("button", { name: /ver menos/ }).click();
  await expect
    .poll(async () =>
      list.evaluate((el) => Math.round(el.getBoundingClientRect().height)),
    )
    .toBeLessThan(120);

  // And a search over the tags themselves, which is the only way to reach one
  // that is a hundred chips down.
  await bar.getByLabel("Buscar un tag").fill("etiqueta-3");
  await expect(bar.getByRole("button", { name: /^etiqueta-30/ })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^etiqueta-00/ })).toHaveCount(0);

  // Accents are not something anybody wants to type to find a tag.
  await bar.getByLabel("Buscar un tag").fill("botanica");
  const acentuado = bar.getByRole("button", { name: /^botánica/ });
  await expect(acentuado).toBeVisible();

  // A tag stays reachable while it is switched on, even when the search no
  // longer matches it: otherwise the only control that turns it off is hidden.
  await acentuado.click();
  await bar.getByLabel("Buscar un tag").fill("etiqueta-1");
  await expect(bar.getByRole("button", { name: /^botánica/ })).toBeVisible();

  await ctx.close();
});
