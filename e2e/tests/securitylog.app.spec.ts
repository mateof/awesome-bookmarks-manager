import { expect, test } from "@playwright/test";
import { adminSession, seedSpanish, signup } from "../fixtures/app.js";

/**
 * The security log.
 *
 * The point of the feature is spotting someone trying to get in, so the test
 * mounts a small brute-force run and checks it is both recorded and visible
 * through the filters. It also checks the log is admin-only: a log that leaks
 * who logged in from where would itself be the leak.
 */
const victim = {
  email: "security.log.e2e@example.com",
  nickname: "securityloguser",
  password: "AuditTheAttacks26x",
};

test("registro de seguridad: recoge intentos fallidos y los filtra", async ({
  browser,
}) => {
  const admin = await adminSession(browser);
  const adminReq = admin.page.request;

  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, victim);

  // A handful of failed logins against the account, as an attack would look.
  for (let i = 0; i < 4; i++) {
    const res = await page.request.post("/api/auth/login", {
      data: { identifier: victim.email, password: `wrong-${i}` },
    });
    expect(res.status()).toBe(401);
  }
  // And one against an account that does not exist at all.
  await page.request.post("/api/auth/login", {
    data: { identifier: "nobody@example.com", password: "nope" },
  });

  // Recorded, with what was attempted — that is what makes a run visible.
  const failed = await (
    await adminReq.get("/api/security-log?type=login_failed&limit=50")
  ).json();
  expect(failed.total).toBeGreaterThanOrEqual(5);
  const mine = failed.events.filter(
    (e: { subject: string }) => e.subject === victim.email,
  );
  expect(mine.length).toBeGreaterThanOrEqual(4);
  expect(mine[0].ip).toBeTruthy();
  expect(mine[0].status).toBe(401);

  // The signup and the successful session are there too.
  const bySubject = await (
    await adminReq.get(
      `/api/security-log?subject=${encodeURIComponent(victim.email)}&limit=50`,
    )
  ).json();
  const types = bySubject.events.map((e: { type: string }) => e.type);
  expect(types).toContain("signup");
  expect(types).toContain("login_failed");

  // The "suspicious only" filter keeps the refusals and drops the rest.
  const suspicious = await (
    await adminReq.get("/api/security-log?suspiciousOnly=1&limit=100")
  ).json();
  expect(
    suspicious.events.every((e: { type: string }) => e.type !== "signup"),
  ).toBe(true);

  // The summary counts them and names the offending IP.
  const summary = await (
    await adminReq.get("/api/security-log/summary?hours=24")
  ).json();
  expect(summary.failedLogins).toBeGreaterThanOrEqual(5);
  expect(summary.suspicious).toBeGreaterThanOrEqual(5);
  expect(summary.topOffenders.length).toBeGreaterThan(0);
  expect(summary.uniqueIps).toBeGreaterThan(0);

  // The dashboard renders it.
  await admin.page.goto("/settings/security-log");
  await expect(
    admin.page.getByRole("heading", { name: "Registro de seguridad" }),
  ).toBeVisible();
  await expect(admin.page.getByText("Logins fallidos")).toBeVisible();

  // Scope to the table: the type names also appear in the filter's <option>s.
  const table = admin.page.getByTestId("security-events");
  await expect(table.getByText("Login fallido").first()).toBeVisible();
  await expect(table.getByText("Registro", { exact: true }).first()).toBeVisible();

  // Filtering by type narrows it to just the failures.
  await admin.page
    .getByLabel("Tipo", { exact: true })
    .selectOption("login_failed");
  await expect(table.getByText("Registro", { exact: true })).toHaveCount(0);
  await expect(table.getByText("Login fallido").first()).toBeVisible();

  await ctx.close();
  await admin.ctx.close();
});

test("registro de seguridad: solo para administradores", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "security.log.nonadmin.e2e@example.com",
    nickname: "seclognonadmin",
    password: "NotYoursToRead26x",
  });

  expect((await page.request.get("/api/security-log")).status()).toBe(403);
  expect(
    (await page.request.get("/api/security-log/summary")).status(),
  ).toBe(403);

  // A 403 is itself worth recording, so the refusal shows up in the log.
  const admin = await adminSession(browser);
  const denied = await (
    await admin.page.request.get("/api/security-log?type=forbidden&limit=20")
  ).json();
  expect(denied.total).toBeGreaterThan(0);
  expect(
    denied.events.some((e: { path: string }) => e.path.includes("/security-log")),
  ).toBe(true);

  await ctx.close();
  await admin.ctx.close();
});
