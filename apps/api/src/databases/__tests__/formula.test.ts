import { describe, expect, it } from "vitest";
import {
  evaluateFormula,
  formulaText,
  FORMULA_ERROR,
} from "@awesome-bookmarks/shared";

/**
 * The expression language for computed columns.
 *
 * Tested from here rather than from the package it lives in: `shared` has no
 * test runner of its own, and the API is a real consumer of this code (the
 * flattened copy and the CSV export both compute formulas), so this is where
 * a break would actually show up.
 *
 * What is pinned here is mostly the edges, because the happy path
 * (`[a] * [b]`) is the part nobody gets wrong. The edges are where a formula
 * language quietly ruins a table: a division by zero that prints `Infinity` in
 * a column of prices, a date subtraction that is a day out for half the
 * planet, an unfinished expression that takes the whole grid down instead of
 * one cell.
 */
const values: Record<string, number | string | boolean | null> = {
  cantidad: 3,
  precio: 2.5,
  nombre: "Ana",
  apellido: "Pérez",
  desde: "2026-01-01",
  hasta: "2026-03-01",
  cero: 0,
  vacia: null,
};
const run = (src: string) =>
  evaluateFormula(src, (name) => values[name.toLowerCase()] ?? null);

describe("formula", () => {
  it("does arithmetic between columns", () => {
    expect(run("[cantidad] * [precio]")).toBe(7.5);
    expect(run("([cantidad] + 1) * 2")).toBe(8);
    expect(run("-[cantidad]")).toBe(-3);
  });

  it("treats an empty cell as zero in arithmetic, not as an error", () => {
    // Half-filled tables are the normal state; a sum that goes to #error the
    // moment one cell is blank would be useless in exactly the table people
    // are building.
    expect(run("[cantidad] + [vacia]")).toBe(3);
  });

  it("answers nothing rather than Infinity when dividing by zero", () => {
    expect(run("[cantidad] / [cero]")).toBeNull();
    expect(formulaText(run("[cantidad] / [cero]"))).toBe("");
  });

  it("joins text with &", () => {
    expect(run('[nombre] & " " & [apellido]')).toBe("Ana Pérez");
    expect(run('concat([nombre], "-", [apellido])')).toBe("Ana-Pérez");
  });

  it("counts days between two dates", () => {
    // January and February 2026: 31 + 28.
    expect(run("dias([desde], [hasta])")).toBe(59);
    // Not a date on one side: no answer, rather than a number made up from a
    // parse that happened to succeed.
    expect(run("dias([desde], [nombre])")).toBeNull();
  });

  it("compares, and chooses", () => {
    expect(run("[cantidad] > 2")).toBe(true);
    expect(run('si([cantidad] > 2, "muchos", "pocos")')).toBe("muchos");
    expect(run('si([vacia], "sí", "no")')).toBe("no");
  });

  it("says #error instead of throwing", () => {
    for (const bad of ["[cantidad] +", "(1 + 2", "noexiste(1)", "1 2 3"]) {
      expect(run(bad)).toBe(FORMULA_ERROR);
    }
  });

  it("is empty for an empty formula, not an error", () => {
    expect(run("")).toBeNull();
    expect(run("   ")).toBeNull();
  });

  it("prints numbers without trailing zeros", () => {
    expect(formulaText(7.5)).toBe("7.5");
    expect(formulaText(8)).toBe("8");
    expect(formulaText(1 / 3)).toBe("0.33");
    expect(formulaText(true)).toBe("✓");
    expect(formulaText(false)).toBe("");
  });
});
