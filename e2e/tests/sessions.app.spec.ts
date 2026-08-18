import { expect, test } from "@playwright/test";
import { acceptDialog, seedSpanish, signup } from "../fixtures/app.js";

/**
 * Active sessions.
 *
 * The session cookie is signed and encrypted, so it already proves identity.
 * What it could not do before was stop being valid. The assertion that matters
 * here is exactly that: after revoking from device A, device B's still-valid
 * cookie is refused. Listing them is the easy half.
 */
const user = {
  email: "sessions.e2e@example.com",
  nickname: "sessionsuser",
  password: "SeeMyDevices2026x",
};

test("sesiones: se listan, se distingue la actual y revocar corta la otra", async ({
  browser,
}) => {
  // Device A: signs up.
  const ctxA = await browser.newContext();
  await seedSpanish(ctxA);
  const pageA = await ctxA.newPage();
  await signup(pageA, user);

  // Device B: same account, its own cookie and its own User-Agent.
  const ctxB = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await seedSpanish(ctxB);
  const pageB = await ctxB.newPage();
  await pageB.goto("/login");
  await pageB.getByPlaceholder("Email o nickname").fill(user.email);
  await pageB.getByPlaceholder("Contraseña", { exact: true }).fill(user.password);
  await pageB.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    pageB.getByRole("button", { name: "Nuevo bookmark", exact: true }),
  ).toBeVisible();

  // Both show up, parsed into something a person can recognise.
  const listed = await (await pageA.request.get("/api/sessions")).json();
  expect(listed).toHaveLength(2);
  const mobile = listed.find((s: { device: string }) => s.device === "mobile");
  expect(mobile, "the iPhone session should be detected as mobile").toBeTruthy();
  expect(mobile.os).toContain("iOS");
  expect(mobile.browser).toContain("Safari");
  expect(mobile.current).toBe(false);
  expect(mobile.ip).toBeTruthy();
  // Exactly one session is the caller's own.
  expect(listed.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

  // The screen shows them.
  await pageA.goto("/settings/security");
  await expect(
    pageA.getByRole("heading", { name: "Sesiones activas" }),
  ).toBeVisible();
  await expect(pageA.getByText("Este dispositivo")).toBeVisible();
  await expect(pageA.getByText(/iOS/)).toBeVisible();

  // Device B works right up until it is revoked.
  expect((await pageB.request.get("/api/folders")).ok()).toBeTruthy();

  await pageA
    .getByRole("listitem")
    .filter({ hasText: "iOS" })
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
  await acceptDialog(pageA, "Cerrar");

  // The cookie on B is untouched and still cryptographically valid — and is
  // now refused anyway. That is the whole point of the feature.
  await expect
    .poll(async () => (await pageB.request.get("/api/folders")).status())
    .toBe(401);

  await expect(pageA.getByText(/iOS/)).toHaveCount(0);
  expect(await (await pageA.request.get("/api/sessions")).json()).toHaveLength(1);

  await ctxA.close();
  await ctxB.close();
});

test("sesiones: cerrar sesión revoca la fila, no solo la cookie", async ({
  browser,
}) => {
  const u = {
    email: "sessions.logout.e2e@example.com",
    nickname: "sessionslogout",
    password: "LogoutRevokes2026x",
  };
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, u);

  expect(await (await page.request.get("/api/sessions")).json()).toHaveLength(1);

  await page.request.post("/api/auth/logout");

  // Signing in again must not resurrect the old row: a logout ends it.
  await page.goto("/login");
  await page.getByPlaceholder("Email o nickname").fill(u.email);
  await page.getByPlaceholder("Contraseña", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Nuevo bookmark", exact: true }),
  ).toBeVisible();

  const after = await (await page.request.get("/api/sessions")).json();
  expect(after).toHaveLength(1);
  expect(after[0].current).toBe(true);

  await ctx.close();
});
