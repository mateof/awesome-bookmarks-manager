import {
  ColumnConfigSchema,
  ViewConfigSchema,
  applyView,
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
  type RowSearchHit,
  type RowVersion,
  type UpdateColumnBody,
  type UpdateRowBody,
  type UpdateViewBody,
  type ViewConfig,
} from "@awesome-bookmarks/shared";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  assertCanWrite,
  canWriteRow,
  openRowField,
  sealRowField,
  visibleTo,
} from "../groups/scope.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import {
  databaseColumns,
  databaseRowVersions,
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

/**
 * A database this user may read: their own, or one a group they belong to
 * owns. Returns the row so callers can seal with whichever key it uses.
 */
function readableDatabase(ctx: AuthedContext, id: string) {
  const row = getDb()
    .select()
    .from(databases)
    .where(and(eq(databases.id, id), visibleTo(ctx, databases)))
    .get();
  if (!row) throw NotFound("Database not found");
  return row;
}

/** The same, but refusing viewers: a group's table is not everyone's to edit. */
function writableDatabase(ctx: AuthedContext, id: string) {
  const row = readableDatabase(ctx, id);
  assertCanWrite(ctx, {
    userId: row.userId,
    keyGroupId: row.keyGroupId ?? null,
    keyScopeId: row.keyScopeId ?? null,
  });
  return row;
}

/** Shorthand for the key a database's own rows are sealed with. */
function keyOf(ctx: AuthedContext, id: string) {
  const row = readableDatabase(ctx, id);
  return {
    userId: row.userId,
    keyGroupId: row.keyGroupId ?? null,
    keyScopeId: row.keyScopeId ?? null,
  };
}

function readColumns(ctx: AuthedContext, databaseId: string): DbColumn[] {
  const keyed = keyOf(ctx, databaseId);
  return getDb()
    .select()
    .from(databaseColumns)
    .where(eq(databaseColumns.databaseId, databaseId))
    .orderBy(asc(databaseColumns.position), asc(databaseColumns.id))
    .all()
    .map((c) => ({
      id: c.id,
      kind: c.kind as ColumnKind,
      name: openRowField(ctx, keyed, "db.column", c.nameCt),
      config: ColumnConfigSchema.parse(
        c.configCt
          ? JSON.parse(openRowField(ctx, keyed, "db.columnConfig", c.configCt))
          : {},
      ),
      position: c.position,
    }));
}

function readRows(ctx: AuthedContext, databaseId: string): DbRow[] {
  const keyed = keyOf(ctx, databaseId);
  return getDb()
    .select()
    .from(databaseRows)
    .where(eq(databaseRows.databaseId, databaseId))
    .orderBy(asc(databaseRows.position), asc(databaseRows.id))
    .all()
    .map((r) => ({
      id: r.id,
      cells: JSON.parse(
        openRowField(ctx, keyed, "db.cells", r.cellsCt),
      ) as Record<string, CellValue>,
      position: r.position,
    }));
}

/**
 * `blockId` is the embed asking. Views private to a *different* embed are left
 * out: they exist so one note can look at a shared table its own way without
 * that appearing everywhere else the table is used.
 */
function readViews(
  ctx: AuthedContext,
  databaseId: string,
  blockId?: string | null,
): DbView[] {
  const keyed = keyOf(ctx, databaseId);
  return getDb()
    .select()
    .from(databaseViews)
    .where(
      and(
        eq(databaseViews.databaseId, databaseId),
        blockId
          ? or(isNull(databaseViews.blockId), eq(databaseViews.blockId, blockId))
          : isNull(databaseViews.blockId),
      ),
    )
    .orderBy(asc(databaseViews.position), asc(databaseViews.id))
    .all()
    .map((v) => ({
      id: v.id,
      kind: v.kind as DbView["kind"],
      name: openRowField(ctx, keyed, "db.view", v.nameCt),
      config: ViewConfigSchema.parse(
        v.configCt
          ? JSON.parse(openRowField(ctx, keyed, "db.viewConfig", v.configCt))
          : {},
      ),
      position: v.position,
      blockId: v.blockId ?? null,
    }));
}

/** Key for a database this user is allowed to change. */
function writeKey(ctx: AuthedContext, databaseId: string) {
  const row = writableDatabase(ctx, databaseId);
  return {
    userId: row.userId,
    keyGroupId: row.keyGroupId ?? null,
    keyScopeId: row.keyScopeId ?? null,
  };
}

export function listDatabases(ctx: AuthedContext): DatabaseSummary[] {
  const rows = getDb()
    .select()
    .from(databases)
    .where(visibleTo(ctx, databases))
    .orderBy(asc(databases.createdAt), asc(databases.id))
    .all();

  return rows.map((d) => ({
    id: d.id,
    keyGroupId: d.keyGroupId ?? null,
    keyScopeId: d.keyScopeId ?? null,
    shared: !!(d.keyGroupId || d.keyScopeId),
    canWrite: canWriteRow(ctx, {
      userId: d.userId,
      keyGroupId: d.keyGroupId ?? null,
      keyScopeId: d.keyScopeId ?? null,
    }),
    name: openRowField(
      ctx,
      {
        userId: d.userId,
        keyGroupId: d.keyGroupId ?? null,
        keyScopeId: d.keyScopeId ?? null,
      },
      "db.name",
      d.nameCt,
    ),
    rowCount: getDb()
      .select({ id: databaseRows.id })
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, d.id))
      .all().length,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

export function getDatabase(
  ctx: AuthedContext,
  id: string,
  blockId?: string | null,
): DatabaseDetail {
  const d = readableDatabase(ctx, id);
  const keyed = {
    userId: d.userId,
    keyGroupId: d.keyGroupId ?? null,
    keyScopeId: d.keyScopeId ?? null,
  };
  return {
    id: d.id,
    keyGroupId: d.keyGroupId ?? null,
    keyScopeId: d.keyScopeId ?? null,
    shared: !!(d.keyGroupId || d.keyScopeId),
    canWrite: canWriteRow(ctx, keyed),
    name: openRowField(ctx, keyed, "db.name", d.nameCt),
    columns: readColumns(ctx, id),
    rows: readRows(ctx, id),
    views: readViews(ctx, id, blockId),
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
  // A new database is always personal. Sharing it is a separate, deliberate
  // act, because a table can live in several notes that are not shared with
  // the same people.
  const keyed = { userId: ctx.userId, keyGroupId: null };
  getDb()
    .insert(databases)
    .values({
      id,
      userId: ctx.userId,
      nameCt: sealRowField(ctx, keyed, "db.name", name),
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
  const row = writableDatabase(ctx, id);
  const keyed = {
    userId: row.userId,
    keyGroupId: row.keyGroupId ?? null,
    keyScopeId: row.keyScopeId ?? null,
  };
  getDb()
    .update(databases)
    .set({
      nameCt: sealRowField(ctx, keyed, "db.name", name),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(databases.id, id))
    .run();
  const rows = listDatabases(ctx).find((d) => d.id === id)!;
  return rows;
}

export function deleteDatabase(ctx: AuthedContext, id: string): void {
  writableDatabase(ctx, id);
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
  const keyed = writeKey(ctx, databaseId);
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
      nameCt: sealRowField(ctx, keyed, "db.column", body.name),
      configCt: sealRowField(ctx, keyed, "db.columnConfig", JSON.stringify(config),
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
  const keyed = writeKey(ctx, databaseId);
  const current = readColumns(ctx, databaseId).find((c) => c.id === columnId);
  if (!current) throw NotFound("Column not found");

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    patch.nameCt = sealRowField(ctx, keyed, "db.column", body.name);
  }
  if (body.config !== undefined) {
    const merged = ColumnConfigSchema.parse({ ...current.config, ...body.config });
    patch.configCt = sealRowField(ctx, keyed, "db.columnConfig", JSON.stringify(merged),
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

/**
 * Renumber the columns, in the order given.
 *
 * Only the order changes. Cells are keyed by column id, not by position, so
 * moving a column touches no row at all — which is the whole reason this is a
 * renumbering and not a migration.
 */
export function reorderColumns(
  ctx: AuthedContext,
  databaseId: string,
  order: string[],
): void {
  // Called for the permission check and to fail the same way every other write
  // does when the caller may not write here.
  writeKey(ctx, databaseId);
  order.forEach((columnId, i) => {
    getDb()
      .update(databaseColumns)
      .set({ position: i })
      .where(
        and(
          eq(databaseColumns.id, columnId),
          eq(databaseColumns.databaseId, databaseId),
        ),
      )
      .run();
  });
  touch(databaseId);
}

export function deleteColumn(
  ctx: AuthedContext,
  databaseId: string,
  columnId: string,
): void {
  const keyed = writeKey(ctx, databaseId);
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
        cellsCt: sealRowField(ctx, keyed, "db.cells", JSON.stringify(rest)),
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
    writeViewConfig(ctx, databaseId, view.id, {
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
  const keyed = writeKey(ctx, databaseId);
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
      cellsCt: sealRowField(ctx, keyed, "db.cells", JSON.stringify(cells)),
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
  const keyed = writeKey(ctx, databaseId);
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
    // Snapshot what it said before, and only when something actually changes.
    // A cell commits on blur, so tabbing through a row without touching
    // anything would otherwise fill the history with identical entries.
    if (JSON.stringify(merged) !== JSON.stringify(current.cells)) {
      recordRowVersion(ctx, databaseId, rowId, keyed, current.cells);
    }
    patch.cellsCt = sealRowField(ctx, keyed, "db.cells", JSON.stringify(merged),
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
  const keyed = writeKey(ctx, databaseId);
  // Recorded before it goes, so a row deleted by mistake is not gone for good.
  // Restoring one puts it back under its own id, which is what keeps any
  // relation pointing at it working.
  const current = readRows(ctx, databaseId).find((r) => r.id === rowId);
  if (current) recordRowVersion(ctx, databaseId, rowId, keyed, current.cells);
  getDb().delete(databaseRows).where(eq(databaseRows.id, rowId)).run();
  touch(databaseId);
}

// --- search ----------------------------------------------------------------

/**
 * How many rows one search will decrypt before it stops looking.
 *
 * Cells are encrypted at rest, so the server cannot ask SQLite to find
 * anything: it has to open them. That is the same bargain the bookmark search
 * already makes, and it is affordable at the sizes this tool is for. The
 * budget is here so a library that has grown past them degrades into a slower,
 * partial answer instead of a request that never returns, and the result says
 * when it was hit rather than pretending it saw everything.
 */
const SEARCH_ROW_BUDGET = 20_000;

/**
 * Find text inside tables.
 *
 * Password columns are not searched, and not because a match would be useless:
 * the snippet would print the secret into a results list, which is the one
 * place a covered value must never end up. Same rule as the flattened copy and
 * the history.
 */
export function searchRows(
  ctx: AuthedContext,
  query: string,
  limit = 30,
): RowSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: RowSearchHit[] = [];
  let scanned = 0;
  let truncated = false;

  for (const summary of listDatabases(ctx)) {
    if (hits.length >= limit || truncated) break;
    let db;
    try {
      db = getDatabase(ctx, summary.id);
    } catch {
      continue;
    }
    const searchable = db.columns.filter((c) => c.kind !== "password");
    for (const row of db.rows) {
      if (++scanned > SEARCH_ROW_BUDGET) {
        truncated = true;
        break;
      }
      if (hits.length >= limit) break;
      for (const col of searchable) {
        const text = cellText(col, row.cells[col.id]);
        if (!text || !text.toLowerCase().includes(q)) continue;
        hits.push({
          databaseId: db.id,
          databaseName: db.name,
          rowId: row.id,
          label: labelOf(db.columns, row.cells) ?? db.name,
          columnName: col.name,
          snippet: snippetAround(text, q),
          truncated,
        });
        break;
      }
    }
  }
  if (truncated) for (const h of hits) h.truncated = true;
  return hits;
}

/** A cell as words, resolving what a select or a checkbox actually says. */
function cellText(column: DbColumn, value: CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  switch (column.kind) {
    case "select":
      return column.config.options.find((o) => o.id === value)?.name ?? "";
    case "multiSelect":
      return (Array.isArray(value) ? value : [])
        .map((id) => column.config.options.find((o) => o.id === id)?.name ?? "")
        .join(" ");
    case "checkbox":
      return value ? "1" : "";
    case "ref":
      return "";
    default:
      return typeof value === "object" ? "" : String(value);
  }
}

/** Enough of the value around the match to recognise it, not the whole cell. */
function snippetAround(text: string, needle: string): string {
  const at = text.toLowerCase().indexOf(needle);
  if (at < 0) return text.slice(0, 80);
  const from = Math.max(0, at - 24);
  const to = Math.min(text.length, at + needle.length + 40);
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}

// --- row history -----------------------------------------------------------

/** How many past states one row keeps. Beyond this the oldest are dropped. */
const MAX_ROW_VERSIONS = 20;

type KeyedRow = { userId: string; keyGroupId: string | null; keyScopeId?: string | null };

function recordRowVersion(
  ctx: AuthedContext,
  databaseId: string,
  rowId: string,
  keyed: KeyedRow,
  cells: Record<string, CellValue>,
): void {
  getDb()
    .insert(databaseRowVersions)
    .values({
      id: randomUUID(),
      databaseId,
      rowId,
      userId: keyed.userId,
      actorId: ctx.userId,
      cellsCt: sealRowField(ctx, keyed, "db.rowVersion", JSON.stringify(cells)),
    })
    .run();

  // Trimmed here rather than by a sweep: the cost is one delete on the write
  // that caused the growth, and a table nobody edits never needs visiting.
  const old = getDb()
    .select({ id: databaseRowVersions.id })
    .from(databaseRowVersions)
    .where(eq(databaseRowVersions.rowId, rowId))
    .orderBy(desc(databaseRowVersions.createdAt), desc(databaseRowVersions.id))
    .all()
    .slice(MAX_ROW_VERSIONS);
  for (const o of old) {
    getDb().delete(databaseRowVersions).where(eq(databaseRowVersions.id, o.id)).run();
  }
}

export function listRowVersions(
  ctx: AuthedContext,
  databaseId: string,
  rowId: string,
): RowVersion[] {
  const keyed = keyOf(ctx, databaseId);
  const columns = readColumns(ctx, databaseId);
  return getDb()
    .select()
    .from(databaseRowVersions)
    .where(
      and(
        eq(databaseRowVersions.databaseId, databaseId),
        eq(databaseRowVersions.rowId, rowId),
      ),
    )
    .orderBy(desc(databaseRowVersions.createdAt), desc(databaseRowVersions.id))
    .all()
    .map((v) => {
      const cells = JSON.parse(
        openRowField(ctx, keyed, "db.rowVersion", v.cellsCt),
      ) as Record<string, CellValue>;
      return {
        id: v.id,
        actorId: v.actorId,
        createdAt: v.createdAt,
        cells: maskSecrets(columns, cells),
        // What the row was called then, so the list reads as a history of a
        // thing rather than a column of timestamps.
        label: labelOf(columns, cells),
      };
    });
}

/**
 * Put a past state back.
 *
 * Restoring is itself an edit, so the state being replaced is recorded first:
 * going back must be undoable too, or the history becomes a trap where one
 * click loses the present.
 */
export function restoreRowVersion(
  ctx: AuthedContext,
  databaseId: string,
  rowId: string,
  versionId: string,
): DbRow {
  const keyed = writeKey(ctx, databaseId);
  const version = getDb()
    .select()
    .from(databaseRowVersions)
    .where(
      and(
        eq(databaseRowVersions.id, versionId),
        eq(databaseRowVersions.databaseId, databaseId),
        eq(databaseRowVersions.rowId, rowId),
      ),
    )
    .get();
  if (!version) throw NotFound("Version not found");

  const cells = JSON.parse(
    openRowField(ctx, keyed, "db.rowVersion", version.cellsCt),
  ) as Record<string, CellValue>;

  const current = readRows(ctx, databaseId).find((r) => r.id === rowId);
  if (current) {
    recordRowVersion(ctx, databaseId, rowId, keyed, current.cells);
    getDb()
      .update(databaseRows)
      .set({
        cellsCt: sealRowField(ctx, keyed, "db.cells", JSON.stringify(cells)),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(databaseRows.id, rowId))
      .run();
  } else {
    // The row was deleted. It comes back under the same id, at the end.
    const rows = readRows(ctx, databaseId);
    getDb()
      .insert(databaseRows)
      .values({
        id: rowId,
        databaseId,
        userId: keyed.userId,
        cellsCt: sealRowField(ctx, keyed, "db.cells", JSON.stringify(cells)),
        position: rows.length,
      })
      .run();
  }
  touch(databaseId);
  return readRows(ctx, databaseId).find((r) => r.id === rowId)!;
}

/**
 * A password's past is still a password.
 *
 * The history is read into a dialog like any other list, so the values in it
 * have to be treated exactly like the cell they came from. Replaced by a
 * marker rather than dropped, so the entry still shows that the value changed
 * at that point, which is most of what you want history for.
 */
function maskSecrets(
  columns: DbColumn[],
  cells: Record<string, CellValue>,
): Record<string, CellValue> {
  const out: Record<string, CellValue> = { ...cells };
  for (const c of columns) {
    if (c.kind !== "password") continue;
    if (out[c.id] !== undefined && out[c.id] !== null && out[c.id] !== "") {
      out[c.id] = "••••••••";
    }
  }
  return out;
}

/** The row's own name: its first text cell, cut short. */
function labelOf(
  columns: DbColumn[],
  cells: Record<string, CellValue>,
): string | null {
  for (const c of columns) {
    if (c.kind !== "text") continue;
    const v = cells[c.id];
    if (typeof v === "string" && v.trim()) {
      return v.length > 60 ? `${v.slice(0, 60)}…` : v;
    }
  }
  return null;
}

/** Renumber after a drag, in the order given. */
export function reorderRows(
  ctx: AuthedContext,
  databaseId: string,
  order: string[],
): void {
  const keyed = writeKey(ctx, databaseId);
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

function writeViewConfig(
  ctx: AuthedContext,
  databaseId: string,
  viewId: string,
  config: ViewConfig,
) {
  const keyed = writeKey(ctx, databaseId);
  getDb()
    .update(databaseViews)
    .set({
      configCt: sealRowField(ctx, keyed, "db.viewConfig", JSON.stringify(config),
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
  const keyed = writeKey(ctx, databaseId);
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
      blockId: body.blockId ?? null,
      nameCt: sealRowField(ctx, keyed, "db.view", body.name),
      configCt: sealRowField(ctx, keyed, "db.viewConfig", JSON.stringify(config),
      ),
      position: existing.length,
    })
    .run();
  touch(databaseId);
  return {
    id,
    kind: body.kind,
    name: body.name,
    config,
    position: existing.length,
    blockId: body.blockId ?? null,
  };
}

export function updateView(
  ctx: AuthedContext,
  databaseId: string,
  viewId: string,
  body: UpdateViewBody,
): DbView {
  const keyed = writeKey(ctx, databaseId);
  const current = readViews(ctx, databaseId).find((v) => v.id === viewId);
  if (!current) throw NotFound("View not found");

  if (body.name !== undefined) {
    getDb()
      .update(databaseViews)
      .set({ nameCt: sealRowField(ctx, keyed, "db.view", body.name) })
      .where(eq(databaseViews.id, viewId))
      .run();
  }
  if (body.config !== undefined) {
    writeViewConfig(
      ctx,
      databaseId,
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
  const keyed = writeKey(ctx, databaseId);
  const views = readViews(ctx, databaseId);
  if (views.length <= 1) {
    throw BadRequest("Una base de datos necesita al menos una vista");
  }
  getDb().delete(databaseViews).where(eq(databaseViews.id, viewId)).run();
  touch(databaseId);
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

// Re-exported so callers in the API do not have to know it lives in shared.
export { applyView };

/**
 * Everything an archive needs to recreate a database elsewhere, decrypted.
 * Ids are carried so the exported notes, which reference them, can be rewritten
 * to the new ones on import.
 */
export function exportDatabase(ctx: AuthedContext, id: string) {
  const d = getDatabase(ctx, id);
  return {
    id: d.id,
    name: d.name,
    columns: d.columns.map((c) => ({
      id: c.id,
      kind: c.kind as string,
      name: c.name,
      config: c.config as unknown,
      position: c.position,
    })),
    rows: d.rows.map((r) => ({
      id: r.id,
      cells: r.cells as Record<string, unknown>,
      position: r.position,
    })),
    views: d.views.map((v) => ({
      id: v.id,
      kind: v.kind as string,
      name: v.name,
      config: v.config as unknown,
      position: v.position,
    })),
  };
}

/**
 * Recreate an exported database under the importing user's key.
 *
 * Every id is new, and the cells are rewritten to the new column ids as they
 * go: keeping the old ones would produce rows whose keys match nothing, which
 * renders as a table full of blanks rather than as an error anyone could spot.
 * Returns the new database id so the importer can rewrite the notes.
 */
export interface ImportableDatabase {
  id: string;
  name: string;
  columns: { id: string; kind: string; name: string; config?: unknown; position: number }[];
  rows: { id: string; cells: Record<string, unknown>; position: number }[];
  views: { id: string; kind: string; name: string; config?: unknown; position: number }[];
}

export function importDatabase(
  ctx: AuthedContext,
  source: ImportableDatabase,
): string {
  const id = randomUUID();
  // An imported copy is personal, whatever the original was: importing is not
  // a way to gain access to somebody's group.
  const keyed = { userId: ctx.userId, keyGroupId: null };
  getDb()
    .insert(databases)
    .values({
      id,
      userId: ctx.userId,
      nameCt: sealRowField(ctx, keyed, "db.name", source.name),
    })
    .run();

  const columnIdMap = new Map<string, string>();
  for (const c of source.columns) {
    const created = addColumn(ctx, id, {
      kind: c.kind as never,
      name: c.name,
      config: ColumnConfigSchema.parse(c.config ?? {}),
    });
    columnIdMap.set(c.id, created.id);
  }

  for (const r of source.rows) {
    const cells: Record<string, CellValue> = {};
    for (const [oldColumnId, value] of Object.entries(r.cells)) {
      const next = columnIdMap.get(oldColumnId);
      if (next) cells[next] = value as CellValue;
    }
    addRow(ctx, id, { cells });
  }

  for (const v of source.views) {
    const created = addView(ctx, id, {
      kind: v.kind as never,
      name: v.name,
    });
    const cfg = ViewConfigSchema.parse(v.config ?? {});
    updateView(ctx, id, created.id, {
      config: {
        ...cfg,
        filters: cfg.filters
          .filter((f) => columnIdMap.has(f.columnId))
          .map((f) => ({ ...f, columnId: columnIdMap.get(f.columnId)! })),
        sorts: cfg.sorts
          .filter((so) => columnIdMap.has(so.columnId))
          .map((so) => ({ ...so, columnId: columnIdMap.get(so.columnId)! })),
        hiddenColumnIds: cfg.hiddenColumnIds
          .map((c) => columnIdMap.get(c))
          .filter((c): c is string => !!c),
        groupByColumnId: cfg.groupByColumnId
          ? (columnIdMap.get(cfg.groupByColumnId) ?? null)
          : null,
        titleColumnId: cfg.titleColumnId
          ? (columnIdMap.get(cfg.titleColumnId) ?? null)
          : null,
      },
    });
  }

  return id;
}
