import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The tree layouts (tree / mindmap / orbit).
 *
 * What separates them from the panel's other templates is that they render the
 * *whole* subtree and open it in place: no navigation, no page change. So what
 * matters is that a level which is not open is genuinely not reachable yet,
 * that pointing at its parent reveals it, and that a device without hover can
 * still get at it by tapping.
 */
const owner = {
  email: "panel.tree.e2e@example.com",
  nickname: "paneltree",
  password: "UnfoldingPanels26x",
};

async function seedTree(req: import("@playwright/test").APIRequestContext) {
  const root = await (
    await req.post("/api/folders", { data: { name: "Recursos" } })
  ).json();
  const frontend = await (
    await req.post("/api/folders", { data: { name: "Frontend", parentId: root.id } })
  ).json();
  const react = await (
    await req.post("/api/folders", { data: { name: "React", parentId: frontend.id } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://react.example/hooks",
      title: "Hooks al detalle",
      folderId: react.id,
      fetchSnapshot: false,
    },
  });
  await req.post("/api/folders", { data: { name: "Backend", parentId: root.id } });
  return root.id as string;
}

test("panel en árbol: un nivel se abre al pasar el ratón, sin cambiar de página", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, owner);
  const folderId = await seedTree(page.request);

  await page.request.post("/api/panels", {
    data: {
      title: "Árbol",
      slug: "arbol-e2e",
      folderId,
      accessMode: "public",
      templateId: "builtin:tree",
    },
  });

  await page.goto("/panel/arbol-e2e");
  await expect(page.getByRole("button", { name: /Frontend/ })).toBeVisible();

  // Closed: the subtree stays mounted so its height can be animated, but it
  // is `inert`, so it is out of the tab order, out of the accessibility tree
  // and out of find-in-page. That is what "closed" has to mean here.
  await expect(page.getByText("Hooks al detalle")).toHaveCount(1);
  await expect(
    page.getByText("Hooks al detalle").locator("xpath=ancestor::*[@inert][1]"),
  ).toHaveCount(1);

  // Hover opens one level, hovering the child opens the next, and the URL
  // never changes: that is the difference from the browsing layouts.
  const url = page.url();
  await page.getByRole("button", { name: /Frontend/ }).hover();
  await expect(page.getByRole("button", { name: /React/ })).toBeVisible();
  await page.getByRole("button", { name: /React/ }).hover();
  await expect(
    page.getByText("Hooks al detalle").locator("xpath=ancestor::*[@inert][1]"),
  ).toHaveCount(0);
  expect(page.url()).toBe(url);

  // The parent stays open while the pointer is on the child, or the branch
  // would collapse under the cursor on its way down.
  await expect(page.getByRole("button", { name: /Frontend/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("panel en árbol: sin hover (móvil) se abre tocando", async ({ browser }) => {
  // A phone reports no hover, so the same nodes have to open on tap and close
  // on a second one, or the layout is unusable on the device it looks best on.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 840 },
    hasTouch: true,
    isMobile: true,
  });
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.tree.touch.e2e@example.com",
    nickname: "paneltreetouch",
    password: "TapToUnfold26xxxx",
  });
  const folderId = await seedTree(page.request);
  await page.request.post("/api/panels", {
    data: {
      title: "Árbol táctil",
      slug: "arbol-tactil-e2e",
      folderId,
      accessMode: "public",
      templateId: "builtin:tree",
    },
  });

  await page.goto("/panel/arbol-tactil-e2e");
  const frontend = page.getByRole("button", { name: /Frontend/ });
  await expect(frontend).toHaveAttribute("aria-expanded", "false");

  await frontend.tap();
  await expect(frontend).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /React/ })).toBeVisible();

  // A second tap closes it again, which is the only way back on a device with
  // no pointer to move away.
  await frontend.tap();
  await expect(frontend).toHaveAttribute("aria-expanded", "false");
});

test("panel mapa mental: arranca con la primera rama abierta", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.mindmap.e2e@example.com",
    nickname: "panelmindmap",
    password: "BranchesAcross26xx",
  });
  const folderId = await seedTree(page.request);
  await page.request.post("/api/panels", {
    data: {
      title: "Mapa",
      slug: "mapa-e2e",
      folderId,
      accessMode: "public",
      templateId: "builtin:mindmap",
    },
  });

  await page.goto("/panel/mapa-e2e");
  // A single column at the left edge would not read as a map, so the first
  // branch is open from the start: its child is on screen without touching
  // anything.
  await expect(page.getByRole("button", { name: /React/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Frontend/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("panel órbita: cada carpeta es un nodo del anillo y muestra su contenido", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.orbit.e2e@example.com",
    nickname: "panelorbit",
    password: "RingOfFolders26xx",
  });
  const folderId = await seedTree(page.request);
  await page.request.post("/api/panels", {
    data: {
      title: "Órbita",
      slug: "orbita-e2e",
      folderId,
      accessMode: "public",
      templateId: "builtin:orbit",
    },
  });

  await page.goto("/panel/orbita-e2e");
  await expect(page.getByRole("button", { name: /Frontend/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Backend/ })).toBeVisible();
  // At rest it says what to do rather than offering to enter the level you
  // are already standing on.
  await expect(page.getByText(/Pasa el ratón por una órbita/)).toBeVisible();

  await page.getByRole("button", { name: /Frontend/ }).hover();
  await expect(page.getByRole("button", { name: /Entrar \(1\)/ })).toBeVisible();
});

test("panel en árbol: buscar una carpeta la abre en su rama, sin salir de la página", async ({
  browser,
}) => {
  // The search box writes the folder's path to `?p=`, which is how the
  // browsing layouts navigate. These do not navigate, so they read it as
  // "unfold to this folder" instead; before that they ignored it and clicking
  // a search result did nothing at all.
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.tree.search.e2e@example.com",
    nickname: "paneltreesearch",
    password: "SearchUnfolds26xxx",
  });
  const folderId = await seedTree(page.request);
  await page.request.post("/api/panels", {
    data: {
      title: "Árbol buscado",
      slug: "arbol-buscar-e2e",
      folderId,
      accessMode: "public",
      templateId: "builtin:tree",
    },
  });

  await page.goto("/panel/arbol-buscar-e2e");
  // "React" is two levels down and its branch is closed.
  await expect(page.getByRole("button", { name: /Frontend/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await page.getByRole("button", { name: /Buscar en el panel/ }).click();
  await page.getByPlaceholder("Buscar en el panel…").fill("React");
  await page.getByRole("button", { name: /React/ }).first().click();

  // The whole trail is open and the page never changed: the layout unfolded.
  await expect(page.getByRole("button", { name: /Frontend/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("button", { name: /React/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByText("Hooks al detalle")).toBeVisible();
});

test("panel órbita: buscar una carpeta centra el anillo que la contiene", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "panel.orbit.search.e2e@example.com",
    nickname: "panelorbitsearch",
    password: "RingFollowsSearch26",
  });
  const folderId = await seedTree(page.request);
  await page.request.post("/api/panels", {
    data: {
      title: "Órbita buscada",
      slug: "orbita-buscar-e2e",
      folderId,
      accessMode: "public",
      templateId: "builtin:orbit",
    },
  });

  await page.goto("/panel/orbita-buscar-e2e");
  // At the root ring, "React" is not on it: it lives one level in.
  await expect(page.getByRole("button", { name: /^React/ })).toHaveCount(0);

  await page.getByRole("button", { name: /Buscar en el panel/ }).click();
  await page.getByPlaceholder("Buscar en el panel…").fill("React");
  await page.getByRole("button", { name: /React/ }).first().click();

  // A ring shows one level, so the answer is to stand on the parent: React is
  // now a node on the ring, with Frontend at the centre.
  await expect(page.getByRole("button", { name: /^React/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Frontend/ })).toBeVisible();
});
