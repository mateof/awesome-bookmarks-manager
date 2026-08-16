import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Symlinks: a folder can gather links to items that live elsewhere. Reads
 * resolve to the original, so renaming the real one updates every link, and a
 * panel built from the gathering folder shows the linked content.
 */
const user = {
  email: "aliases.e2e@example.com",
  nickname: "aliasesuser",
  password: "SymbolicLinks2024x",
};

test("enlaces simbólicos: reflejan el original y llegan a los paneles", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  // Real content living in "Origen"; "Panel" is the gathering folder.
  const origen = await (
    await req.post("/api/folders", { data: { name: "Origen" } })
  ).json();
  const real = await (
    await req.post("/api/folders", { data: { name: "Real", parentId: origen.id } })
  ).json();
  await req.post("/api/bookmarks", {
    data: { url: "https://dentro.example/", title: "Dentro", folderId: real.id, fetchSnapshot: false },
  });
  const suelto = await (
    await req.post("/api/bookmarks", {
      data: { url: "https://suelto.example/", title: "Suelto", folderId: origen.id, fetchSnapshot: false },
    })
  ).json();
  const destino = await (
    await req.post("/api/folders", { data: { name: "Destino" } })
  ).json();

  // Link both the folder and the bookmark into "Destino".
  const linkF = await req.post("/api/aliases", {
    data: { targetType: "folder", targetId: real.id, parentId: destino.id },
  });
  expect(linkF.ok(), await linkF.text()).toBeTruthy();
  const aliasFolder = await linkF.json();
  expect(aliasFolder.aliasOf).toBe(real.id);

  const linkB = await req.post("/api/aliases", {
    data: { targetType: "bookmark", targetId: suelto.id, parentId: destino.id },
  });
  expect(linkB.ok(), await linkB.text()).toBeTruthy();

  // The link shows the original's name.
  const folders = await (await req.get("/api/folders")).json();
  const alias = folders.find((f: { id: string }) => f.id === aliasFolder.id);
  expect(alias.name).toBe("Real");

  // Renaming the original updates the link (that is the whole point).
  await req.patch(`/api/folders/${real.id}`, { data: { name: "Renombrada" } });
  const after = await (await req.get("/api/folders")).json();
  expect(after.find((f: { id: string }) => f.id === aliasFolder.id).name).toBe(
    "Renombrada",
  );

  // A panel built from "Destino" contains the linked subtree, live.
  await req.post("/api/panels", {
    data: { title: "PanelLinks", slug: "panellinks", folderId: destino.id, accessMode: "public" },
  });
  await expect(async () => {
    await page.goto("/panel/panellinks");
    await expect(page.getByText("Suelto", { exact: true })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Renombrada/ })).toBeVisible();

  // Opening the linked folder in the panel shows the original's content.
  await page.getByRole("button", { name: /Renombrada/ }).click();
  await expect(page.getByText("Dentro", { exact: true })).toBeVisible();

  // A link cannot be created inside its own target (would recurse for ever).
  const cycle = await req.post("/api/aliases", {
    data: { targetType: "folder", targetId: origen.id, parentId: real.id },
  });
  expect(cycle.status()).toBe(400);

  // Deleting the link leaves the original untouched.
  await req.delete(`/api/folders/${aliasFolder.id}`);
  const stillThere = await (await req.get("/api/folders")).json();
  expect(stillThere.some((f: { id: string }) => f.id === real.id)).toBe(true);
});
