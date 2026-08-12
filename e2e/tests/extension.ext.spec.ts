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

  // Seed an existing tag so the popup can autocomplete it.
  await app.request.post(`${BASE_URL}/api/ext/tags`, {
    headers: { authorization: `Bearer ${token}` },
    data: { name: "demo", color: "#22c55e" },
  });

  // 3. Configure the extension's options page with endpoint + token.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  // Configure the plain server origin WITHOUT the "/api" suffix: the extension
  // must add it, otherwise requests fall into the SPA and folder-loading fails
  // with "Unexpected token '<'".
  await options.locator("#endpoint").fill(BASE_URL);
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

  const tree = popup.locator("#folder-tree");
  await expect(tree).toContainText("Trabajo");

  // Search finds a nested folder without expanding the tree by hand.
  await popup.locator("#folder-search").fill("Proyectos");
  await expect(tree).toContainText("Proyectos");
  await popup.locator("#folder-search").fill("");

  // Tag autocomplete: typing suggests the existing tag; clicking adds a chip.
  const suggest = popup.locator("#tag-suggest");
  await popup.locator("#tags-input").fill("de");
  await expect(suggest).toContainText("demo");
  await suggest.getByText("demo", { exact: true }).click();
  await expect(popup.locator("#tag-chips")).toContainText("demo");

  // A brand-new tag: pick a colour swatch to create it.
  await popup.locator("#tags-input").fill("urgente");
  await expect(suggest).toContainText("Crear «urgente»");
  await suggest.locator(".swatch").first().click();
  await expect(popup.locator("#tag-chips")).toContainText("urgente");

  // Select "Trabajo" in the tree and create a subfolder from the popup.
  await tree.getByText("Trabajo", { exact: true }).click();
  await popup.locator("#new-folder-toggle").click();
  await popup.locator("#new-folder-name").fill("Ideas");
  await expect(popup.locator("#new-folder-hint")).toContainText("Trabajo");
  await shot(popup, "21-extension-popup");

  // Actually create it (exercises the popup → POST /ext/folders path).
  await popup.locator("#new-folder-create").click();
  await expect(popup.locator("#status")).toContainText("Ideas");

  // Resolve the new folder id from the API (there's no <select> value now).
  const foldersNow = await (
    await app.request.get(`${BASE_URL}/api/ext/folders`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json();
  const ideas = (
    foldersNow as { id: string; name: string; parentId: string | null }[]
  ).find((f) => f.name === "Ideas" && f.parentId === trabajoId);
  expect(ideas, "Ideas created under Trabajo").toBeTruthy();
  const ideasId = ideas!.id;

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
