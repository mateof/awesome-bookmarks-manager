import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Descriptions inside a panel.
 *
 * A folder or bookmark with text gets an icon that opens it in a modal, and
 * the modal has to behave like the editor's own view: click-to-copy copies,
 * and a hidden fragment reveals on the first click and copies on the second.
 *
 * It did not before: the panel sanitised the HTML without keeping the marks'
 * data attributes, so they arrived as plain text with no behaviour at all —
 * and folders had no icon in the first place.
 */
const user = {
  email: "panel.desc.e2e@example.com",
  nickname: "paneldesc",
  password: "TextInsidePanels26x",
};

const FOLDER_HTML =
  "<p>Notas de la carpeta con un " +
  '<span data-copyable="true" class="ab-copyable">CODIGO-COPIABLE</span>' +
  " dentro.</p>";
const BOOKMARK_HTML =
  "<p>Acceso: " +
  '<span data-spoiler="true" class="ab-spoiler">SECRETO-OCULTO</span>' +
  "</p>";

test("panel: el texto de carpetas y bookmarks se abre en modal, con copiar y ocultar", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const root = await (
    await req.post("/api/folders", { data: { name: "Panel" } })
  ).json();
  await req.post("/api/folders", {
    data: { name: "Con texto", parentId: root.id, description: FOLDER_HTML },
  });
  await req.post("/api/folders", { data: { name: "Sin texto", parentId: root.id } });
  await req.post("/api/bookmarks", {
    data: {
      url: "https://conclave.example/",
      title: "Con clave",
      folderId: root.id,
      description: BOOKMARK_HTML,
      fetchSnapshot: false,
    },
  });

  await req.post("/api/panels", {
    data: {
      title: "Texto",
      slug: "texto-e2e",
      folderId: root.id,
      accessMode: "public",
      templateId: "builtin:grid",
    },
  });
  await page.goto("/panel/texto-e2e");

  // The icon appears only where there is text: an empty description must not
  // buy an icon that opens an empty modal.
  await expect(page.getByLabel("Ver el texto de Con texto")).toBeVisible();
  await expect(page.getByLabel("Ver el texto de Sin texto")).toHaveCount(0);

  // A folder's text, which had no way of being seen in a panel at all.
  await page.getByLabel("Ver el texto de Con texto").click();
  await expect(page.getByRole("heading", { name: "Con texto" })).toBeVisible();

  await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
  await page.getByText("CODIGO-COPIABLE").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("CODIGO-COPIABLE");

  await page.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByRole("heading", { name: "Con texto" })).toHaveCount(0);

  // The bookmark's, with the hidden-until-clicked mark.
  await page.getByLabel("Ver el texto de Con clave").click();
  const spoiler = page.locator(".ab-spoiler");
  await expect(spoiler).toBeVisible();
  await expect(spoiler).not.toHaveAttribute("data-revealed", "true");

  // First click reveals but does not copy: copying something you have not
  // read yet would be a surprise.
  await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
  await spoiler.click();
  await expect(spoiler).toHaveAttribute("data-revealed", "true");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("sentinel");

  // Second click copies.
  await spoiler.click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("SECRETO-OCULTO");
});

test("panel en árbol: el icono de texto también está en las ramas", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.desc.tree.e2e@example.com",
    nickname: "paneldesctree",
    password: "TextInTreeNodes26x",
  });
  const req = page.request;

  const root = await (
    await req.post("/api/folders", { data: { name: "Raíz" } })
  ).json();
  await req.post("/api/folders", {
    data: { name: "Rama", parentId: root.id, description: FOLDER_HTML },
  });
  await req.post("/api/panels", {
    data: {
      title: "Árbol texto",
      slug: "arbol-texto-e2e",
      folderId: root.id,
      accessMode: "public",
      templateId: "builtin:tree",
    },
  });

  await page.goto("/panel/arbol-texto-e2e");
  await page.getByLabel("Ver el texto de Rama").click();
  await expect(page.getByText("CODIGO-COPIABLE")).toBeVisible();
});

test("panel: la ventana es opaca aunque la plantilla sea translúcida", async ({
  browser,
}) => {
  // Several templates make `surface` translucent, which is right for a card
  // sitting over the background scene and wrong for a modal: whatever is
  // behind shows through the text. The tree template is the extreme case at 4%
  // opaque, so it is the one worth asserting on.
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.desc.opaque.e2e@example.com",
    nickname: "paneldescopaque",
    password: "OpaqueModalPanel26x",
  });
  const req = page.request;

  const root = await (
    await req.post("/api/folders", { data: { name: "Opaca" } })
  ).json();
  await req.post("/api/folders", {
    data: { name: "Con notas", parentId: root.id, description: FOLDER_HTML },
  });
  await req.post("/api/panels", {
    data: {
      title: "Opaca",
      slug: "opaca-e2e",
      folderId: root.id,
      accessMode: "public",
      templateId: "builtin:tree",
    },
  });

  await page.goto("/panel/opaca-e2e");
  await page.getByLabel("Ver el texto de Con notas").click();
  await expect(page.getByText("CODIGO-COPIABLE")).toBeVisible();

  // The card in the panel keeps its translucency; the modal does not.
  const cardBg = await page
    .getByRole("button", { name: /^Con notas/ })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  // Still an rgba with an alpha below 1: a card is meant to let the panel's
  // background through.
  expect(cardBg).toMatch(/^rgba\(/);

  const modalBg = await page
    .getByTestId("panel-modal")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  // `rgb(...)` without an alpha channel is the whole point: anything with one
  // lets the panel show through the text.
  expect(modalBg).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
});
