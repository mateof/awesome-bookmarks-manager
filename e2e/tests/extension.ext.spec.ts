import { BASE_URL } from "../fixtures/config.js";
import { shot, signup } from "../fixtures/app.js";
import { grace } from "../fixtures/data.js";
import { expect, test } from "../fixtures/extension.js";

/**
 * Loads the real unpacked MV3 extension, mints an API token in the web UI,
 * configures the options page, and exercises the exact request the popup
 * issues to save a tab (POST /api/ext/quick-add with a bearer token).
 */
test("extensión de Chrome: token, opciones y guardado de pestaña", async ({
  context,
  extensionId,
}) => {
  const app = await context.newPage();
  await signup(app, grace);

  // 1. Mint an API/extension token in Settings → API.
  await app.goto("/settings/api");
  await expect(
    app.getByRole("heading", { name: "Acceso por API y tokens" }),
  ).toBeVisible();
  await app.getByPlaceholder(/Etiqueta/).fill("Extensión Chrome");
  const [resp] = await Promise.all([
    app.waitForResponse(
      (r) =>
        r.url().includes("/api/extension/tokens") &&
        r.request().method() === "POST",
    ),
    app.getByRole("button", { name: "Crear token" }).click(),
  ]);
  const token = (await resp.json()).token as string;
  expect(token, "the mint endpoint should return a token").toBeTruthy();
  await expect(app.getByRole("heading", { name: "Token creado" })).toBeVisible();
  await shot(app, "19-api-token");

  // 2. Configure the extension's options page with endpoint + token.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator("#endpoint").fill(`${BASE_URL}/api`);
  await options.locator("#token").fill(token);
  await options.locator("#save-btn").click();
  await expect(options.locator("#status")).toHaveText(/Guardado/);
  await shot(options, "20-extension-options");

  // 3. The popup UI, reading a real active tab. Open a normal page, bring it
  //    to the front so it is the active tab, then (re)load the popup so its
  //    chrome.tabs.query picks up that page's title + URL in the header.
  const site = await context.newPage();
  await site.goto(`${BASE_URL}/`);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 300 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await site.bringToFront();
  await popup.reload();
  await popup.waitForTimeout(500);
  await shot(popup, "21-extension-popup");

  // 4. The exact call the extension makes to save the active tab. Uses the
  //    app's own URL as the target so the run needs no external network.
  const saveResp = await app.request.post(`${BASE_URL}/api/ext/quick-add`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      url: `${BASE_URL}/`,
      title: "Guardado desde la extensión",
      tags: ["demo"],
    },
  });
  expect(saveResp.ok(), await saveResp.text()).toBeTruthy();

  // 5. The saved bookmark shows up in the user's library.
  await expect(async () => {
    await app.goto("/");
    await expect(
      app.getByText("Guardado desde la extensión").first(),
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  await shot(app, "22-extension-saved", { full: true });
});
