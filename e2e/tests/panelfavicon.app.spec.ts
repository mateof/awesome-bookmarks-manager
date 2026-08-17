import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A panel's tab icon can be an emoji picked from a list, or an uploaded image.
 * They are alternatives: setting one clears the other, on the server too.
 */
const user = {
  email: "panel.favicon.e2e@example.com",
  nickname: "panelfavicon",
  password: "TabIconChooser24x",
};

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("panel: icono de pestaña por emoji o por imagen", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const folder = await (
    await req.post("/api/folders", { data: { name: "IconRoot" } })
  ).json();
  const panel = await (
    await req.post("/api/panels", {
      data: { title: "IconPanel", slug: "iconpanel", folderId: folder.id, accessMode: "public" },
    })
  ).json();

  await page.goto("/panels");
  await page.getByRole("button", { name: "Editar" }).first().click();
  await page.getByText("Título, pestaña e icono").click();

  // Emoji mode: pick one from the list instead of typing it.
  await page.getByRole("button", { name: "Elegir" }).click();
  await page.getByPlaceholder("Buscar emoji…").fill("cohete");
  await page.getByRole("button", { name: "🚀" }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: "Editar panel" })).toBeHidden();

  let detail = await (await req.get(`/api/panels/${panel.id}`)).json();
  expect(detail.faviconEmoji).toBe("🚀");
  expect(detail.faviconKind).toBe("emoji");

  // Uploading an image replaces the emoji.
  const up = await req.post(`/api/panels/${panel.id}/favicon`, {
    multipart: { file: { name: "f.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(up.ok(), await up.text()).toBeTruthy();
  detail = await (await req.get(`/api/panels/${panel.id}`)).json();
  expect(detail.faviconKind).toBe("image");
  expect(detail.faviconEmoji).toBeNull();

  // The public panel advertises it and serves it.
  const pub = await (await req.get("/api/public/panel/iconpanel")).json();
  expect(pub.faviconKind).toBe("image");
  const icon = await req.get("/api/public/panel/iconpanel/favicon");
  expect(icon.ok()).toBeTruthy();
  expect(icon.headers()["content-type"]).toContain("image/png");

  // The dialog opens in image mode and can switch back to emoji, which drops it.
  await page.reload();
  await page.getByRole("button", { name: "Editar" }).first().click();
  await page.getByText("Título, pestaña e icono").click();
  await expect(page.getByRole("button", { name: "Imagen", exact: true })).toHaveAttribute(
    "class",
    /bg-slate-900|bg-slate-100/,
  );
  await page.getByRole("button", { name: "Emoji", exact: true }).click();
  await expect(async () => {
    const d = await (await req.get(`/api/panels/${panel.id}`)).json();
    expect(d.faviconKind).toBeNull();
  }).toPass({ timeout: 10_000 });
  const gone = await req.get("/api/public/panel/iconpanel/favicon");
  expect(gone.status()).toBe(404);
});
