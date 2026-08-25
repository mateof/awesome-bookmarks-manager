import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Columns that are worked out rather than typed: a formula, a link to another
 * table, and a summary of what that link reaches.
 *
 * None of the three stores a value, which is the decision the whole thing
 * rests on: nothing can go stale, and changing the expression changes every
 * row at once. What it costs is that they cannot be filtered or sorted on, and
 * that is stated in the model rather than half-implemented.
 *
 * The other decision worth pinning is what a **flattened copy** does with
 * them. A formula is made of columns the reader is already being shown, so the
 * copy carries its answer. A relation and its rollup reach into a *different*
 * table, which the reader of a public panel has no access to and may not even
 * be shared: those print nothing, exactly like a reference does.
 */
test("fórmula, relación y resumen enlazado", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.computed.e2e@example.com",
    nickname: "dbcomputed",
    password: "DbComputed28xxxx",
  });
  const req = page.request;

  // A table of line items, and a table of orders that points at them.
  const items = await (
    await req.post("/api/databases", { data: { name: "Líneas" } })
  ).json();
  const itemTitle = items.columns.find((c: { kind: string }) => c.kind === "text");
  const qty = await (
    await req.post(`/api/databases/${items.id}/columns`, {
      data: { kind: "number", name: "Cantidad" },
    })
  ).json();
  const price = await (
    await req.post(`/api/databases/${items.id}/columns`, {
      data: { kind: "number", name: "Precio" },
    })
  ).json();
  const total = await (
    await req.post(`/api/databases/${items.id}/columns`, {
      data: {
        kind: "formula",
        name: "Total",
        config: { formula: "[Cantidad] * [Precio]" },
      },
    })
  ).json();

  const lines = [
    { name: "Tornillos", q: 4, p: 2.5 },
    { name: "Tuercas", q: 10, p: 0.5 },
  ];
  const itemRows = items.rows.slice(0, 2);
  for (const [i, row] of itemRows.entries()) {
    await req.patch(`/api/databases/${items.id}/rows/${row.id}`, {
      data: {
        cells: {
          [itemTitle.id]: lines[i]!.name,
          [qty.id]: lines[i]!.q,
          [price.id]: lines[i]!.p,
        },
      },
    });
  }

  const orders = await (
    await req.post("/api/databases", { data: { name: "Pedidos" } })
  ).json();
  const orderTitle = orders.columns.find(
    (c: { kind: string }) => c.kind === "text",
  );
  const relation = await (
    await req.post(`/api/databases/${orders.id}/columns`, {
      data: {
        kind: "relation",
        name: "Líneas",
        config: { targetDatabaseId: items.id },
      },
    })
  ).json();
  const rollup = await (
    await req.post(`/api/databases/${orders.id}/columns`, {
      data: {
        kind: "rollup",
        name: "Unidades",
        config: {
          relationColumnId: relation.id,
          targetColumnId: qty.id,
          rollupOp: "sum",
        },
      },
    })
  ).json();
  expect(rollup.id).toBeTruthy();

  await req.patch(`/api/databases/${orders.id}/rows/${orders.rows[0].id}`, {
    data: {
      cells: {
        [orderTitle.id]: "Pedido de marzo",
        [relation.id]: itemRows.map((r: { id: string }) => r.id),
      },
    },
  });

  // --- On screen ------------------------------------------------------------
  const folder = await (
    await req.post("/api/folders", { data: { name: "Compras" } })
  ).json();
  await req.patch(`/api/folders/${folder.id}`, {
    data: {
      description:
        `<p>Pedidos</p><div data-db-id="${orders.id}" data-db-name="Pedidos" ` +
        `data-db-block="${crypto.randomUUID()}" class="ab-db-block">Pedidos</div>`,
    },
  });
  await page.goto(`/folder/${folder.id}`);
  await page.getByRole("button", { name: "Desplegar la descripción" }).click();
  const block = page.getByTestId("db-block");
  await expect(block).toBeVisible({ timeout: 20_000 });

  // The relation shows the linked rows by name, not by id: renaming one over
  // there changes what this says, which is the point of a link over a copy.
  await expect(block).toContainText("Tornillos", { timeout: 15_000 });
  // 4 + 10 units, summarised through the link.
  await expect(block).toContainText("14");

  // --- And the formula, in its own table -----------------------------------
  await page.goto(`/databases/${items.id}`);
  const itemsBlock = page.getByTestId("db-block");
  await expect(itemsBlock).toBeVisible({ timeout: 20_000 });
  // 4 × 2.5, worked out rather than stored: the API returns no cell for it.
  await expect(itemsBlock).toContainText("10");
  const stored = await (await req.get(`/api/databases/${items.id}`)).json();
  expect(stored.rows[0].cells[total.id]).toBeUndefined();

  // A formula that cannot be worked out marks that one cell and leaves the
  // rest of the grid alone.
  await req.patch(`/api/databases/${items.id}/columns/${total.id}`, {
    data: { config: { formula: "[Cantidad] * " } },
  });
  await page.reload();
  await expect(page.getByTestId("db-block")).toContainText("#error", {
    timeout: 20_000,
  });
  // The rest of the grid is untouched. Read from the input's value rather than
  // its text: a typed cell is an <input>, and its contents are not text
  // content, which is the sort of thing that makes an assertion pass for the
  // wrong reason.
  await expect(
    page.getByLabel("Título", { exact: true }).first(),
  ).toHaveValue("Tornillos");

  // --- What a public copy says about each of them --------------------------
  await req.patch(`/api/databases/${items.id}/columns/${total.id}`, {
    data: { config: { formula: "[Cantidad] * [Precio]" } },
  });
  const withItems = await (
    await req.post("/api/folders", { data: { name: "Publicado" } })
  ).json();
  await req.patch(`/api/folders/${withItems.id}`, {
    data: {
      description:
        `<div data-db-id="${items.id}" data-db-name="Líneas" ` +
        `data-db-block="${crypto.randomUUID()}" class="ab-db-block">Líneas</div>` +
        `<div data-db-id="${orders.id}" data-db-name="Pedidos" ` +
        `data-db-block="${crypto.randomUUID()}" class="ab-db-block">Pedidos</div>`,
    },
  });
  const panel = await req.post("/api/panels", {
    data: {
      title: "Compras",
      slug: "compras-computed-e2e",
      folderId: withItems.id,
      templateId: "builtin:grid",
      accessMode: "public",
    },
  });
  expect(panel.ok(), await panel.text()).toBeTruthy();

  const anon = await browser.newContext();
  const body = await (
    await anon.request.get("/api/public/panel/compras-computed-e2e")
  ).text();
  // The formula's answer travels: it is made of columns already on the page.
  expect(body).toContain("Tornillos");
  expect(body).toContain("10");
  // The names of the linked rows do not: the reader has no access to that
  // table and may not be meant to.
  const pedidos = body.slice(body.indexOf("Pedidos"));
  expect(pedidos).not.toContain("Tuercas");
  await anon.close();

  await ctx.close();
});
