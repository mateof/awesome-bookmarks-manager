import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The PWA share target. Android's share sheet navigates the installed app to
 * `/share-target?...` (declared in manifest.webmanifest), so what matters here
 * is that the route handles the shapes real apps send: a clean `url` param,
 * and everything crammed into `text`.
 */
const user = {
  email: "share.target.e2e@example.com",
  nickname: "sharetargetuser",
  password: "SharedFromPhone26",
};

test("guardar un enlace llegado desde el menú de compartir", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const inbox = await (
    await req.post("/api/folders", { data: { name: "Entrada" } })
  ).json();

  // Chrome's shape: an explicit url plus the page title.
  await page.goto(
    `/share-target?url=${encodeURIComponent("https://compartido.example/articulo")}&title=${encodeURIComponent("Un articulo compartido")}`,
  );
  await expect(page.getByRole("heading", { name: "Guardar enlace" })).toBeVisible();

  const urlField = page.getByRole("textbox", { name: "URL" });
  await expect(urlField).toHaveValue("https://compartido.example/articulo");
  await expect(page.getByRole("textbox", { name: "Título", exact: true })).toHaveValue(
    "Un articulo compartido",
  );

  // The folder is chosen in a dialog now, not a `<select>`: see
  // `pickers.app.spec.ts` for the tree and the search inside it.
  await page.getByRole("button", { name: "Carpeta" }).click();
  await page
    .getByTestId("folder-picker")
    // Exact: the row also has a "Nueva carpeta dentro de Entrada" button next
    // to it, and a loose match would find the name in that label as well.
    .getByRole("button", { name: "Entrada", exact: true })
    .click();
  await page.getByRole("button", { name: "Guardar bookmark" }).click();
  await expect(page.getByRole("heading", { name: "Guardado" })).toBeVisible();

  await page.getByRole("link", { name: "Ver la carpeta" }).click();
  await expect(page).toHaveURL(new RegExp(`/folder/${inbox.id}`));
  await expect(page.getByText("Un articulo compartido", { exact: true })).toBeVisible();

  // The other common shape: no url param, the link buried inside `text`.
  await page.goto(
    `/share-target?text=${encodeURIComponent("Mira esto https://desdetexto.example/pagina")}`,
  );
  await expect(page.getByRole("textbox", { name: "URL" })).toHaveValue(
    "https://desdetexto.example/pagina",
  );
  await expect(page.getByRole("textbox", { name: "Título", exact: true })).toHaveValue(
    "Mira esto",
  );

  // The folder chosen last time is remembered: sharing repeatedly into the
  // same inbox is the common case.
  // Read off the button, which now spells the folder out by name instead of
  // holding its id.
  await expect(page.getByRole("button", { name: "Carpeta" })).toContainText(
    "Entrada",
  );
  await page.getByRole("button", { name: "Guardar bookmark" }).click();
  await expect(page.getByRole("heading", { name: "Guardado" })).toBeVisible();

  const saved = await (await req.get("/api/bookmarks")).json();
  const found = saved.find(
    (b: { url: string }) => b.url === "https://desdetexto.example/pagina",
  );
  expect(found).toBeTruthy();
  expect(found.folderId).toBe(inbox.id);
});

test("el manifest declara la app como destino de compartir", async ({
  request,
}) => {
  // Without this the OS never offers the app in the share sheet, so it is
  // worth asserting rather than trusting the file to stay put.
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.share_target.action).toBe("/share-target");
  expect(manifest.share_target.params.url).toBe("url");
  expect(manifest.display).toBe("standalone");
  // Chrome requires raster icons at these sizes before it will install.
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  for (const icon of manifest.icons) {
    const asset = await request.get(icon.src);
    expect(asset.ok(), `${icon.src} should be served`).toBeTruthy();
  }
  expect((await request.get("/sw.js")).ok()).toBeTruthy();
});
