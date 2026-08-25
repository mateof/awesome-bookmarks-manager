import {
  computeFormula,
  computeRollup,
  formulaText,
  pickOptionColor,
  relatedRows,
  FORMULA_ERROR,
  type CellValue,
  type DbColumn,
  type DbRow,
  type SelectOption,
} from "@awesome-bookmarks/shared";
import { AnchoredPopover } from "./AnchoredPopover.js";
import { CellTooltip } from "./CellTooltip.js";
import { CopyButton } from "./CopyButton.js";
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, EyeOff, ExternalLink, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { RefPicker } from "./RefPicker.js";

/**
 * One cell, editable in place.
 *
 * Text-like kinds commit on blur rather than on every keystroke: a cell is one
 * sealed write of the whole row, and firing that per character would be a
 * request storm and a fight with the merge on the server. The instant kinds
 * (checkbox, select, reference) commit on the click that changed them, because
 * there is no "still typing" state to wait out.
 */
export function DatabaseCell({
  column,
  value,
  onChange,
  readOnly = false,
  multiline = false,
  row,
  columns,
}: {
  column: DbColumn;
  value: CellValue | undefined;
  onChange: (next: CellValue) => void;
  readOnly?: boolean;
  /**
   * The row and its table. Only the computed and linked kinds need them: a
   * formula reads its neighbours, and a relation reaches into another table.
   * Optional so every existing caller keeps working unchanged.
   */
  row?: DbRow;
  columns?: DbColumn[];
  /**
   * Give text as much height as it needs. Off in the grid, where a row that
   * grows with its longest cell makes the table unreadable, and on in the row
   * dialog, which exists precisely because that row did not fit on a line.
   */
  multiline?: boolean;
}) {
  const { t } = useTranslation();

  switch (column.kind) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={value === true}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-slate-700"
          aria-label={column.name}
        />
      );

    case "number":
      return (
        <TextLike
          value={value === null || value === undefined ? "" : String(value)}
          type="number"
          readOnly={readOnly}
          label={column.name}
          // An emptied number cell is "no value", not zero. Storing 0 would
          // quietly turn a blank into a real figure that sorts and filters.
          onCommit={(v) => onChange(v.trim() === "" ? null : Number(v))}
        />
      );

    case "date":
      return (
        <TextLike
          value={typeof value === "string" ? value : ""}
          type="date"
          readOnly={readOnly}
          label={column.name}
          onCommit={(v) => onChange(v || null)}
        />
      );

    case "url":
      return (
        <div className="flex items-center gap-1">
          <CellTooltip text={typeof value === "string" ? value : ""}>
            <TextLike
              value={typeof value === "string" ? value : ""}
              type="url"
              readOnly={readOnly}
              label={column.name}
              onCommit={(v) => onChange(v)}
            />
          </CellTooltip>
          {typeof value === "string" && value.trim() !== "" && (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              title={t("db.openUrl")}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-sky-600"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      );

    case "formula":
      return (
        <FormulaCell column={column} row={row} columns={columns ?? []} />
      );

    case "relation":
      return (
        <RelationCell
          column={column}
          selected={Array.isArray(value) ? value : []}
          readOnly={readOnly}
          onChange={(ids) => onChange(ids)}
        />
      );

    case "rollup":
      return (
        <RollupCell column={column} row={row} columns={columns ?? []} />
      );

    case "password":
      return (
        <PasswordCell
          value={typeof value === "string" ? value : ""}
          readOnly={readOnly}
          label={column.name}
          onCommit={(v) => onChange(v)}
        />
      );

    case "select":
      return (
        <SelectCell
          column={column}
          selected={typeof value === "string" ? [value] : []}
          multiple={false}
          readOnly={readOnly}
          onChange={(ids) => onChange(ids[0] ?? null)}
        />
      );

    case "multiSelect":
      return (
        <SelectCell
          column={column}
          selected={Array.isArray(value) ? value : []}
          multiple
          readOnly={readOnly}
          onChange={(ids) => onChange(ids)}
        />
      );

    case "ref":
      return (
        <RefCell
          value={
            value && typeof value === "object" && !Array.isArray(value)
              ? value
              : null
          }
          readOnly={readOnly}
          onChange={onChange}
        />
      );

    default:
      return multiline ? (
        <TextArea
          value={typeof value === "string" ? value : ""}
          readOnly={readOnly}
          label={column.name}
          onCommit={(v) => onChange(v)}
        />
      ) : (
        // Never on the password kind, which is why this is here and not around
        // every `TextLike`: hovering must not do what the eye button is for.
        <CellTooltip text={typeof value === "string" ? value : ""}>
          <TextLike
            value={typeof value === "string" ? value : ""}
            readOnly={readOnly}
            label={column.name}
            onCommit={(v) => onChange(v)}
          />
        </CellTooltip>
      );
  }
}

function TextLike({
  value,
  onCommit,
  type = "text",
  readOnly,
  label,
  autoComplete,
}: {
  value: string;
  onCommit: (v: string) => void;
  type?: string;
  readOnly?: boolean;
  label: string;
  autoComplete?: string;
}) {
  const [draft, setDraft] = useState(value);
  // Follow the server when it changes underneath, but never while the cell is
  // being typed in: overwriting somebody mid-word is worse than being stale.
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <input
      type={type}
      value={draft}
      readOnly={readOnly}
      aria-label={label}
      autoComplete={autoComplete}
      spellCheck={false}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-sky-500"
    />
  );
}

/**
 * The same cell with room to breathe: several lines, and draggable taller.
 *
 * Commits on blur like its one-line sibling, and for the same reason — a cell
 * is one sealed write of the whole row, so saving per keystroke would be a
 * request per character. Enter inserts a newline here rather than committing,
 * because in a box this shape that is what Enter means.
 */
function TextArea({
  value,
  onCommit,
  readOnly,
  label,
}: {
  value: string;
  onCommit: (v: string) => void;
  readOnly?: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <textarea
      value={draft}
      readOnly={readOnly}
      aria-label={label}
      // Tall enough for what is in it, by both measures: the lines somebody
      // typed and the ones long text wraps into. Capped, so one enormous cell
      // does not turn the dialog into a page of its own.
      rows={Math.min(
        10,
        Math.max(2, draft.split("\n").length, Math.ceil(draft.length / 55)),
      )}
      spellCheck={false}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className="w-full resize-y border-0 bg-transparent px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-sky-500"
    />
  );
}

/**
 * A value you do not want on screen: covered by default, revealed while you
 * ask for it, and copyable without ever showing it.
 *
 * Revealing is deliberately not sticky. It goes back under cover as soon as
 * the cell loses focus, because the thing this protects against is the room
 * you are in, and a table left open on a second monitor is exactly that. The
 * copy button is what makes that bearable: the common errand is pasting the
 * value somewhere else, and it never needs to be read to do that.
 */
function PasswordCell({
  value,
  onCommit,
  readOnly,
  label,
}: {
  value: string;
  onCommit: (v: string) => void;
  readOnly?: boolean;
  label: string;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);

  return (
    <div
      className="flex items-center gap-0.5"
      onBlur={(e) => {
        // Only when focus leaves the cell entirely: moving from the input to
        // the eye button is still inside it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setShown(false);
        }
      }}
    >
      <TextLike
        value={value}
        type={shown ? "text" : "password"}
        readOnly={readOnly}
        label={label}
        // Otherwise the browser reads a `type="password"` input as a login
        // form and offers to fill it, which in a table of twenty rows means
        // twenty offers to overwrite a cell with an unrelated saved password.
        autoComplete="new-password"
        onCommit={onCommit}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        title={shown ? t("db.hideValue") : t("db.showValue")}
        aria-label={shown ? t("db.hideValue") : t("db.showValue")}
        aria-pressed={shown}
        className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      {value !== "" && <CopyButton text={value} title={t("db.copyValue")} />}
    </div>
  );
}

/**
 * A computed cell: read-only by construction.
 *
 * There is nothing to type into, because there is nothing stored. Shown in a
 * lighter weight than typed values so a column of answers does not read as a
 * column somebody filled in by hand.
 */
function FormulaCell({
  column,
  row,
  columns,
}: {
  column: DbColumn;
  row?: DbRow;
  columns: DbColumn[];
}) {
  const { t } = useTranslation();
  if (!row) return null;
  const value = computeFormula(column, row, columns);
  const broken = value === FORMULA_ERROR;
  return (
    <span
      title={broken ? t("db.formulaBroken") : column.config.formula}
      className={`block truncate px-1 py-0.5 text-sm ${
        broken ? "text-red-500" : "text-slate-600 dark:text-slate-300"
      }`}
    >
      {formulaText(value)}
    </span>
  );
}

/** The same, for a rollup: it needs the other table, so it fetches it. */
function RollupCell({
  column,
  row,
  columns,
}: {
  column: DbColumn;
  row?: DbRow;
  columns: DbColumn[];
}) {
  const relation = columns.find((c) => c.id === column.config.relationColumnId);
  const targetId = relation?.config.targetDatabaseId;
  const { data: target } = useQuery({
    queryKey: ["database", targetId ?? "none", null],
    queryFn: () => api.getDatabase(targetId!),
    enabled: !!targetId,
    staleTime: 30_000,
  });
  if (!row) return null;
  return (
    <span className="block truncate px-1 py-0.5 text-sm text-slate-600 dark:text-slate-300">
      {computeRollup(column, row, columns, target ?? null)}
    </span>
  );
}

/**
 * Rows of another table, picked by name.
 *
 * The list is the target table's rows labelled by their first text column,
 * which is the same thing the row dialog calls a row. A relation stores ids,
 * so renaming a row over there changes what this cell says without touching
 * it: that is the point of a link rather than a copy.
 */
function RelationCell({
  column,
  selected,
  onChange,
  readOnly,
}: {
  column: DbColumn;
  selected: string[];
  onChange: (ids: string[]) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const targetId = column.config.targetDatabaseId;

  const { data: target } = useQuery({
    queryKey: ["database", targetId ?? "none", null],
    queryFn: () => api.getDatabase(targetId!),
    enabled: !!targetId,
    staleTime: 30_000,
  });

  const labelOf = (r: DbRow): string => {
    for (const c of target?.columns ?? []) {
      if (c.kind !== "text") continue;
      const v = r.cells[c.id];
      if (typeof v === "string" && v.trim()) return v;
    }
    return t("db.rowDetail");
  };

  const chosen = relatedRows(column, { id: "", cells: { [column.id]: selected }, position: 0 }, target ?? null);

  if (!targetId) {
    return (
      <span className="block px-1 text-xs text-slate-400">
        {t("db.relationNeedsTarget")}
      </span>
    );
  }

  return (
    <div ref={wrap}>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100 disabled:cursor-default dark:hover:bg-slate-800"
      >
        {chosen.length === 0 ? (
          <span className="text-xs text-slate-400">{t("db.empty")}</span>
        ) : (
          chosen.map((r) => (
            <span
              key={r.id}
              className="max-w-full truncate rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800"
            >
              {labelOf(r)}
            </span>
          ))
        )}
      </button>

      {open && (
        <AnchoredPopover anchor={wrap} onClose={() => setOpen(false)}>
          {(target?.rows ?? []).length === 0 && (
            <p className="px-2 py-2 text-xs text-slate-400">{t("db.noRows")}</p>
          )}
          {(target?.rows ?? []).map((r) => {
            const on = selected.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() =>
                  onChange(
                    on ? selected.filter((id) => id !== r.id) : [...selected, r.id],
                  )
                }
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="w-3.5 shrink-0">
                  {on && <Check className="h-3.5 w-3.5 text-slate-500" />}
                </span>
                <span className="min-w-0 truncate">{labelOf(r)}</span>
              </button>
            );
          })}
        </AnchoredPopover>
      )}
    </div>
  );
}

function optionById(column: DbColumn, id: string): SelectOption | undefined {
  return column.config.options.find((o) => o.id === id);
}

export function OptionChip({ option }: { option: SelectOption }) {
  return (
    <span
      className="inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs"
      style={{ backgroundColor: `${option.color}22`, color: option.color }}
    >
      {option.name}
    </span>
  );
}

function SelectCell({
  column,
  selected,
  multiple,
  onChange,
  readOnly,
}: {
  column: DbColumn;
  selected: string[];
  multiple: boolean;
  onChange: (ids: string[]) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const chosen = selected
    .map((id) => optionById(column, id))
    .filter((o): o is SelectOption => !!o);

  return (
    <div ref={wrap}>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100 disabled:cursor-default dark:hover:bg-slate-800"
      >
        {chosen.length === 0 ? (
          <span className="text-xs text-slate-400">{t("db.empty")}</span>
        ) : (
          chosen.map((o) => <OptionChip key={o.id} option={o} />)
        )}
      </button>

      {open && (
        <AnchoredPopover anchor={wrap} onClose={() => setOpen(false)}>
          {column.config.options.length === 0 && (
            <p className="px-2 py-2 text-xs text-slate-400">
              {t("db.noOptions")}
            </p>
          )}
          {column.config.options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  if (multiple) {
                    onChange(
                      on ? selected.filter((s) => s !== o.id) : [...selected, o.id],
                    );
                  } else {
                    // Clicking the chosen option again clears the cell: with a
                    // single select there is otherwise no way back to blank.
                    onChange(on ? [] : [o.id]);
                    setOpen(false);
                  }
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="w-3.5 shrink-0">
                  {on && <Check className="h-3.5 w-3.5 text-slate-500" />}
                </span>
                <OptionChip option={o} />
              </button>
            );
          })}
        </AnchoredPopover>
      )}
    </div>
  );
}

function RefCell({
  value,
  onChange,
  readOnly,
}: {
  value: { type: string; id: string } | null;
  onChange: (v: CellValue) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);

  // Resolved so the cell shows the target's current name, not one frozen when
  // it was chosen, and marks itself when the target is gone.
  const { data } = useQuery({
    queryKey: ["refs", "resolve", value ? `${value.type}:${value.id}` : "none"],
    queryFn: () =>
      api.resolveRefs([
        { type: value!.type as "bookmark" | "folder", id: value!.id },
      ]),
    enabled: !!value,
    staleTime: 60_000,
  });
  const resolved = data?.[0];

  return (
    <div className="flex items-center gap-1">
      {value ? (
        <>
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              resolved && !resolved.found
                ? "text-slate-400 line-through"
                : ""
            }`}
            title={resolved?.url ?? undefined}
          >
            {resolved?.found ? resolved.title : t("refs.missing")}
          </span>
          {resolved?.found && resolved.url && (
            <a
              href={resolved.url}
              target="_blank"
              rel="noopener noreferrer"
              title={t("refs.openUrl")}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-sky-600"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange(null)}
              title={t("db.clearCell")}
              aria-label={t("db.clearCell")}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setPicking(true)}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-slate-400 hover:bg-slate-100 disabled:cursor-default dark:hover:bg-slate-800"
        >
          <Plus className="h-3 w-3" />
          {t("db.pickRef")}
        </button>
      )}

      {picking && (
        <RefPicker
          mode="entity"
          onPick={(r) => {
            setPicking(false);
            if (r.refId && (r.refType === "bookmark" || r.refType === "folder")) {
              onChange({ type: r.refType, id: r.refId });
            }
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** A fresh option, in a colour the column is not already using. */
export function newOption(name: string, existing: SelectOption[]): SelectOption {
  return { id: crypto.randomUUID(), name, color: pickOptionColor(existing) };
}
