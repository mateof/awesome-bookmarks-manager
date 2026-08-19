import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * "Copiar lista": the selection as a hierarchical list on the clipboard, with
 * the bookmarks of every subfolder expanded, for pasting into a chat or an
 * email.
 *
 * Markdown in text/plain and a nested <ul> of anchors in text/html, the same
 * pair the single-link copy uses. What matters beyond the shape is that
 * selecting a folder *and* something inside it does not produce it twice.
 */
const user = {
  email: "copy.outline.e2e@example.com",
  nickname: "copyoutline",
  password: "HierarchicalList26x",
};

test("copiar la selección como lista jerárquica", async ({ browser }) => {
  const ctx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  // Cocina > (Postres > Tarta), Pan.  Plus a loose bookmark at the root.
  const cocina = await (
    await req.post("/api/folders", { data: { name: "Cocina" } })
  ).json();
  const postres = await (
    await req.post("/api/folders", { data: { name: "Postres", parentId: cocina.id } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://tarta.example/",
      title: "Tarta de queso",
      folderId: postres.id,
      fetchSnapshot: false,
    },
  });
  await req.post("/api/bookmarks", {
    data: {
      url: "https://pan.example/",
      title: "Pan de masa madre",
      folderId: cocina.id,
      fetchSnapshot: false,
    },
  });
  await req.post("/api/bookmarks", {
    data: { url: "https://suelto.example/", title: "Suelto", fetchSnapshot: false },
  });

  await page.goto("/");
  // "Cocina" is also in the sidebar tree, so anchor on the card's checkbox.
  await expect(page.getByRole("checkbox", { name: /Cocina/ })).toBeVisible();
  // The clipboard is shared across browser contexts: park a sentinel so a copy
  // that never ran cannot pass on whatever the previous test left there.
  await page.evaluate(() => navigator.clipboard.writeText("sentinel"));

  // Select the folder and the loose bookmark.
  await page.getByRole("checkbox", { name: /Cocina/ }).check();
  await page.getByRole("checkbox", { name: /Suelto/ }).check();

  await page.getByRole("button", { name: "Copiar lista" }).click();
  await expect(page.getByRole("button", { name: "Copiado" })).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(
    [
      "- **Cocina**",
      "  - **Postres**",
      "    - [Tarta de queso](https://tarta.example/)",
      "  - [Pan de masa madre](https://pan.example/)",
      "- [Suelto](https://suelto.example/)",
    ].join("\n"),
  );
});

test("copiar lista: una carpeta y algo de dentro no se duplica", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "copy.outline.dedup.e2e@example.com",
    nickname: "copyoutlinededup",
    password: "NoDuplicateLines26x",
  });
  const req = page.request;

  const viajes = await (
    await req.post("/api/folders", { data: { name: "Viajes" } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://roma.example/",
      title: "Roma",
      folderId: viajes.id,
      fetchSnapshot: false,
    },
  });

  // Select the folder, then go in and also select the bookmark inside it.
  await page.goto("/");
  await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
  await page.getByRole("checkbox", { name: /Viajes/ }).check();
  await page.getByRole("button", { name: "Copiar lista" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("- **Viajes**\n  - [Roma](https://roma.example/)");

  // The same bookmark selected on its own is a top-level entry. Park a
  // sentinel first so a copy that never happened cannot pass by leaving the
  // previous clipboard contents in place.
  await page.goto(`/folder/${viajes.id}`);
  await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
  await page.getByRole("checkbox", { name: /Roma/ }).check();
  await page.getByRole("button", { name: "Copiar lista" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("- [Roma](https://roma.example/)");
});
