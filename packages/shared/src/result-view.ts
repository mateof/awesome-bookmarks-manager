import { z } from "zod";

export const ResultSortSchema = z.enum([
  "default",
  "newest",
  "oldest",
  "updated",
  "name",
  "site",
]);
export type ResultSort = z.infer<typeof ResultSortSchema>;

export const ResultWindowSchema = z.enum(["week", "month", "year"]);
export type ResultWindow = z.infer<typeof ResultWindowSchema>;

export interface SortableResult {
  id: string;
  title?: string;
  name?: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS: Record<ResultWindow, number> = {
  week: 7,
  month: 30,
  year: 365,
};

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

export function instantOf(iso: string): number {
  return Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
}

export function siteOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

const labelOf = (item: SortableResult) => item.title ?? item.name ?? "";

function compare(sort: ResultSort, a: SortableResult, b: SortableResult): number {
  switch (sort) {
    case "newest":
      return instantOf(b.createdAt) - instantOf(a.createdAt);
    case "oldest":
      return instantOf(a.createdAt) - instantOf(b.createdAt);
    case "updated":
      return instantOf(b.updatedAt) - instantOf(a.updatedAt);
    case "name":
      return collator.compare(labelOf(a), labelOf(b));
    case "site":
      return (
        collator.compare(siteOf(a.url), siteOf(b.url)) ||
        collator.compare(labelOf(a), labelOf(b))
      );
    default:
      return 0;
  }
}

export function sortResults<T extends SortableResult>(
  items: T[],
  sort: ResultSort,
): T[] {
  if (sort === "default") return items;
  return [...items].sort(
    (a, b) => compare(sort, a, b) || a.id.localeCompare(b.id),
  );
}

export function isWithinWindow(
  iso: string,
  window: ResultWindow,
  now = Date.now(),
): boolean {
  return instantOf(iso) >= now - WINDOW_DAYS[window] * DAY_MS;
}
