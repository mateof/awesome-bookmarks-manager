import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * A table in and out of a spreadsheet.
 *
 * Import is how a table gets a hundred rows without typing them; export is the
 * door out of a self-hosted tool, which is most of what "self-hosted" is for.
 *
 * The edge in both directions is the password column. On the way out it stays
 * empty unless the export explicitly asks for it, because a CSV on disk is the
 * one copy that cannot be un-shared. On the way in there is nothing special
 * about it: putting a secret into your own table is not the same act as taking
 * one out of it.
 */
test("exportar e importar CSV", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "db.csv.e2e@example.com",
    nickname: "dbcsv",
    password: "DbCsv28xxxxxxxxx",
  });
  const req = page.request;

  const db = await (
    await req.post("/api/databases", { data: { name: "Inventario" } })
  ).json();
  const clave = await (
    await req.post(`/api/databases/${db.id}/columns`, {
      data: { kind: "password", name: "Clave" },
    })
  ).json();
  const full = await (await req.get(`/api/databases/${db.id}`)).json();
  const title = full.columns.find((c: { kind: string }) => c.kind === "text");
  const estado = full.columns.find((c: { kind: string }) => c.kind === "select");
  await req.patch(`/api/databases/${db.id}/rows/${full.rows[0].id}`, {
    data: {
      cells: {
        [title.id]: 'Disco "grande", 8 TB',
        [estado.id]: estado.config.options[0].id,
        [clave.id]: "clave-que-no-sale",
      },
    },
  });

  // --- Out -----------------------------------------------------------------
  const csv = await (
    await req.get(`/api/databases/${db.id}/export.csv`)
  ).text();
  expect(csv).toContain("Título,Estado,Clave");
  // The quote inside the value is doubled, not dropped, or the file reads as
  // three columns from that line onwards.
  expect(csv).toContain('"Disco ""grande"", 8 TB"');
  // The select is exported by name: an option id means nothing in a
  // spreadsheet and would not survive the trip back.
  expect(csv).toContain("Pendiente");
  expect(csv).not.toContain("clave-que-no-sale");

  // Asked for explicitly, it comes out. That is the whole difference.
  const withSecrets = await (
    await req.get(`/api/databases/${db.id}/export.csv?secrets=1`)
  ).text();
  expect(withSecrets).toContain("clave-que-no-sale");

  // --- And back in ---------------------------------------------------------
  const imported = await (
    await req.post(`/api/databases/${db.id}/import.csv`, {
      data: {
        csv:
          "Título,Estado,Notas\r\n" +
          "Cabina nueva,Hecho,con coma\r\n" +
          '"Cabina, vieja",Retirado,"dos\nlineas"\r\n',
      },
    })
  ).json();
  expect(imported.rows).toBe(2);
  // "Notas" was not a column and "Retirado" was not an option: both are made
  // rather than dropped, because losing part of a file somebody chose to
  // import is worse than a table with one more column than it needed.
  expect(imported.newColumns).toEqual(["Notas"]);
  expect(imported.newOptions).toEqual(["Retirado"]);

  const after = await (await req.get(`/api/databases/${db.id}`)).json();
  expect(after.rows.length).toBe(full.rows.length + 2);
  const notas = after.columns.find((c: { name: string }) => c.name === "Notas");
  const two = after.rows.find(
    (r: { cells: Record<string, unknown> }) =>
      r.cells[notas.id] === "dos\nlineas",
  );
  expect(two).toBeTruthy();
  expect(two.cells[title.id]).toBe("Cabina, vieja");

  // The existing option was matched by name rather than duplicated.
  const estadoAfter = after.columns.find(
    (c: { kind: string }) => c.kind === "select",
  );
  expect(
    estadoAfter.config.options.filter(
      (o: { name: string }) => o.name === "Hecho",
    ).length,
  ).toBe(1);

  await ctx.close();
});
