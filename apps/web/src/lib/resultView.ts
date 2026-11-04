import {
  ResultSortSchema,
  ResultWindowSchema,
  isWithinWindow,
  sortResults,
  type ResultSort,
  type ResultWindow,
  type SortableResult,
} from "@awesome-bookmarks/shared";

export type ResultType = "all" | "folders" | "bookmarks";

export interface ResultView {
  sort: ResultSort;
  type: ResultType;
  since: ResultWindow | null;
}

export const DEFAULT_VIEW: ResultView = {
  sort: "default",
  type: "all",
  since: null,
};

export function viewFromParams(sp: URLSearchParams): ResultView {
  const type = sp.get("type");
  return {
    sort: ResultSortSchema.catch("default").parse(sp.get("sort")),
    type: type === "folders" || type === "bookmarks" ? type : "all",
    since: ResultWindowSchema.nullable().catch(null).parse(sp.get("since")),
  };
}

export function writeView(sp: URLSearchParams, view: ResultView): URLSearchParams {
  const next = new URLSearchParams(sp);
  next.delete("sort");
  next.delete("type");
  next.delete("since");
  if (view.sort !== "default") next.set("sort", view.sort);
  if (view.type !== "all") next.set("type", view.type);
  if (view.since) next.set("since", view.since);
  return next;
}

export function isDefaultView(view: ResultView): boolean {
  return view.sort === "default" && view.type === "all" && !view.since;
}

interface ViewableResult extends SortableResult {
  favorite?: boolean;
}

export function viewResults<F extends ViewableResult, B extends ViewableResult>(
  view: ResultView,
  folders: F[],
  bookmarks: B[],
  opts: { favorite?: boolean } = {},
): { folders: F[]; bookmarks: B[] } {
  const keep = <T extends ViewableResult>(items: T[]) =>
    sortResults(
      items.filter(
        (item) =>
          (!opts.favorite || item.favorite) &&
          (!view.since || isWithinWindow(item.createdAt, view.since)),
      ),
      view.sort,
    );
  return {
    folders: view.type === "bookmarks" ? [] : keep(folders),
    bookmarks: view.type === "folders" ? [] : keep(bookmarks),
  };
}
