import { z } from "zod";

/**
 * Inline databases: a small table with typed columns that lives inside a note.
 *
 * Three shapes decide everything else here.
 *
 * **The data does not live in the note.** A description is one AES-GCM sealed
 * field with a practical ceiling of about a megabyte, resealed in full on every
 * save. A table stored inside it would fight that ceiling, rewrite everything
 * on each keystroke and lose one of two tabs editing at once. So the note keeps
 * a block holding only an id, exactly like a reference chip, and the rows live
 * in their own tables.
 *
 * **A row is one sealed blob, not one row per cell.** Filtering and sorting
 * happen in memory after decryption anyway (see below), so splitting cells into
 * their own table would buy a query capability that cannot be used, at the cost
 * of a seal and a join per cell. The same call the panels and smart folders
 * already make.
 *
 * **Filtering is in memory.** Cells are encrypted at rest, so the server cannot
 * compare them in SQL. It decrypts and filters in the process, which is what
 * the app's own search already does over bookmarks. The honest consequence is a
 * practical ceiling of a few thousand rows per database: plenty for notes, not
 * a data warehouse.
 */

export const ColumnKindSchema = z.enum([
  "text",
  "number",
  "checkbox",
  "date",
  "select",
  "multiSelect",
  "url",
  /** Points at one of your own bookmarks or folders; renders as a chip. */
  "ref",
]);
export type ColumnKind = z.infer<typeof ColumnKindSchema>;

export const SelectOptionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  color: z.string(),
});
export type SelectOption = z.infer<typeof SelectOptionSchema>;

export const ColumnConfigSchema = z.object({
  /** select / multiSelect only. */
  options: z.array(SelectOptionSchema).max(60).default([]),
  /** Display width in the table view, in pixels. */
  width: z.number().int().min(80).max(800).optional(),
});
export type ColumnConfig = z.infer<typeof ColumnConfigSchema>;

export const DbColumnSchema = z.object({
  id: z.string().uuid(),
  kind: ColumnKindSchema,
  name: z.string(),
  config: ColumnConfigSchema,
  position: z.number().int(),
});
export type DbColumn = z.infer<typeof DbColumnSchema>;

/** What a cell can hold, discriminated by its column's kind. */
export const CellRefSchema = z.object({
  type: z.enum(["bookmark", "folder"]),
  id: z.string(),
});
export const CellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  CellRefSchema,
  z.null(),
]);
export type CellValue = z.infer<typeof CellValueSchema>;

export const DbRowSchema = z.object({
  id: z.string().uuid(),
  /** Keyed by column id. Columns with nothing in them are simply absent. */
  cells: z.record(z.string(), CellValueSchema),
  position: z.number().int(),
});
export type DbRow = z.infer<typeof DbRowSchema>;

export const ViewKindSchema = z.enum(["table", "board", "gallery"]);
export type ViewKind = z.infer<typeof ViewKindSchema>;

/**
 * Filter operators, deliberately few. Every one of them has to be obvious from
 * its name in three languages and behave the same for every column kind it is
 * offered on; a long list of near-synonyms is how these become unusable.
 */
export const FilterOpSchema = z.enum([
  "contains",
  "notContains",
  "equals",
  "notEquals",
  "isEmpty",
  "isNotEmpty",
  "greaterThan",
  "lessThan",
  "before",
  "after",
  "hasAny",
]);
export type FilterOp = z.infer<typeof FilterOpSchema>;

export const FilterSchema = z.object({
  columnId: z.string(),
  op: FilterOpSchema,
  value: CellValueSchema.optional(),
});
export type Filter = z.infer<typeof FilterSchema>;

export const SortSchema = z.object({
  columnId: z.string(),
  direction: z.enum(["asc", "desc"]),
});
export type Sort = z.infer<typeof SortSchema>;

export const ViewConfigSchema = z.object({
  filters: z.array(FilterSchema).max(20).default([]),
  sorts: z.array(SortSchema).max(5).default([]),
  hiddenColumnIds: z.array(z.string()).default([]),
  /** board only: the select column whose options become the columns. */
  groupByColumnId: z.string().nullable().default(null),
  /** board / gallery: which column supplies the card's heading. */
  titleColumnId: z.string().nullable().default(null),
});
export type ViewConfig = z.infer<typeof ViewConfigSchema>;

export const DbViewSchema = z.object({
  id: z.string().uuid(),
  kind: ViewKindSchema,
  name: z.string(),
  config: ViewConfigSchema,
  position: z.number().int(),
  /**
   * The embed this view belongs to, or null when it belongs to the database
   * itself and shows up everywhere.
   */
  blockId: z.string().nullable().default(null),
});
export type DbView = z.infer<typeof DbViewSchema>;

export const DatabaseSummarySchema = z.object({
  /** The group that owns it, or null when it is the caller's own. */
  keyGroupId: z.string().nullable().default(null),
  /** False for a viewer inside a group: they can read it and nothing more. */
  canWrite: z.boolean().default(true),
  id: z.string().uuid(),
  name: z.string(),
  rowCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DatabaseSummary = z.infer<typeof DatabaseSummarySchema>;

export const DatabaseDetailSchema = z.object({
  /** The group that owns it, or null when it is the caller's own. */
  keyGroupId: z.string().nullable().default(null),
  /** False for a viewer inside a group: they can read it and nothing more. */
  canWrite: z.boolean().default(true),
  id: z.string().uuid(),
  name: z.string(),
  columns: z.array(DbColumnSchema),
  rows: z.array(DbRowSchema),
  views: z.array(DbViewSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DatabaseDetail = z.infer<typeof DatabaseDetailSchema>;

// --- request bodies --------------------------------------------------------

export const CreateDatabaseBodySchema = z.object({
  name: z.string().min(1).max(120).default("Sin título"),
});
export type CreateDatabaseBody = z.infer<typeof CreateDatabaseBodySchema>;

export const UpdateDatabaseBodySchema = z.object({
  name: z.string().min(1).max(120),
});
export type UpdateDatabaseBody = z.infer<typeof UpdateDatabaseBodySchema>;

export const CreateColumnBodySchema = z.object({
  kind: ColumnKindSchema,
  name: z.string().min(1).max(80),
  config: ColumnConfigSchema.partial().optional(),
});
export type CreateColumnBody = z.infer<typeof CreateColumnBodySchema>;

export const UpdateColumnBodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  config: ColumnConfigSchema.partial().optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateColumnBody = z.infer<typeof UpdateColumnBodySchema>;

export const CreateRowBodySchema = z.object({
  cells: z.record(z.string(), CellValueSchema).default({}),
});
export type CreateRowBody = z.infer<typeof CreateRowBodySchema>;

export const UpdateRowBodySchema = z.object({
  /** Merged into the row: only the columns named here are touched. */
  cells: z.record(z.string(), CellValueSchema).optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateRowBody = z.infer<typeof UpdateRowBodySchema>;

export const CreateViewBodySchema = z.object({
  kind: ViewKindSchema,
  name: z.string().min(1).max(80),
  /** When given, the view is private to that embed. */
  blockId: z.string().max(64).optional(),
});
export type CreateViewBody = z.infer<typeof CreateViewBodySchema>;

export const UpdateViewBodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  config: ViewConfigSchema.partial().optional(),
});
export type UpdateViewBody = z.infer<typeof UpdateViewBodySchema>;

// --- the block that carries one inside a note ------------------------------

export const DB_BLOCK_ATTR = "data-db-id";
/** Kept next to the id so a note still names the table before it loads. */
export const DB_BLOCK_NAME_ATTR = "data-db-name";
/**
 * Identity of the embed itself, minted when the block is inserted.
 *
 * The same database can be embedded in many notes, and each of those places
 * usually wants to look at it differently: the note about this quarter wants
 * the board grouped by status, the one about suppliers wants a filtered table.
 * That is what this id is for. A view carrying it belongs to that embed alone
 * and does not clutter the database's own view bar or anybody else's embed.
 */
export const DB_BLOCK_ID_ATTR = "data-db-block";
/**
 * Which view this embed shows. When set, the block renders that view on its
 * own, without the strip of tabs: an embedded table is usually meant to be one
 * table, not a switcher.
 */
export const DB_BLOCK_VIEW_ATTR = "data-db-view";

/** Columns a kind can meaningfully be filtered by, and with which operators. */
export const OPS_BY_KIND: Record<ColumnKind, FilterOp[]> = {
  text: ["contains", "notContains", "equals", "isEmpty", "isNotEmpty"],
  url: ["contains", "notContains", "equals", "isEmpty", "isNotEmpty"],
  number: ["equals", "notEquals", "greaterThan", "lessThan", "isEmpty", "isNotEmpty"],
  checkbox: ["equals"],
  date: ["equals", "before", "after", "isEmpty", "isNotEmpty"],
  select: ["equals", "notEquals", "isEmpty", "isNotEmpty"],
  multiSelect: ["hasAny", "isEmpty", "isNotEmpty"],
  ref: ["isEmpty", "isNotEmpty"],
};

/** A blank value of the right shape for a kind, used when adding a row. */
export function emptyValue(kind: ColumnKind): CellValue {
  switch (kind) {
    case "checkbox":
      return false;
    case "multiSelect":
      return [];
    case "number":
    case "date":
    case "select":
    case "ref":
      return null;
    default:
      return "";
  }
}

/** Palette for select options, so two options never look identical. */
export const OPTION_COLORS = [
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

// --- what a view actually shows --------------------------------------------

function asText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.join(" ");
  return v.id;
}

function isEmpty(v: CellValue | undefined): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function matches(value: CellValue | undefined, f: Filter): boolean {
  const v = value ?? null;
  switch (f.op) {
    case "isEmpty":
      return isEmpty(v);
    case "isNotEmpty":
      return !isEmpty(v);
    case "contains":
      return asText(v).toLowerCase().includes(asText(f.value ?? "").toLowerCase());
    case "notContains":
      return !asText(v).toLowerCase().includes(asText(f.value ?? "").toLowerCase());
    case "equals":
      // Compared as text so a checkbox filter written as "true" and a select
      // filter written as an option id go through the same path.
      return asText(v) === asText(f.value ?? null);
    case "notEquals":
      return asText(v) !== asText(f.value ?? null);
    case "greaterThan":
      return Number(v) > Number(f.value);
    case "lessThan":
      return Number(v) < Number(f.value);
    case "before":
      return !!v && asText(v) < asText(f.value ?? "");
    case "after":
      return !!v && asText(v) > asText(f.value ?? "");
    case "hasAny": {
      const want = Array.isArray(f.value) ? f.value : [asText(f.value ?? "")];
      const have = Array.isArray(v) ? v : [asText(v)];
      return want.some((w) => have.includes(w));
    }
    default:
      return true;
  }
}

function compare(
  raw: CellValue | undefined,
  rawB: CellValue | undefined,
  kind: ColumnKind,
): number {
  const a = raw ?? null;
  const b = rawB ?? null;
  if (isEmpty(a) && isEmpty(b)) return 0;
  // Blanks sink, whichever direction is being sorted: an empty cell is not a
  // small value, it is an absent one, and burying it is nearly always what the
  // person sorting wanted.
  if (isEmpty(a)) return 1;
  if (isEmpty(b)) return -1;
  if (kind === "number") return Number(a) - Number(b);
  if (kind === "checkbox") return Number(!!a) - Number(!!b);
  return asText(a).localeCompare(asText(b), undefined, { numeric: true });
}

/**
 * Apply a view's filters and sorts. Exported so the same rules produce the
 * same order in the table, the board and a panel's flattened copy; three
 * implementations of "what this view shows" would drift within a week.
 */
export function applyView(
  rows: DbRow[],
  columns: DbColumn[],
  config: ViewConfig,
): DbRow[] {
  const kindOf = new Map(columns.map((c) => [c.id, c.kind]));
  let out = rows.filter((r) =>
    config.filters.every((f) => matches(r.cells[f.columnId], f)),
  );
  for (const sort of [...config.sorts].reverse()) {
    const kind = kindOf.get(sort.columnId) ?? "text";
    out = [...out].sort((a, b) => {
      const n = compare(a.cells[sort.columnId], b.cells[sort.columnId], kind);
      return sort.direction === "asc" ? n : -n;
    });
  }
  return out;
}

