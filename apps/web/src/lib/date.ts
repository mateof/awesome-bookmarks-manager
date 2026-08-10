/**
 * Timestamps come in two shapes: ISO (`new Date().toISOString()`, has T + Z)
 * and SQLite `current_timestamp` (`YYYY-MM-DD HH:MM:SS`, UTC, no T/Z). Parse
 * both as UTC, then render in the viewer's locale.
 */
function parse(iso: string): Date {
  if (iso.includes("T")) return new Date(iso);
  return new Date(`${iso.replace(" ", "T")}Z`);
}

export function fmtDateTime(iso: string): string {
  return parse(iso).toLocaleString();
}

export function fmtDate(iso: string): string {
  return parse(iso).toLocaleDateString();
}
