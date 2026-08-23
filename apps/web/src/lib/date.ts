/**
 * One place that turns a stored timestamp into a Date.
 *
 * Everything the server sends is ISO-8601 UTC with the `Z` since v0.84.0, and
 * rows written before that are re-stamped on boot. The tolerance for the older
 * `YYYY-MM-DD HH:MM:SS` shape stays anyway: it costs one `replace`, and the
 * failure it prevents is silent — that form parses as *local* time, so it comes
 * out shifted by the reader's own offset rather than throwing.
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
