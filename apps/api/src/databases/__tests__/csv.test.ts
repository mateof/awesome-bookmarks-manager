import { describe, expect, it } from "vitest";
import { parseCsv, toCsv, csvTruthy } from "@awesome-bookmarks/shared";

/**
 * The three rules that a `split(",")` gets wrong.
 *
 * A CSV field can hold a comma, a quote or a newline, and every one of those
 * is a value somebody will paste into a table: an address, a measurement in
 * inches, a note with two lines. Getting them wrong does not throw, it
 * silently splits one row into two or one cell into three, which is the kind
 * of import damage nobody notices until much later.
 */
describe("csv", () => {
  it("keeps a comma inside a quoted field", () => {
    expect(parseCsv('a,"uno, dos",c')).toEqual([["a", "uno, dos", "c"]]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(parseCsv('"dice ""hola""",x')).toEqual([['dice "hola"', "x"]]);
  });

  it("keeps a newline inside a quoted field", () => {
    expect(parseCsv('"linea1\nlinea2",b')).toEqual([["linea1\nlinea2", "b"]]);
  });

  it("does not invent a row for the trailing newline", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("skips the byte order mark a spreadsheet writes", () => {
    expect(parseCsv("﻿nombre,valor")).toEqual([["nombre", "valor"]]);
  });

  it("round-trips what it wrote", () => {
    const rows = [
      ["nombre", "nota"],
      ['con "comillas"', "con, coma"],
      ["dos\nlineas", ""],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("takes a tick in the three languages the app speaks", () => {
    for (const yes of ["1", "true", "x", "sí", "si", "yes"]) {
      expect(csvTruthy(yes)).toBe(true);
    }
    for (const no of ["0", "false", "no", ""]) {
      expect(csvTruthy(no)).toBe(false);
    }
  });
});
