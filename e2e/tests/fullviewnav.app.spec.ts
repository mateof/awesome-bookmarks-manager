import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Following a reference from the expanded note closes the expanded note.
 *
 * The overlay used to stay open on top of the page you had just arrived at,
 * still showing the note you came from. React Router keeps the folder page
 * mounted when only the route parameter changes, so nothing unmounted the
 * dialog and nothing reset its state: you landed somewhere new and could not
 * see it.
 */
const LONG = Array.from(
  { length: 14 },
  (_, i) => `<p>Línea ${i} de relleno para que la nota pase del alto máximo.</p>`,
).join("");

test("seguir una referencia desde la vista ampliada la cierra", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "fullview.nav.e2e@example.com",
    nickname: "fullviewnav",
    password: "FullViewNav28xxx",
  });

  // The destination needs a note of its own, and this is the whole reason the
  // bug exists. Landing on a folder *without* one unmounts the component and
  // takes the open dialog with it, so a test built that way passes with or
  // without the fix. It is only when the same component survives the
  // navigation that the stale state shows.
  const destino = await (
    await page.request.post("/api/folders", {
      data: { name: "Destino", description: `${LONG}<p>Nota del destino.</p>` },
    })
  ).json();
  const origen = await (
    await page.request.post("/api/folders", {
      data: {
        name: "Origen",
        // Long enough that the note overflows and the maximise button appears;
        // that button is the only way into the state under test.
        // The real markup a reference has: an anchor, which is what the click
        // handler looks for (`a[data-ref]`). A span carries the attributes and
        // does nothing.
        description: `${LONG}<p>Ir a <a class="ab-ref" data-ref="folder" data-ref-id="${destino.id}">Destino</a></p>`,
      },
    })
  ).json();

  await page.goto(`/folder/${origen.id}`);
  await expect(page.getByRole("heading", { name: "Origen" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Ver completa" }).click();
  const dialog = page.getByRole("heading", { name: "Texto completo" });
  await expect(dialog).toBeVisible();

  // The chip inside the overlay, not the one in the collapsed note behind it.
  await page.getByText("Destino").last().click();

  await expect(page).toHaveURL(new RegExp(`/folder/${destino.id}$`));
  // The point: the overlay is gone, so the page you navigated to is visible.
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Destino" })).toBeVisible();
  // And what shows is the destination's own note, not the one we came from.
  await expect(page.getByText("Nota del destino.")).toBeVisible();

  await ctx.close();
});
