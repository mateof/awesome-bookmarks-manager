import { BASE_URL } from "../fixtures/config.js";
import { shot, signup } from "../fixtures/app.js";
import { grace } from "../fixtures/data.js";
import { expect, test } from "../fixtures/extension.js";

/**
 * Loads the real unpacked MV3 extension and exercises the full flow: mint an
 * API token in the web UI, seed folders through the extension's own endpoint,
 * configure the options page, use the popup's folder picker and create-folder,
 * and save a tab into a chosen folder (the exact request the popup issues).
 */
test("extensión de Chrome: token, carpetas y guardado de pestaña", async ({
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

  // 2. Seed folders through the extension's own token-authenticated endpoint.
  const mkFolder = async (name: string, parentId: string | null) => {
    const r = await app.request.post(`${BASE_URL}/api/ext/folders`, {
      headers: { authorization: `Bearer ${token}` },
      data: { name, parentId },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).id as string;
  };
  const trabajoId = await mkFolder("Trabajo", null);
  await mkFolder("Proyectos", trabajoId);

  // 3. Configure the extension's options page with endpoint + token.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator("#endpoint").fill(`${BASE_URL}/api`);
  await options.locator("#token").fill(token);
  await options.locator("#save-btn").click();
  await expect(options.locator("#status")).toHaveText(/Guardado/);
  await shot(options, "20-extension-options");

  // 4. Popup: folder picker + create-folder, reading a real active tab.
  const site = await context.newPage();
  await site.goto(`${BASE_URL}/`);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 540 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await site.bringToFront();
  await popup.reload();

  const select = popup.locator("#folder-select");
  await expect(select).toContainText("Trabajo");
  await expect(select).toContainText("Proyectos");

  // Choose "Trabajo" as parent and prepare a new subfolder for the screenshot.
  await select.selectOption(trabajoId);
  await popup.locator("#new-folder-toggle").click();
  await popup.locator("#new-folder-name").fill("Ideas");
  await expect(popup.locator("#new-folder-hint")).toContainText("Trabajo");
  await shot(popup, "21-extension-popup");

  // Actually create it (exercises the popup → POST /ext/folders path).
  await popup.locator("#new-folder-create").click();
  await expect(popup.locator("#status")).toContainText("Ideas");
  const ideasId = await select.inputValue();
  expect(ideasId).not.toBe(trabajoId);
  expect(ideasId).not.toBe("");

  // 5. Save the active tab into that folder — the exact request the popup makes.
  const saveResp = await app.request.post(`${BASE_URL}/api/ext/quick-add`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      url: "https://example.com/",
      title: "Guardado desde la extensión",
      tags: ["demo"],
      folderId: ideasId,
    },
  });
  expect(saveResp.ok(), await saveResp.text()).toBeTruthy();

  // 6. The bookmark shows up inside the folder we created from the popup.
  await app.goto(`/folder/${ideasId}`);
  await expect(
    app.getByText("Guardado desde la extensión").first(),
  ).toBeVisible({ timeout: 10_000 });
  await shot(app, "22-extension-saved", { full: true });
});
