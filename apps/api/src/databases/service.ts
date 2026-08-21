import {
  ColumnConfigSchema,
  ViewConfigSchema,
  emptyValue,
  type CellValue,
  type ColumnKind,
  type CreateColumnBody,
  type CreateRowBody,
  type CreateViewBody,
  type DatabaseDetail,
  type DatabaseSummary,
  type DbColumn,
  type DbRow,
  type DbView,
  type Filter,
  type Sort,
  type UpdateColumnBody,
  type UpdateRowBody,
  type UpdateViewBody,
  type ViewConfig,
} from "@awesome-bookmarks/shared";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { openField, sealField } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import {
  databaseColumns,
  databaseRows,
  databaseViews,
  databases,
} from "../db/schema.js";
import { BadRequest, NotFound } from "../util/errors.js";

/**
 * Inline databases.
 *
 * Everything a user typed is sealed: the name, each column's name and options,
 * and the whole cell object of each row. What stays readable is the vocabulary
 * the app itself defines (a column's kind, a view's kind) and the ordering
 * integers, because none of that is content.
 *
 * Filtering and sorting run here, in memory, after decryption. That is not a
 * shortcut around the encryption: the server cannot compare AES-GCM ciphertext
 * in SQL, and the app's own search already works this way over bookmarks. It
 * does mean a practical ceiling of a few thousand rows per database.
 */

const MAX_ROWS = 5000;
const MAX_COLUMNS = 40;

function touch(databaseId: string) {
  getDb()
    .update(databases)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(databases.id, databaseId))
    .run();
}

function ownedDatabase(ctx: AuthedContext, id: string) {
  const row = getDb()
    .select()
    .from(databases)
    .where(and(eq(databases.id, id), eq(databases.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Database not found");
  return row;
}

function readColumns(ctx: AuthedContext, databaseId: string): DbColumn[] {
  return getDb()
    .select()
    .from(databaseColumns)
    .where(eq(databaseColumns.databaseId, databaseId))
    .orderBy(asc(databaseColumns.position), asc(databaseColumns.id))
    .all()
    .map((c) => ({
      id: c.id,
      kind: c.kind as ColumnKind,
      name: openField(ctx.dek, ctx.userId, "db.column", c.nameCt),
      config: ColumnConfigSchema.parse(
        c.configCt
          ? JSON.parse(openField(ctx.dek, ctx.userId, "db.columnConfig", c.configCt))
          : {},
      ),
      position: c.position,
    }));
}

function readRows(ctx: AuthedContext, databaseId: string): DbRow[] {
  return getDb()
    .select()
    .from(databaseRows)
    .where(eq(databaseRows.databaseId, databaseId))
    .orderBy(asc(databaseRows.position), asc(databaseRows.id))
    .all()
    .map((r) => ({
      id: r.id,
      cells: JSON.parse(
        openField(ctx.dek, ctx.userId, "db.cells", r.cellsCt),
      ) as Record<string, CellValue>,
      position: r.position,
    }));
}

function readViews(ctx: AuthedContext, databaseId: string): DbView[] {
  return getDb()
    .select()
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, databaseId))
    .orderBy(asc(databaseViews.position), asc(databaseViews.id))
    .all()
    .map((v) => ({
      id: v.id,
      kind: v.kind as DbView["kind"],
      name: openField(ctx.dek, ctx.userId, "db.view", v.nameCt),
      config: ViewConfigSchema.parse(
        v.configCt
          ? JSON.parse(openField(ctx.dek, ctx.userId, "db.viewConfig", v.configCt))
          : {},
      ),
      position: v.position,
    }));
}

export function listDatabases(ctx: AuthedContext): DatabaseSummary[] {
  const rows = getDb()
    .select()
    .from(databases)
    .where(eq(databases.userId, ctx.userId))
    .orderBy(asc(databases.createdAt), asc(databases.id))
    .all();

  return rows.map((d) => ({
    id: d.id,
    name: openField(ctx.dek, ctx.userId, "db.name", d.nameCt),
    rowCount: getDb()
      .select({ id: databaseRows.id })
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, d.id))
      .all().length,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

export function getDatabase(ctx: AuthedContext, id: string): DatabaseDetail {
  const d = ownedDatabase(ctx, id);
  return {
    id: d.id,
    name: openField(ctx.dek, ctx.userId, "db.name", d.nameCt),
    columns: readColumns(ctx, id),
    rows: readRows(ctx, id),
    views: readViews(ctx, id),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/**
 * A new database is never empty. An empty grid with no columns and no views
 * gives the user nothing to click and no idea what the thing is; it starts
 * with a title column, a status select, a table view and three blank rows,
 * which is a table you can immediately type into.
 */
export function createDatabase(
  ctx: AuthedContext,
  name: string,
): DatabaseDetail {
  const id = randomUUID();
  getDb()
    .insert(databases)
    .values({
      id,
      userId: ctx.userId,
      nameCt: sealField(ctx.dek, ctx.userId, "db.name", name),
    })
    .run();

  const title = addColumn(ctx, id, { kind: "text", name: "Título" });
  addColumn(ctx, id, {
    kind: "select",
    name: "Estado",
    config: {
      options: [
        { id: randomUUID(), name: "Pendiente", color: "#eab308" },
        { id: randomUUID(), name: "En curso", color: "#3b82f6" },
        { id: randomUUID(), name: "Hecho", color: "#22c55e" },
      ],
    },
  });
  const view = addView(ctx, id, { kind: "table", name: "Tabla" });
  updateView(ctx, id, view.id, { config: { titleColumnId: title.id } });
  for (let i = 0; i < 3; i++) addRow(ctx, id, { cells: {} });

  return getDatabase(ctx, id);
}

export function renameDatabase(
  ctx: AuthedContext,
  id: string,
  name: string,
): DatabaseSummary {
  ownedDatabase(ctx, id);
  getDb()
    .update(databases)
    .set({
      nameCt: sealField(ctx.dek, ctx.userId, "db.name", name),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(databases.id, id))
    .run();
  const rows = listDatabases(ctx).find((d) => d.id === id)!;
  return rows;
}

export function deleteDatabase(ctx: AuthedContext, id: string): void {
  ownedDatabase(ctx, id);
  // The child tables cascade, but SQLite only honours that with foreign keys
  // switched on, which is not something to depend on for correctness here.
  getDb().delete(databaseRows).where(eq(databaseRows.databaseId, id)).run();
  getDb().delete(databaseColumns).where(eq(databaseColumns.databaseId, id)).run();
  getDb().delete(databaseViews).where(eq(databaseViews.databaseId, id)).run();
  getDb().delete(databases).where(eq(databases.id, id)).run();
}

// --- columns ---------------------------------------------------------------

export function addColumn(
  ctx: AuthedContext,
  databaseId: string,
  body: CreateColumnBody,
): DbColumn {
  ownedDatabase(ctx, databaseId);
  const existing = readColumns(ctx, databaseId);
  if (existing.length >= MAX_COLUMNS) {
    throw BadRequest(`Una base de datos admite ${MAX_COLUMNS} columnas como mucho`);
  }
  const config = ColumnConfigSchema.parse(body.config ?? {});
  const id = randomUUID();
  getDb()
    .insert(databaseColumns)
    .values({
      id,
      databaseId,
      userId: ctx.userId,
      kind: body.kind,
      nameCt: sealField(ctx.dek, ctx.userId, "db.column", body.name),
      configCt: sealField(
        ctx.dek,
        ctx.userId,
        "db.columnConfig",
        JSON.stringify(config),
      ),
      position: existing.length,
    })
    .run();
  touch(databaseId);
  return { id, kind: body.kind, name: body.name, config, position: existing.length };
}

export function updateColumn(
  ctx: AuthedContext,
  databaseId: string,
  columnId: string,
  body: UpdateColumnBody,
): DbColumn {
  ownedDatabase(ctx, databaseId);
  const current = readColumns(ctx, databaseId).find((c) => c.id === columnId);
  if (!current) throw NotFound("Column not found");

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    patch.nameCt = sealField(ctx.dek, ctx.userId, "db.column", body.name);
  }
  if (body.config !== undefined) {
    const merged = ColumnConfigSchema.parse({ ...current.config, ...body.config });
    patch.configCt = sealField(
      ctx.dek,
      ctx.userId,
      "db.columnConfig",
      JSON.stringify(merged),
    );
  }
  if (body.position !== undefined) patch.position = body.position;

  if (Object.keys(patch).length > 0) {
    getDb()
      .update(databaseColumns)
      .set(patch)
      .where(eq(databaseColumns.id, columnId))
      .run();
    touch(databaseId);
  }
  return readColumns(ctx, databaseId).find((c) => c.id === columnId)!;
}

export function deleteColumn(
  ctx: AuthedContext,
  databaseId: string,
  columnId: string,
): void {
  ownedDatabase(ctx, databaseId);
  getDb().delete(databaseColumns).where(eq(databaseColumns.id, columnId)).run();

  // Drop the column's values from every row as well. Leaving them would be an
  // invisible leak: the cells stay sealed on disk and count against the quota
  // for a column nobody can see any more.
  for (const row of readRows(ctx, databaseId)) {
    if (!(columnId in row.cells)) continue;
    const { [columnId]: _gone, ...rest } = row.cells;
    getDb()
      .update(databaseRows)
      .set({
        cellsCt: sealField(ctx.dek, ctx.userId, "db.cells", JSON.stringify(rest)),
      })
      .where(eq(databaseRows.id, row.id))
      .run();
  }

  // Views may point at it for grouping or titling, and a dangling reference
  // there renders an empty board rather than an error anyone can act on.
  for (const view of readViews(ctx, databaseId)) {
    const cfg = view.config;
    const stale =
      cfg.groupByColumnId === columnId ||
      cfg.titleColumnId === columnId ||
      cfg.filters.some((f) => f.columnId === columnId) ||
      cfg.sorts.some((s) => s.columnId === columnId) ||
      cfg.hiddenColumnIds.includes(columnId);
    if (!stale) continue;
    writeViewConfig(ctx, view.id, {
      ...cfg,
      groupByColumnId: cfg.groupByColumnId === columnId ? null : cfg.groupByColumnId,
      titleColumnId: cfg.titleColumnId === columnId ? null : cfg.titleColumnId,
      filters: cfg.filters.filter((f) => f.columnId !== columnId),
      sorts: cfg.sorts.filter((s) => s.columnId !== columnId),
      hiddenColumnIds: cfg.hiddenColumnIds.filter((c) => c !== columnId),
    });
  }
  touch(databaseId);
}

// --- rows ------------------------------------------------------------------

export function addRow(
  ctx: AuthedContext,
  databaseId: string,
  body: CreateRowBody,
): DbRow {
  ownedDatabase(ctx, databaseId);
  const rows = readRows(ctx, databaseId);
  if (rows.length >= MAX_ROWS) {
    throw BadRequest(
      `Una base de datos admite ${MAX_ROWS} filas como mucho; para más volumen, esta no es la herramienta`,
    );
  }
  const id = randomUUID();
  const cells = body.cells ?? {};
  getDb()
    .insert(databaseRows)
    .values({
      id,
      databaseId,
      userId: ctx.userId,
      cellsCt: sealField(ctx.dek, ctx.userId, "db.cells", JSON.stringify(cells)),
      position: rows.length,
    })
    .run();
  touch(databaseId);
  return { id, cells, position: rows.length };
}

export function updateRow(
  ctx: AuthedContext,
  databaseId: string,
  rowId: string,
  body: UpdateRowBody,
): DbRow {
  ownedDatabase(ctx, databaseId);
  const current = readRows(ctx, databaseId).find((r) => r.id === rowId);
  if (!current) throw NotFound("Row not found");

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.cells) {
    // Merged, not replaced: two people (or two tabs) editing different cells
    // of the same row should not overwrite each other, and the client only
    // ever knows about the cell it just changed.
    const merged = { ...current.cells, ...body.cells };
    for (const [k, v] of Object.entries(body.cells)) {
      if (v === null || v === "") delete merged[k];
    }
    patch.cellsCt = sealField(
      ctx.dek,
      ctx.userId,
      "db.cells",
      JSON.stringify(merged),
    );
  }
  if (body.position !== undefined) patch.position = body.position;

  getDb().update(databaseRows).set(patch).where(eq(databaseRows.id, rowId)).run();
  touch(databaseId);
  return readRows(ctx, databaseId).find((r) => r.id === rowId)!;
}

export function deleteRow(
  ctx: AuthedContext,
  databaseId: string,
  rowId: string,
): void {
  ownedDatabase(ctx, databaseId);
  getDb().delete(databaseRows).where(eq(databaseRows.id, rowId)).run();
  touch(databaseId);
}

/** Renumber after a drag, in the order given. */
export function reorderRows(
  ctx: AuthedContext,
  databaseId: string,
  order: string[],
): void {
  ownedDatabase(ctx, databaseId);
  order.forEach((rowId, i) => {
    getDb()
      .update(databaseRows)
      .set({ position: i })
      .where(and(eq(databaseRows.id, rowId), eq(databaseRows.databaseId, databaseId)))
      .run();
  });
  touch(databaseId);
}

// --- views -----------------------------------------------------------------

function writeViewConfig(ctx: AuthedContext, viewId: string, config: ViewConfig) {
  getDb()
    .update(databaseViews)
    .set({
      configCt: sealField(
        ctx.dek,
        ctx.userId,
        "db.viewConfig",
        JSON.stringify(config),
      ),
    })
    .where(eq(databaseViews.id, viewId))
    .run();
}

export function addView(
  ctx: AuthedContext,
  databaseId: string,
  body: CreateViewBody,
): DbView {
  ownedDatabase(ctx, databaseId);
  const existing = readViews(ctx, databaseId);
  const id = randomUUID();
  const config = ViewConfigSchema.parse({});
  getDb()
    .insert(databaseViews)
    .values({
      id,
      databaseId,
      userId: ctx.userId,
      kind: body.kind,
      nameCt: sealField(ctx.dek, ctx.userId, "db.view", body.name),
      configCt: sealField(
        ctx.dek,
        ctx.userId,
        "db.viewConfig",
        JSON.stringify(config),
      ),
      position: existing.length,
    })
    .run();
  touch(databaseId);
  return { id, kind: body.kind, name: body.name, config, position: existing.length };
}

export function updateView(
  ctx: AuthedContext,
  databaseId: string,
  viewId: string,
  body: UpdateViewBody,
): DbView {
  ownedDatabase(ctx, databaseId);
  const current = readViews(ctx, databaseId).find((v) => v.id === viewId);
  if (!current) throw NotFound("View not found");

  if (body.name !== undefined) {
    getDb()
      .update(databaseViews)
      .set({ nameCt: sealField(ctx.dek, ctx.userId, "db.view", body.name) })
      .where(eq(databaseViews.id, viewId))
      .run();
  }
  if (body.config !== undefined) {
    writeViewConfig(
      ctx,
      viewId,
      ViewConfigSchema.parse({ ...current.config, ...body.config }),
    );
  }
  touch(databaseId);
  return readViews(ctx, databaseId).find((v) => v.id === viewId)!;
}

export function deleteView(
  ctx: AuthedContext,
  databaseId: string,
  viewId: string,
): void {
  ownedDatabase(ctx, databaseId);
  const views = readViews(ctx, databaseId);
  if (views.length <= 1) {
    throw BadRequest("Una base de datos necesita al menos una vista");
  }
  getDb().delete(databaseViews).where(eq(databaseViews.id, viewId)).run();
  touch(databaseId);
}

// --- filtering and sorting -------------------------------------------------

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

/** Blank cells for a fresh row, so the client does not have to know the kinds. */
export function blankRow(columns: DbColumn[]): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  for (const c of columns) out[c.id] = emptyValue(c.kind);
  return out;
}

/** Ids of the databases a piece of rich text embeds. */
export function databaseIdsIn(html: string | null | undefined): string[] {
  if (!html) return [];
  const out = new Set<string>();
  for (const m of html.matchAll(/data-db-id="([0-9a-fA-F-]{36})"/g)) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}
