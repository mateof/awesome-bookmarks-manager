import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Copy duplicates a folder (with its whole subtree) or a single bookmark into a
 * chosen destination, leaving the original untouched.
 */
const user = {
  email: "florence.nightingale@example.com",
  nickname: "florencen",
  password: "StatisticsNursing1854",
};

test("copiar carpeta con hijos y copiar un bookmark", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  // Origen > (Sub, bookmark Enlace).
  const origen = await (
    await req.post("/api/folders", { data: { name: "Origen" } })
  ).json();
  await req.post("/api/folders", { data: { name: "Sub", parentId: origen.id } });
  await req.post("/api/bookmarks", {
    data: {
      url: "https://ref.example/",
      title: "Enlace",
      folderId: origen.id,
      fetchSnapshot: false,
    },
  });

  // Copy the whole folder to the root.
  const copied = await (
    await req.post(`/api/folders/${origen.id}/copy`, { data: { parentId: null } })
  ).json();
  expect(copied.type).toBe("folder");
  expect(copied.id).not.toBe(origen.id);

  const folders: Array<{ id: string; name: string; parentId: string | null }> =
    await (await req.get("/api/folders")).json();
  // Two "Origen" folders now (original + copy), each with its own "Sub".
  expect(folders.filter((f) => f.name === "Origen").length).toBe(2);
  const copyRoot = folders.find((f) => f.id === copied.id)!;
  expect(folders.some((f) => f.name === "Sub" && f.parentId === copyRoot.id)).toBe(
    true,
  );
  // Original subtree is intact.
  expect(folders.some((f) => f.name === "Sub" && f.parentId === origen.id)).toBe(
    true,
  );

  const bms: Array<{ title: string; folderId: string | null }> = await (
    await req.get("/api/bookmarks")
  ).json();
  expect(
    bms.some((b) => b.title === "Enlace" && b.folderId === copyRoot.id),
  ).toBe(true);
  expect(
    bms.some((b) => b.title === "Enlace" && b.folderId === origen.id),
  ).toBe(true);

  // Copy a single bookmark into a destination folder.
  const dest = await (
    await req.post("/api/folders", { data: { name: "Destino" } })
  ).json();
  const soloBm = await (
    await req.post("/api/bookmarks", {
      data: { url: "https://solo.example/", title: "Solo", fetchSnapshot: false },
    })
  ).json();
  const bmCopy = await (
    await req.post(`/api/bookmarks/${soloBm.id}/copy`, {
      data: { folderId: dest.id },
    })
  ).json();
  expect(bmCopy.type).toBe("bookmark");
  expect(bmCopy.id).not.toBe(soloBm.id);

  const bms2: Array<{ id: string; title: string; folderId: string | null }> =
    await (await req.get("/api/bookmarks")).json();
  expect(
    bms2.some((b) => b.title === "Solo" && b.folderId === dest.id),
  ).toBe(true);
  expect(
    bms2.some((b) => b.title === "Solo" && b.folderId === null),
  ).toBe(true);
});
