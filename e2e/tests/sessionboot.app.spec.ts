import { expect, test } from "@playwright/test";
import { createFolder, login, seedSpanish, signup } from "../fixtures/app.js";

/**
 * Switching accounts must not show the previous one's content.
 *
 * The query cache is keyed by query, not by account, so logging out and back in
 * as somebody else left `["folders"]` holding the previous user's **decrypted**
 * folder names. React Query hands cached data to the first render while it
 * refetches, so those names sat on screen for as long as the round trip took.
 *
 * Timing-dependent bugs need the timing pinned or the test proves nothing, so
 * the folder listing is held open deliberately: that turns "a couple of
 * seconds" into a window wide enough to assert inside.
 */
const ANA = {
  email: "boot.ana.e2e@example.com",
  nickname: "bootana",
  password: "SessionBootAna28x",
};
const BRUNO = {
  email: "boot.bruno.e2e@example.com",
  nickname: "bootbruno",
  password: "SessionBootBru28x",
};

test("cambiar de usuario no enseña las carpetas del anterior", async ({
  browser,
}) => {
  // Bruno is created somewhere else: signing up while logged in just bounces
  // home, and what this test needs is one browser whose cache goes from one
  // account to the other.
  const other = await browser.newContext();
  await seedSpanish(other);
  const setup = await other.newPage();
  await signup(setup, BRUNO);
  await createFolder(setup, "Cosas de Bruno");
  await other.close();

  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, ANA);
  await createFolder(page, "Secreta de Ana");
  await expect(page.getByText("Secreta de Ana").first()).toBeVisible();

  // Hold the folder listing open so the gap Ana's data used to fill is seconds
  // wide instead of milliseconds.
  let release: (() => void) | undefined;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/folders", async (route) => {
    if (route.request().method() === "GET") await held;
    return route.continue();
  });

  await page.getByRole("button", { name: ANA.email }).click();
  await expect(page.getByPlaceholder("Email o nickname")).toBeVisible();
  await page.getByPlaceholder("Email o nickname").fill(BRUNO.email);
  await page
    .getByPlaceholder("Contraseña", { exact: true })
    .fill(BRUNO.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  // Mid-load, with Bruno's folders still in flight: the loading screen is what
  // shows, and Ana's folder is nowhere. This is also where it fails if the
  // cache is not dropped, because then the shell renders straight from Ana's
  // cached answers: no loading screen appears at all, and she is underneath it.
  const bar = page.getByRole("progressbar");
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Secreta de Ana")).toHaveCount(0);
  // Real progress rather than an animation: the session check is done and so
  // are the steps that are not being held, which is why it sits in between.
  const at = Number(await bar.getAttribute("aria-valuenow"));
  expect(at).toBeGreaterThan(0);
  expect(at).toBeLessThan(100);

  release?.();

  await expect(page.getByText("Cosas de Bruno").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Secreta de Ana")).toHaveCount(0);
  await expect(bar).toHaveCount(0);

  await ctx.close();
});

test("la barra no reaparece navegando con los datos ya en memoria", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();

  const nav = {
    email: "boot.nav.e2e@example.com",
    nickname: "bootnav",
    password: "SessionBootNav28x",
  };
  await signup(page, nav);
  await createFolder(page, "Ya cargada");

  // Moving around inside the app must not re-show it: the data is already
  // there, and a loading screen on every click would be worse than the flash
  // it replaced.
  await page.getByRole("link", { name: "Tags" }).first().click();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.getByRole("link", { name: "Inicio" }).first().click();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByText("Ya cargada").first()).toBeVisible();

  // Logging back in as the same person still gets one, because the cache went
  // with the session: the data on screen is always this session's own.
  await page.getByRole("button", { name: nav.email }).click();
  await expect(page.getByPlaceholder("Email o nickname")).toBeVisible();
  await login(page, nav);
  await expect(page.getByText("Ya cargada").first()).toBeVisible();

  await ctx.close();
});
