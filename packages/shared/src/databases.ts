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
});
export type DbView = z.infer<typeof DbViewSchema>;

export const DatabaseSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  rowCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DatabaseSummary = z.infer<typeof DatabaseSummarySchema>;

export const DatabaseDetailSchema = z.object({
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
