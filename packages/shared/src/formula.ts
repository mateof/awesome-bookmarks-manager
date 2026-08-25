import type { CellValue, DbColumn, DbRow } from "./databases.js";

/**
 * A very small expression language for computed columns.
 *
 * Deliberately narrow, and the narrowness is the design. A full expression
 * language is a project of its own: precedence, types, dates, errors, and a
 * surface that has to keep working forever because people's tables depend on
 * it. What actually gets asked for in a table of notes is arithmetic between
 * two columns, the days between two dates, and gluing text together, so that
 * is what this does and nothing else.
 *
 * Columns are named in brackets — `[Cantidad] * [Precio]` — because a name is
 * what the person writing the formula can see on screen. The ids underneath
 * are stable and the names are not, so a rename breaks a formula; that is a
 * real cost, and it buys a formula somebody can read and fix without knowing
 * what a UUID is.
 *
 * It never throws. A formula that cannot be evaluated says so in the cell,
 * because a table where one bad expression takes the whole grid down is worse
 * than one cell reading `#error`.
 */

export type FormulaValue = number | string | boolean | null;

/** What a cell shows when its formula cannot be worked out. */
export const FORMULA_ERROR = "#error";

// --- tokens -----------------------------------------------------------------

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "col"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "("; }
  | { t: ")"; }
  | { t: ","; };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "[") {
      const end = src.indexOf("]", i);
      if (end < 0) throw new Error("unclosed [");
      out.push({ t: "col", v: src.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Error("unclosed string");
      out.push({ t: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!;
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-ZáéíóúñÁÉÍÓÚÑ_]/.test(c)) {
      const m = /^[a-zA-ZáéíóúñÁÉÍÓÚÑ_][a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if (c === "(") {
      out.push({ t: "(" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ t: ")" });
      i++;
      continue;
    }
    if (c === ",") {
      out.push({ t: "," });
      i++;
      continue;
    }
    // Two-character comparisons first, or `>=` would read as `>` then `=`.
    const two = src.slice(i, i + 2);
    if ([">=", "<=", "<>", "!="].includes(two)) {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/%<>=&".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`unexpected ${c}`);
  }
  return out;
}

// --- evaluation -------------------------------------------------------------

interface Ctx {
  tokens: Token[];
  at: number;
  lookup: (name: string) => FormulaValue;
}

function peek(c: Ctx): Token | undefined {
  return c.tokens[c.at];
}

function eat(c: Ctx): Token {
  const t = c.tokens[c.at];
  if (!t) throw new Error("unexpected end");
  c.at++;
  return t;
}

function num(v: FormulaValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  // An empty cell is a zero *in arithmetic only*, so `[a] + [b]` still works
  // while half the table is unfilled. Comparisons keep the null.
  return 0;
}

function text(v: FormulaValue): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "1" : "";
  return String(v);
}

/** Days between two `YYYY-MM-DD` strings, positive when b is later. */
function daysBetween(a: FormulaValue, b: FormulaValue): FormulaValue {
  const parse = (v: FormulaValue) => {
    const s = text(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    // Parsed as UTC noon: the dates in a cell have no time and no zone, and
    // midnight local would land on the previous day for half the planet.
    return Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(5, 7)) - 1,
      Number(s.slice(8, 10)),
      12,
    );
  };
  const from = parse(a);
  const to = parse(b);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86_400_000);
}

function callFunction(name: string, args: FormulaValue[]): FormulaValue {
  switch (name) {
    case "concat":
      return args.map(text).join("");
    case "si":
    case "if":
      return truthy(args[0] ?? null) ? (args[1] ?? null) : (args[2] ?? null);
    case "dias":
    case "days":
      return daysBetween(args[0] ?? null, args[1] ?? null);
    case "redondear":
    case "round":
      return Math.round(num(args[0] ?? null));
    case "min":
      return Math.min(...args.map(num));
    case "max":
      return Math.max(...args.map(num));
    case "abs":
      return Math.abs(num(args[0] ?? null));
    case "largo":
    case "len":
      return text(args[0] ?? null).length;
    case "vacio":
    case "empty":
      return args[0] === null || text(args[0] ?? null) === "";
    default:
      throw new Error(`unknown function ${name}`);
  }
}

function truthy(v: FormulaValue): boolean {
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v.trim() !== "";
}

function primary(c: Ctx): FormulaValue {
  const t = eat(c);
  if (t.t === "num") return t.v;
  if (t.t === "str") return t.v;
  if (t.t === "col") return c.lookup(t.v);
  if (t.t === "(") {
    const v = expression(c);
    const close = eat(c);
    if (close.t !== ")") throw new Error("expected )");
    return v;
  }
  if (t.t === "op" && t.v === "-") return -num(primary(c));
  if (t.t === "id") {
    if (peek(c)?.t === "(") {
      eat(c);
      const args: FormulaValue[] = [];
      if (peek(c)?.t !== ")") {
        for (;;) {
          args.push(expression(c));
          const next = eat(c);
          if (next.t === ")") break;
          if (next.t !== ",") throw new Error("expected , or )");
        }
      } else {
        eat(c);
      }
      return callFunction(t.v, args);
    }
    if (t.v === "true" || t.v === "verdadero") return true;
    if (t.v === "false" || t.v === "falso") return false;
    throw new Error(`unexpected ${t.v}`);
  }
  throw new Error("unexpected token");
}

function product(c: Ctx): FormulaValue {
  let left = primary(c);
  for (;;) {
    const t = peek(c);
    if (t?.t !== "op" || !["*", "/", "%"].includes(t.v)) return left;
    eat(c);
    const right = primary(c);
    const b = num(right);
    if (t.v === "*") left = num(left) * b;
    // Division by zero returns null rather than Infinity: a column of
    // "Infinity" is noise, an empty cell says "cannot answer that yet".
    else if (t.v === "/") left = b === 0 ? null : num(left) / b;
    else left = b === 0 ? null : num(left) % b;
  }
}

function sum(c: Ctx): FormulaValue {
  let left = product(c);
  for (;;) {
    const t = peek(c);
    if (t?.t !== "op" || !["+", "-", "&"].includes(t.v)) return left;
    eat(c);
    const right = product(c);
    // `&` joins text, so `[Nombre] & " " & [Apellido]` reads as it does in
    // every spreadsheet anyone has used.
    if (t.v === "&") left = text(left) + text(right);
    else if (t.v === "+") left = num(left) + num(right);
    else left = num(left) - num(right);
  }
}

function expression(c: Ctx): FormulaValue {
  let left = sum(c);
  for (;;) {
    const t = peek(c);
    if (t?.t !== "op" || ![">", "<", ">=", "<=", "=", "<>", "!="].includes(t.v)) {
      return left;
    }
    eat(c);
    const right = sum(c);
    // Two strings compare as strings; anything else compares as numbers, so
    // `[Fecha] > "2026-01-01"` and `[Cantidad] > 3` both do what they look
    // like they do.
    const bothText = typeof left === "string" && typeof right === "string";
    const a: string | number = bothText ? (left as string) : num(left);
    const b: string | number = bothText ? (right as string) : num(right);
    switch (t.v) {
      case ">":
        left = a > b;
        break;
      case "<":
        left = a < b;
        break;
      case ">=":
        left = a >= b;
        break;
      case "<=":
        left = a <= b;
        break;
      case "=":
        left = a === b;
        break;
      default:
        left = a !== b;
    }
  }
}

/** Evaluate against a lookup of column name to value. Never throws. */
export function evaluateFormula(
  source: string,
  lookup: (name: string) => FormulaValue,
): FormulaValue | typeof FORMULA_ERROR {
  if (!source.trim()) return null;
  try {
    const c: Ctx = { tokens: tokenize(source), at: 0, lookup };
    const value = expression(c);
    if (c.at !== c.tokens.length) return FORMULA_ERROR;
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  } catch {
    return FORMULA_ERROR;
  }
}

/** How a computed value is printed in a cell, a CSV or a flattened copy. */
export function formulaText(value: FormulaValue | typeof FORMULA_ERROR): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "✓" : "";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(2).replace(/\.?0+$/, "");
  }
  return value;
}

/**
 * Work out one formula cell of one row.
 *
 * A formula column stores nothing: there is no cell to go stale, and changing
 * the expression changes every row at once. The cost is that it cannot be
 * filtered or sorted on, which is stated in `OPS_BY_KIND` rather than
 * half-worked.
 */
export function computeFormula(
  column: DbColumn,
  row: DbRow,
  columns: DbColumn[],
): FormulaValue | typeof FORMULA_ERROR {
  const byName = new Map(
    columns.map((c) => [c.name.trim().toLowerCase(), c] as const),
  );
  return evaluateFormula(column.config.formula ?? "", (name) => {
    const target = byName.get(name.trim().toLowerCase());
    if (!target || target.id === column.id) return null;
    // A formula reading another formula is not supported and says so, rather
    // than opening the door to two columns that depend on each other.
    if (target.kind === "formula") return null;
    const raw = row.cells[target.id];
    if (raw === undefined || raw === null) return null;
    if (typeof raw === "object") return null;
    if (Array.isArray(raw)) return null;
    if (target.kind === "select") {
      return (
        target.config.options.find((o) => o.id === raw)?.name ?? String(raw)
      );
    }
    return raw as FormulaValue;
  });
}
