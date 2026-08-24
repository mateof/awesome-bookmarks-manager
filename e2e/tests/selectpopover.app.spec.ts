import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The select dropdown in a table cell is not cut off by the table.
 *
 * It used to be positioned absolutely inside the cell, which puts it at the
 * mercy of every scrolling ancestor. The one that did the damage is easy to add
 * and hard to see: a wrapper with `overflow-x-auto`, added so a wide table can
 * scroll sideways, **also clips vertically** — the spec does not allow
 * `overflow-x: auto` with `overflow-y: visible`, so the visible one becomes
 * auto. The last option ended up outside the box, and no `z-index` could help
 * because nothing was painted behind anything: it was clipped.
 *
 * The assertion that matters is clicking the **last** option. A clipped element
 * still reports a bounding box, so "is it visible" answers yes; what fails is
 * putting the pointer on it.
 */
test("la última opción del desplegable se puede pulsar", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "select.popover.e2e@example.com",
    nickname: "selectpopover",
    password: "SelectPop28xxxxx",
  });

  const db = await (
    await page.request.post("/api/databases", { data: { name: "Tareas" } })
  ).json();
  await page.request.post(`/api/databases/${db.id}/columns`, {
    data: {
      name: "Estado",
      type: "select",
      config: {
        options: [
          { id: "p", label: "Pendiente", color: "amber" },
          { id: "c", label: "En curso", color: "blue" },
          { id: "d", label: "Hecho", color: "green" },
        ],
      },
    },
  });

  await page.goto(`/databases/${db.id}`);
  await expect(page.getByText("Vacío").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.getByText("Vacío").first().click();

  // Outside every container it sits in, by construction rather than by hoping
  // no ancestor grows an overflow.
  const escaped = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll("body > div")).find(
      (d) =>
        d.textContent?.includes("Pendiente") &&
        getComputedStyle(d).position === "fixed",
    );
    return !!panel;
  });
  expect(escaped).toBe(true);

  // The one the clipping used to swallow.
  await page.getByRole("button", { name: "Hecho" }).click();
  // The table has three rows, so the other two stay empty: what has to change
  // is the cell that was clicked.
  await expect(page.getByText("Hecho").first()).toBeVisible();
  await expect(page.getByText("Vacío")).toHaveCount(2);

  // And it closes on Escape, which a panel outside the flow has to handle
  // itself now that no click on the page reaches its old parent.
  await page.getByText("Hecho").first().click();
  await expect(page.getByRole("button", { name: "Pendiente" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Pendiente" })).toHaveCount(0);

  await ctx.close();
});
