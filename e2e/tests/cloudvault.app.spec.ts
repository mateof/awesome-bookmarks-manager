import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Cloud vault management.
 *
 * No real Drive/OneDrive/WebDAV server exists in the test environment, so what
 * can be proved here is the half that lives in this codebase: the endpoints
 * exist, they are scoped to the caller, and the round-trip refuses the shapes
 * it should. The provider calls themselves are exercised against a real
 * account by hand.
 */
const user = {
  email: "cloud.vault.e2e@example.com",
  nickname: "cloudvaultuser",
  password: "VaultToVault2026x",
};

test("bóvedas: endpoints presentes, propios y con validación", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  // A vault the test owns. Synology/WebDAV is the only provider that can be
  // created without an OAuth dance.
  const created = await req.post("/api/cloud/connect/synology", {
    data: {
      label: "NAS de prueba",
      url: "https://nas.invalid:5006",
      username: "tester",
      password: "irrelevante",
      basePath: "/AwesomeBookmarks",
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const connId = (await created.json()).id as string;

  const conns = await (await req.get("/api/cloud/connections")).json();
  expect(conns).toHaveLength(1);
  expect(conns[0].isDefault).toBe(false);

  // Marking it primary is reflected back.
  expect((await req.patch(`/api/cloud/connections/${connId}/default`)).ok()).toBe(
    true,
  );
  const afterDefault = await (await req.get("/api/cloud/connections")).json();
  expect(afterDefault[0].isDefault).toBe(true);

  // Copying to itself is refused rather than quietly doing nothing.
  const sameVault = await req.post(`/api/cloud/connections/${connId}/copy-to`, {
    data: { filename: "x.zip", targetConnectionId: connId },
  });
  expect(sameVault.status()).toBe(400);

  // Restore validates its body.
  const noFilename = await req.post(
    `/api/cloud/connections/${connId}/restore`,
    { data: {} },
  );
  expect(noFilename.status()).toBe(400);

  // Another account cannot touch this vault, nor even see it exists.
  const otherCtx = await browser.newContext();
  await seedSpanish(otherCtx);
  const otherPage = await otherCtx.newPage();
  await signup(otherPage, {
    email: "cloud.vault.other.e2e@example.com",
    nickname: "cloudvaultother",
    password: "NotYourVault2026x",
  });
  expect(await (await otherPage.request.get("/api/cloud/connections")).json()).toEqual(
    [],
  );
  expect(
    (await otherPage.request.get(`/api/cloud/connections/${connId}/backups`)).status(),
  ).toBe(404);
  expect(
    (
      await otherPage.request.patch(`/api/cloud/connections/${connId}/default`)
    ).status(),
  ).toBe(404);

  // The settings screen exposes it.
  await page.goto("/settings/cloud");
  await expect(page.getByText("NAS de prueba")).toBeVisible();
  await expect(page.getByText("Predeterminado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver copias" })).toBeVisible();

  await otherCtx.close();
  await ctx.close();
});
