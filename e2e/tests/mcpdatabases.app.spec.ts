import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Tables through MCP.
 *
 * The structured half of this library lives in these tables, and until now an
 * assistant could reach every other part of the account and not them: "add a
 * row to Servidores" was the one obvious errand that had no tool.
 *
 * What this pins down beyond "the tools work" is the refusal. A password
 * column is **never** returned through MCP, by any tool, with no flag to turn
 * that off. A value that is covered on screen and kept out of public copies
 * has no business being pulled into a model's context or a transcript, and the
 * person who wants it has the app two clicks away. Writing one is allowed:
 * putting a secret in is not the same act as taking it out.
 */
function payload(body: {
  result?: { content?: Array<{ text?: string }>; isError?: boolean };
}) {
  const text = body.result?.content?.[0]?.text ?? "{}";
  return { data: JSON.parse(text), isError: body.result?.isError === true };
}

test("MCP: leer y escribir tablas, sin sacar contraseñas", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "mcp.db.e2e@example.com",
    nickname: "mcpdbuser",
    password: "AiTables26xxxxxx",
  });
  const req = page.request;

  const token = (
    await (
      await req.post("/api/extension/tokens", { data: { label: "mcp-db" } })
    ).json()
  ).token as string;

  const mcp = async (name: string, args: unknown) => {
    const res = await req.post("/api/mcp", {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return payload(await res.json());
  };

  // --- Create and read ------------------------------------------------------
  const made = await mcp("create_database", { name: "Servidores" });
  const dbId = made.data.id as string;
  expect(dbId).toBeTruthy();

  const clave = await mcp("add_database_column", {
    id: dbId,
    name: "Clave",
    kind: "password",
  });
  const claveId = clave.data.id as string;

  const detail = await mcp("get_database", { id: dbId });
  const titleCol = detail.data.columns.find(
    (c: { kind: string }) => c.kind === "text",
  );

  // --- Write, including a secret -------------------------------------------
  const added = await mcp("add_database_row", {
    id: dbId,
    cells: { [titleCol.id]: "nas.local", [claveId]: "hunter2-mcp" },
  });
  expect(added.data.id).toBeTruthy();

  // --- And the refusal ------------------------------------------------------
  const back = await mcp("get_database", { id: dbId });
  const row = back.data.rows.find(
    (r: { cells: Record<string, string> }) => r.cells[titleCol.id] === "nas.local",
  );
  expect(row).toBeTruthy();
  expect(row.cells[claveId]).toBe("[oculto]");
  expect(JSON.stringify(back.data)).not.toContain("hunter2-mcp");

  // Not through search either, which is the other way a value reaches a
  // results list.
  const found = await mcp("search_database_rows", { query: "hunter2-mcp" });
  expect(found.data).toEqual([]);
  const byName = await mcp("search_database_rows", { query: "nas.local" });
  expect(byName.data.length).toBe(1);
  expect(byName.data[0].databaseName).toBe("Servidores");

  // Nor through the CSV the tool hands back, which has no flag for it at all.
  const csv = await mcp("export_database_csv", { id: dbId });
  expect(csv.data.csv).toContain("nas.local");
  expect(csv.data.csv).not.toContain("hunter2-mcp");

  // But the app can still read it: the point is the door out, not the storage.
  const direct = await (await req.get(`/api/databases/${dbId}`)).json();
  const sameRow = direct.rows.find(
    (r: { id: string }) => r.id === added.data.id,
  );
  expect(sameRow.cells[claveId]).toBe("hunter2-mcp");

  // --- Import, and a row deleted is a row recoverable -----------------------
  const imported = await mcp("import_database_csv", {
    id: dbId,
    csv: "Título,Sitio\r\nrouter-2,armario\r\n",
  });
  expect(imported.data.rows).toBe(1);
  expect(imported.data.newColumns).toEqual(["Sitio"]);

  await mcp("delete_database_row", { id: dbId, rowId: added.data.id });
  const versions = await (
    await req.get(`/api/databases/${dbId}/rows/${added.data.id}/versions`)
  ).json();
  expect(versions.length).toBeGreaterThan(0);

  await ctx.close();
});
