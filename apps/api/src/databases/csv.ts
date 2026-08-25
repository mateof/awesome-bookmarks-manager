import {
  csvTruthy,
  parseCsv,
  pickOptionColor,
  toCsv,
  type CellValue,
  type DbColumn,
  type SelectOption,
} from "@awesome-bookmarks/shared";
import { randomUUID } from "node:crypto";
import type { AuthedContext } from "../auth/session.js";
import { BadRequest } from "../util/errors.js";
import {
  addColumn,
  addRow,
  getDatabase,
  updateColumn,
} from "./service.js";

/**
 * A table as a spreadsheet, both ways.
 *
 * Import is how a table gets its first hundred rows without typing them, and
 * export is the door out: a self-hosted tool that can only be read by itself
 * is a worse promise than it looks. Both go through the same service calls the
 * UI uses, so the row limits, the permission checks and the sealing are the
 * ones that already exist rather than a second implementation of them.
 */

/** Never exported unless explicitly asked for. */
const SECRET_PLACEHOLDER = "";

/** How much CSV one import will accept, before it is a different tool. */
export const MAX_CSV_BYTES = 2_000_000;

function cellToCsv(column: DbColumn, value: CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  switch (column.kind) {
    case "password":
      return SECRET_PLACEHOLDER;
    case "checkbox":
      return value ? "1" : "0";
    case "select":
      return column.config.options.find((o) => o.id === value)?.name ?? "";
    case "multiSelect":
      return (Array.isArray(value) ? value : [])
        .map((id) => column.config.options.find((o) => o.id === id)?.name ?? "")
        .filter(Boolean)
        .join("; ");
    case "ref":
      // A reference is an id into this account's own library, which means
      // nothing in a spreadsheet and nothing on the way back in.
      return "";
    default:
      return typeof value === "object" ? "" : String(value);
  }
}

/**
 * The table as CSV text.
 *
 * `includeSecrets` is off by default and has to be turned on by the person
 * asking, per export. A password column is covered everywhere else in the app,
 * and a file on disk is the one copy nobody can un-share afterwards, so the
 * default cannot be the convenient one.
 */
export function exportCsv(
  ctx: AuthedContext,
  databaseId: string,
  includeSecrets = false,
): { filename: string; csv: string } {
  const db = getDatabase(ctx, databaseId);
  const header = db.columns.map((c) => c.name);
  const body = db.rows.map((r) =>
    db.columns.map((c) =>
      c.kind === "password" && includeSecrets
        ? String(r.cells[c.id] ?? "")
        : cellToCsv(c, r.cells[c.id]),
    ),
  );
  return {
    // Spaces and slashes out: this becomes a filename on somebody's disk.
    filename: `${db.name.replace(/[^\w\-]+/g, "_").slice(0, 60) || "tabla"}.csv`,
    csv: toCsv([header, ...body]),
  };
}

export interface ImportCsvResult {
  rows: number;
  /** Columns created because the file had headers the table did not. */
  newColumns: string[];
  /** Options invented for a select column, in the order they were met. */
  newOptions: string[];
  /** Headers that matched nothing and could not be created, if any. */
  ignored: string[];
}

/**
 * Append the rows of a CSV to an existing table.
 *
 * Appends rather than replaces. "Import" that wipes what is there is the kind
 * of operation people run once and regret, and merging by some guessed key
 * would be guessing about identity in somebody else's data.
 *
 * Headers are matched to columns by name, ignoring case and surrounding
 * space. Anything unmatched becomes a new text column, because losing a column
 * of a file the user chose to import is worse than a table with one more
 * column than it needs.
 */
export function importCsv(
  ctx: AuthedContext,
  databaseId: string,
  text: string,
): ImportCsvResult {
  if (Buffer.byteLength(text, "utf8") > MAX_CSV_BYTES) {
    throw BadRequest("El fichero CSV es demasiado grande (máximo 2 MB)");
  }
  const table = parseCsv(text);
  if (table.length === 0) throw BadRequest("El CSV está vacío");

  const header = (table[0] ?? []).map((h) => h.trim());
  if (header.length === 0) throw BadRequest("El CSV no tiene cabecera");

  const db = getDatabase(ctx, databaseId);
  const byName = new Map(
    db.columns.map((c) => [c.name.trim().toLowerCase(), c]),
  );

  const result: ImportCsvResult = {
    rows: 0,
    newColumns: [],
    newOptions: [],
    ignored: [],
  };

  // Resolve every header to a column first, creating what is missing, so the
  // rows below can be written in one pass.
  const columns: (DbColumn | null)[] = [];
  for (const name of header) {
    if (!name) {
      columns.push(null);
      continue;
    }
    const existing = byName.get(name.toLowerCase());
    if (existing) {
      columns.push(existing);
      continue;
    }
    try {
      const made = addColumn(ctx, databaseId, { kind: "text", name });
      byName.set(name.toLowerCase(), made);
      columns.push(made);
      result.newColumns.push(name);
    } catch {
      // The column cap. The import goes on without that column rather than
      // failing outright, and says which ones it dropped.
      columns.push(null);
      result.ignored.push(name);
    }
  }

  // Options are collected per column and written back once at the end: a
  // thousand rows of the same three statuses would otherwise be a thousand
  // updates to the same column.
  const grownOptions = new Map<string, SelectOption[]>();
  const optionsOf = (column: DbColumn): SelectOption[] => {
    let list = grownOptions.get(column.id);
    if (!list) {
      list = [...column.config.options];
      grownOptions.set(column.id, list);
    }
    return list;
  };

  for (const line of table.slice(1)) {
    // A row of nothing but separators is what a trailing blank line looks
    // like once parsed; importing it would add an empty row per newline.
    if (line.every((v) => v.trim() === "")) continue;
    const cells: Record<string, CellValue> = {};
    line.forEach((raw, i) => {
      const column = columns[i];
      if (!column) return;
      const value = raw.trim();
      if (value === "") return;
      cells[column.id] = toCell(column, value, optionsOf, result);
    });
    addRow(ctx, databaseId, { cells });
    result.rows++;
  }

  for (const [columnId, options] of grownOptions) {
    const before = db.columns.find((c) => c.id === columnId);
    if (!before || before.config.options.length === options.length) continue;
    updateColumn(ctx, databaseId, columnId, { config: { options } });
  }

  return result;
}

function toCell(
  column: DbColumn,
  value: string,
  optionsOf: (c: DbColumn) => SelectOption[],
  result: ImportCsvResult,
): CellValue {
  switch (column.kind) {
    case "number": {
      // Comma as the decimal mark, because that is what a Spanish spreadsheet
      // writes. Anything still not a number is kept out rather than stored as
      // NaN, which would sort and filter as a real value.
      const n = Number(value.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    case "checkbox":
      return csvTruthy(value);
    case "select":
      return findOrAddOption(column, value, optionsOf, result);
    case "multiSelect":
      return value
        .split(/[;|]/)
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => findOrAddOption(column, v, optionsOf, result))
        .filter((id): id is string => !!id);
    case "ref":
      return null;
    default:
      return value;
  }
}

/** An option named in the file, matched by name or invented on the spot. */
function findOrAddOption(
  column: DbColumn,
  name: string,
  optionsOf: (c: DbColumn) => SelectOption[],
  result: ImportCsvResult,
): string {
  const list = optionsOf(column);
  const found = list.find(
    (o) => o.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  if (found) return found.id;
  const made: SelectOption = {
    id: randomUUID(),
    name: name.slice(0, 60),
    color: pickOptionColor(list),
  };
  list.push(made);
  result.newOptions.push(made.name);
  return made.id;
}
