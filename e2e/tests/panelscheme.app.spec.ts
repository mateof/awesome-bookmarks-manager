import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Reading a panel in light or dark, whatever it was designed in.
 *
 * A panel's colours are fixed strings on its template, often gradients, and
 * they do not answer to the `dark` class the rest of the app uses: some
 * built-in templates are light, some are dark. So the two forced schemes
 * replace the palette outright, and `original` is the panel as its author made
 * it.
 *
 * The choice is per panel on purpose. A single preference would mean opening
 * one panel at night dragged every other one with it, and panels are exactly
 * the thing people keep several of, for different purposes.
 */
async function makePanel(
  page: import("@playwright/test").Page,
  slug: string,
  templateId: string,
  folderName: string,
) {
  const folder = await (
    await page.request.post("/api/folders", { data: { name: folderName } })
  ).json();
  await page.request.post("/api/bookmarks", {
    data: {
      folderId: folder.id,
      url: `https://${slug}.invalid/`,
      title: "Un enlace",
      fetchSnapshot: false,
    },
  });
  const res = await page.request.post("/api/panels", {
    data: {
      title: folderName,
      slug,
      folderId: folder.id,
      templateId,
      accessMode: "public",
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

/** The panel's page background, which is what a scheme actually changes. */
async function pageBg(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el = document.querySelector("main, body > div > div") as HTMLElement;
    return getComputedStyle(el ?? document.body).backgroundColor;
  });
}

test("cada panel recuerda su propio tema", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.theme.e2e@example.com",
    nickname: "paneltheme",
    password: "PanelTheme28xxxx",
  });

  // One dark by design and one light, so "original" is visibly different for
  // each and a global setting could not serve both.
  await makePanel(page, "oscuro-e2e", "builtin:galaxy", "De noche");
  await makePanel(page, "claro-e2e", "builtin:grid", "De día");

  await page.goto("/panel/oscuro-e2e");
  const group = page.getByRole("group", { name: "Tema de este panel" });
  await expect(group).toBeVisible({ timeout: 20_000 });
  await expect(group.getByRole("button")).toHaveCount(3);

  const asDesigned = await pageBg(page);
  await group.getByRole("button", { name: "Claro" }).click();
  await expect(async () => {
    expect(await pageBg(page)).not.toBe(asDesigned);
  }).toPass({ timeout: 5000 });
  const forcedLight = await pageBg(page);

  // Survives a reload: a choice that resets is not a choice.
  await page.reload();
  await expect(group).toBeVisible({ timeout: 20_000 });
  expect(await pageBg(page)).toBe(forcedLight);

  // And it belongs to this panel only. The other one opens as its author made
  // it, which is the whole point of remembering it per panel.
  await page.goto("/panel/claro-e2e");
  await expect(group).toBeVisible({ timeout: 20_000 });
  await expect(
    group.getByRole("button", { name: "Tema original del panel" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Back to the first: still light.
  await page.goto("/panel/oscuro-e2e");
  await expect(group).toBeVisible({ timeout: 20_000 });
  await expect(group.getByRole("button", { name: "Claro" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // And back to the panel's own colours.
  await group.getByRole("button", { name: "Tema original del panel" }).click();
  await expect(async () => {
    expect(await pageBg(page)).toBe(asDesigned);
  }).toPass({ timeout: 5000 });

  await ctx.close();
});
