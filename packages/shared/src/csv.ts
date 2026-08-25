/**
 * CSV in and out, hand-written and deliberately small.
 *
 * It is a hundred lines instead of a dependency because the format only looks
 * simple from a distance: a value can contain a comma, a quote or a newline,
 * and the three rules that cover those are exactly what a `split(",")` gets
 * wrong. What it does not try to be is a dialect detector. One separator, one
 * quoting rule, and a `﻿` skipped at the start because that is what
 * spreadsheet software puts there.
 */

/** Parse a whole document into rows of raw strings. Empty input is no rows. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = false;
  };
  const endRow = () => {
    endField();
    // A trailing newline should not invent a row of one empty cell.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        // Two quotes inside a quoted field are one literal quote.
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      endRow();
      continue;
    }
    field += ch;
    started = true;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** One value, quoted only when it has to be. */
export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Serialise rows, `\r\n` between them.
 *
 * CRLF rather than LF because the audience for a CSV export is a spreadsheet,
 * and Excel on Windows is still the one reader that cares.
 */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** What counts as a tick in an imported checkbox column, in three languages. */
export function csvTruthy(value: string): boolean {
  return ["1", "true", "x", "yes", "y", "si", "sí", "verdadero"].includes(
    value.trim().toLowerCase(),
  );
}
