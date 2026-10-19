import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { BrowserContext, Page } from "@playwright/test";
import { BASE_URL } from "../fixtures/config.js";
import { shot, signup } from "../fixtures/app.js";
import { autofillUser } from "../fixtures/data.js";
import { expect, test } from "../fixtures/extension.js";

let forms: Server;
let FORM_URL = "";
let REDIRECT_URL = "";
let ELSEWHERE_URL = "";

const FORM_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Alta de trámite</title></head>
<body>
  <h1>Alta de trámite</h1>
  <form>
    <label>NIF <input id="nif" name="nif"></label>
    <label>Nombre <input name="nombre"></label>
    <label>Provincia
      <select id="provincia">
        <option value="">--</option>
        <option value="M">Madrid</option>
        <option value="B">Barcelona</option>
      </select>
    </label>
    <label><input type="checkbox" id="acepto"> Acepto</label>
  </form>
  <output id="mirror"></output>
  <script>
    document.getElementById("nif").addEventListener("input", (e) => {
      document.getElementById("mirror").textContent = "input:" + e.target.value;
    });
    setTimeout(() => {
      const late = document.createElement("input");
      late.id = "tarde";
      document.querySelector("form").appendChild(late);
    }, 800);
  </script>
</body></html>`;

test.beforeAll(async () => {
  forms = createServer((req, res) => {
    if (req.url?.startsWith("/salto")) {
      res.writeHead(302, { location: ELSEWHERE_URL });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(FORM_HTML);
  });
  await new Promise<void>((resolve) => forms.listen(0, "127.0.0.1", resolve));
  const { port } = forms.address() as AddressInfo;
  FORM_URL = `http://127.0.0.1:${port}/alta`;
  REDIRECT_URL = `http://127.0.0.1:${port}/salto`;
  ELSEWHERE_URL = `http://localhost:${port}/alta`;
});

test.afterAll(async () => {
  await new Promise((resolve) => forms.close(resolve));
});

async function nextPage(context: BrowserContext, prefix: string, open: () => Promise<void>) {
  const seen = new Set(context.pages());
  await open();
  await expect
    .poll(() => context.pages().find((p) => !seen.has(p) && p.url().startsWith(prefix))?.url() ?? "", {
      timeout: 15_000,
    })
    .not.toBe("");
  const page = context.pages().find((p) => !seen.has(p) && p.url().startsWith(prefix))!;
  await page.waitForLoadState("load");
  return page;
}

async function createBookmark(app: Page, url: string, title: string): Promise<string> {
  const res = await app.request.post(`${BASE_URL}/api/bookmarks`, {
    data: { url, title, folderId: null, fetchSnapshot: false },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).id as string;
}

async function mintToken(app: Page, label: string, autofill: boolean): Promise<string> {
  await app.goto("/settings/api");
  await app.getByPlaceholder(/Etiqueta/).fill(label);
  const box = app.getByRole("checkbox", { name: /Puede leer los datos de autorrelleno/ });
  if (autofill) await box.check();
  const [resp] = await Promise.all([
    app.waitForResponse(
      (r) => r.url().includes("/api/extension/tokens") && r.request().method() === "POST",
    ),
    app.getByRole("button", { name: "Crear token" }).click(),
  ]);
  return (await resp.json()).token as string;
}

test("autorrelleno: variables, automatización aprobada, apertura desde la web y captura", async ({
  context,
  extensionId,
}) => {
  const app = await context.newPage();
  await signup(app, autofillUser);

  await app.goto("/settings/autofill");
  await expect(app.getByRole("heading", { name: "Datos para autorrelleno" })).toBeVisible();
  await app.getByRole("button", { name: "+ DNI" }).click();
  await app.getByRole("button", { name: "+ Nombre" }).click();
  const rows = app.getByTestId("autofill-variable");
  await rows.nth(0).getByLabel("Valor", { exact: true }).fill("12345678Z");
  await rows.nth(1).getByLabel("Valor", { exact: true }).fill("Radia");
  await app.getByRole("button", { name: "Guardar" }).click();
  await expect(app.getByText("Guardado", { exact: true })).toBeVisible();
  await shot(app, "60-autofill-variables");

  const scoped = await mintToken(app, "Extensión con autorrelleno", true);
  await expect(app.getByText("autorrelleno", { exact: true })).toBeVisible();
  const plain = await mintToken(app, "MCP", false);

  const denied = await app.request.get(`${BASE_URL}/api/ext/autofill`, {
    headers: { authorization: `Bearer ${plain}` },
  });
  expect(denied.status(), "a token without the autofill scope reads no values").toBe(403);
  const described = await app.request.get(`${BASE_URL}/api/v1/autofill/variables`, {
    headers: { authorization: `Bearer ${plain}` },
  });
  expect(await described.text()).not.toContain("12345678Z");

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator("#endpoint").fill(BASE_URL);
  await options.locator("#token").fill(scoped);
  await options.locator("#save-btn").click();
  await expect(options.locator("#status")).toHaveText(/Guardado/);
  await expect(options.locator("#userscripts-status")).toContainText("Los pasos funcionan");

  const bookmarkId = await createBookmark(app, FORM_URL, "Alta de trámite");
  await app.goto(`/bookmark/${bookmarkId}`);
  const section = app.getByTestId("automation-section");
  await expect(section).toContainText("Sin automatización");
  const automationBlock = app.locator("section", { has: section });
  await automationBlock.getByRole("button", { name: "Añadir", exact: true }).click();
  const editor = app.getByTestId("automation-editor");
  const steps = editor.getByTestId("automation-step");
  await steps.nth(0).getByLabel("Selector CSS").fill("#nif");
  await steps.nth(0).getByLabel("Insertar variable").selectOption("dni");
  for (const [i, action, selector, value] of [
    [1, "fill", "input[name=nombre]", "{{nombre}} Perlman"],
    [2, "select", "#provincia", "Madrid"],
    [3, "check", "#acepto", null],
    [4, "fill", "#tarde", "llega tarde"],
  ] as const) {
    await editor.getByRole("button", { name: "Añadir paso" }).click();
    await steps.nth(i).getByLabel("Acción").selectOption(action);
    await steps.nth(i).getByLabel("Selector CSS").fill(selector);
    if (value !== null) await steps.nth(i).getByLabel("Valor", { exact: true }).fill(value);
  }
  await shot(app, "61-autofill-editor", { full: true });
  await editor.getByRole("button", { name: "Guardar" }).click();
  await expect(editor).toHaveCount(0);
  await expect(section).toContainText("Rellenar #nif ← {{dni}}");
  await expect(app.getByTestId("automation-pending")).toHaveCount(0);
  await shot(app, "62-autofill-section", { full: true });

  await app.reload();
  await expect
    .poll(() => app.evaluate(() => document.documentElement.dataset.abExtension ?? ""))
    .not.toBe("");
  const form = await nextPage(context, FORM_URL, () =>
    app.getByRole("link", { name: "Abrir URL" }).click(),
  );
  await expect(form.locator("#nif")).toHaveValue("12345678Z");
  await expect(form.locator("#mirror")).toHaveText("input:12345678Z");
  await expect(form.locator("input[name=nombre]")).toHaveValue("Radia Perlman");
  await expect(form.locator("#provincia")).toHaveValue("M");
  await expect(form.locator("#acepto")).toBeChecked();
  await expect(form.locator("#tarde")).toHaveValue("llega tarde");
  await form.close();

  const viaToken = await app.request.put(
    `${BASE_URL}/api/v1/bookmarks/${bookmarkId}/automation`,
    {
      headers: { authorization: `Bearer ${plain}` },
      data: { steps: [{ action: "fill", selector: "#nif", value: "{{dni}}" }] },
    },
  );
  expect(viaToken.ok(), await viaToken.text()).toBeTruthy();
  expect((await viaToken.json()).status).toBe("pending");
  await app.reload();
  await expect(app.getByTestId("automation-pending")).toBeVisible();
  await shot(app, "63-autofill-pending");

  const untouched = await nextPage(context, FORM_URL, () =>
    app.getByRole("link", { name: "Abrir URL" }).click(),
  );
  await untouched.waitForTimeout(1500);
  await expect(untouched.locator("#nif"), "a pending automation never runs").toHaveValue("");
  await untouched.close();

  await app.getByRole("button", { name: "Aprobar" }).click();
  await expect(app.getByTestId("automation-pending")).toHaveCount(0);

  const redirectId = await createBookmark(app, REDIRECT_URL, "Salto a otro sitio");
  const saved = await app.request.put(`${BASE_URL}/api/bookmarks/${redirectId}/automation`, {
    data: { steps: [{ action: "fill", selector: "#nif", value: "{{dni}}" }] },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  await app.goto(`/bookmark/${redirectId}`);
  await expect(app.getByTestId("automation-section")).toContainText("Rellenar #nif");
  const elsewhere = await nextPage(context, ELSEWHERE_URL, () =>
    app.getByRole("link", { name: "Abrir URL" }).click(),
  );
  await elsewhere.waitForTimeout(1500);
  await expect(
    elsewhere.locator("#nif"),
    "a redirect to another origin must not receive the DNI",
  ).toHaveValue("");
  await elsewhere.close();

  await app.goto(`/bookmark/${bookmarkId}`);
  await automationBlock.getByRole("button", { name: "Editar", exact: true }).click();
  await editor.getByLabel("Cuándo").selectOption("always");
  await editor.getByRole("button", { name: "Guardar" }).click();
  await expect(editor).toHaveCount(0);
  await expect(section).toContainText("Siempre que visite esta dirección");
  const visit = await context.newPage();
  await visit.goto(`${FORM_URL}?desde=marcador-del-navegador`);
  await expect(visit.locator("#nif")).toHaveValue("12345678Z", { timeout: 15_000 });
  await visit.close();

  const captureBookmark = `${FORM_URL}/renovacion`;
  const site = await context.newPage();
  await site.goto(captureBookmark);
  await site.locator("#nif").fill("12345678Z");
  await site.locator("#provincia").selectOption("B");
  await site.locator("#acepto").check();
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 640 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await site.bringToFront();
  await popup.reload();
  await popup.locator("#capture-btn").click();
  await expect(popup.locator("#capture-status")).toContainText("3 pasos guardados");
  await shot(popup, "64-autofill-capture");
  const review = await popup.locator("#capture-review").getAttribute("href");
  expect(review).toMatch(/\/bookmark\/[0-9a-f-]{36}$/);
  const captured = await app.request.get(`${BASE_URL}/api${new URL(review!).pathname.replace("/bookmark/", "/bookmarks/")}/automation`);
  const automation = (await captured.json()).automation;
  expect(automation.status).toBe("pending");
  expect(automation.steps).toEqual([
    { action: "fill", selector: "#nif", value: "{{dni}}" },
    { action: "select", selector: "#provincia", value: "B" },
    { action: "check", selector: "#acepto", checked: true },
  ]);
});
