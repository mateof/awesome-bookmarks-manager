import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CellValueSchema, type CellValue, type DbColumn } from "@awesome-bookmarks/shared";
import { z } from "zod";
import type { AuthedContext } from "../auth/session.js";
import { exportCsv, importCsv } from "../databases/csv.js";
import {
  addColumn,
  addRow,
  createDatabase,
  deleteRow,
  getDatabase,
  listDatabases,
  searchRows,
  updateRow,
} from "../databases/service.js";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Inline databases, for an assistant.
 *
 * The tables are where the structured half of this library lives: inventories,
 * credentials, reading logs. Everything else was reachable from here already,
 * so "add a row to Servidores" was the one obvious errand that could not be
 * asked for.
 *
 * **Password columns are never returned.** Not masked-but-available behind a
 * flag: not returned, in any tool, ever. A value that is covered on screen and
 * kept out of public copies has no business being pulled into a model's
 * context, a transcript or a log, and the person who wants it has the app two
 * clicks away. Writing one is allowed, because putting a secret in is not the
 * same act as taking it out.
 */
export function registerDatabaseTools(server: McpServer, ctx: AuthedContext) {
  const strip = (columns: DbColumn[], cells: Record<string, CellValue>) => {
    const out: Record<string, CellValue> = { ...cells };
    for (const c of columns) {
      if (c.kind === "password" && out[c.id] !== undefined) out[c.id] = "[oculto]";
    }
    return out;
  };

  server.tool(
    "list_databases",
    "List the caller's inline databases (typed tables embedded in folder and bookmark descriptions): id, name, row count, and whether it is shared with a group.",
    {},
    async () => ok(listDatabases(ctx)),
  );

  server.tool(
    "get_database",
    "Read one database whole: its columns (id, name, kind, select options) and every row keyed by column id. Values of 'password' columns come back as '[oculto]' and cannot be read through MCP at all.",
    { id: z.string().uuid() },
    async (args) => {
      const db = getDatabase(ctx, args.id);
      return ok({
        ...db,
        rows: db.rows.map((r) => ({ ...r, cells: strip(db.columns, r.cells) })),
      });
    },
  );

  server.tool(
    "search_database_rows",
    "Find text inside the rows of every table the caller can read. Returns the table, the row and a snippet of the cell that matched. Password columns are not searched.",
    { query: z.string().min(1).max(200), limit: z.number().int().min(1).max(30).default(10) },
    async (args) => ok(searchRows(ctx, args.query, args.limit)),
  );

  server.tool(
    "create_database",
    "Create a new inline database. It starts with a text column, a status select and a table view, ready to be filled. To make it appear inside a note, the block has to be inserted from the app's editor.",
    { name: z.string().min(1).max(120) },
    async (args) => ok(createDatabase(ctx, args.name)),
  );

  server.tool(
    "add_database_column",
    "Add a column to a database. 'kind' is one of text, number, checkbox, date, select, multiSelect, url, ref, password. For select and multiSelect, pass the option names in 'options' and each gets a colour of its own.",
    {
      id: z.string().uuid(),
      name: z.string().min(1).max(120),
      kind: z.enum([
        "text",
        "number",
        "checkbox",
        "date",
        "select",
        "multiSelect",
        "url",
        "ref",
        "password",
      ]),
      options: z.array(z.string().min(1).max(60)).max(60).optional(),
    },
    async (args) => {
      const options = (args.options ?? []).map((name, i) => ({
        id: `${Date.now().toString(36)}-${i}`,
        name,
        // Spread around the palette rather than random here: this runs
        // server-side in a loop, and two options of a fresh column looking the
        // same is exactly what the colour is for.
        color: OPTION_CYCLE[i % OPTION_CYCLE.length]!,
      }));
      return ok(
        addColumn(ctx, args.id, {
          kind: args.kind,
          name: args.name,
          config: options.length ? { options } : {},
        }),
      );
    },
  );

  server.tool(
    "add_database_row",
    "Append a row. 'cells' is keyed by **column id** (from get_database), not by column name: a select cell takes the option's id, a multiSelect an array of them, a checkbox true/false, a date an ISO 'YYYY-MM-DD' string.",
    {
      id: z.string().uuid(),
      cells: z.record(z.string(), CellValueSchema).default({}),
    },
    async (args) => ok(addRow(ctx, args.id, { cells: args.cells })),
  );

  server.tool(
    "update_database_row",
    "Change cells of one row. Merged, not replaced: only the columns named are touched, and sending null or an empty string clears one. The row's previous state is kept in its history, so this is undoable from the app.",
    {
      id: z.string().uuid(),
      rowId: z.string().uuid(),
      cells: z.record(z.string(), CellValueSchema),
    },
    async (args) => {
      const db = getDatabase(ctx, args.id);
      const row = updateRow(ctx, args.id, args.rowId, { cells: args.cells });
      return ok({ ...row, cells: strip(db.columns, row.cells) });
    },
  );

  server.tool(
    "delete_database_row",
    "Delete a row. Recoverable: its last state stays in the row history and can be restored from the app, under the same id.",
    { id: z.string().uuid(), rowId: z.string().uuid() },
    async (args) => {
      deleteRow(ctx, args.id, args.rowId);
      return ok({ deleted: args.rowId });
    },
  );

  server.tool(
    "export_database_csv",
    "The whole table as CSV text, with the column names as its header. Password columns come back empty; there is no flag here to change that.",
    { id: z.string().uuid() },
    async (args) => ok(exportCsv(ctx, args.id, false)),
  );

  server.tool(
    "import_database_csv",
    "Append the rows of a CSV to an existing table. The first line must be a header; its names are matched to columns ignoring case, and anything unmatched becomes a new text column. Options named in a select column are created if missing. Never replaces what is already there.",
    { id: z.string().uuid(), csv: z.string().min(1) },
    async (args) => ok(importCsv(ctx, args.id, args.csv)),
  );
}

/** The same palette the app offers, walked in order. */
const OPTION_CYCLE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];
