import {
  REF_ID_ATTR,
  REF_SLUG_ATTR,
  REF_TYPE_ATTR,
  type RefType,
  type ResolvedRef,
} from "@awesome-bookmarks/shared";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

/**
 * Makes the reference chips inside rendered rich text do something.
 *
 * The HTML arrives as a sanitised string through `dangerouslySetInnerHTML`, so
 * there are no React nodes to hang props on — the same situation the
 * copyable/spoiler marks are in. So: read the chips out of the DOM, resolve
 * them all in one batched request, then decorate them in place and delegate
 * clicks from a single listener on the container.
 *
 * Resolving matters for more than the tooltip. A chip stores the title as it
 * was when you inserted it; resolving is what makes a renamed bookmark show
 * its current name, and what lets a deleted one say so instead of pretending.
 */

interface ChipRef {
  type: RefType;
  id: string | null;
  slug: string | null;
}

function readChips(root: HTMLElement): ChipRef[] {
  const seen = new Set<string>();
  const out: ChipRef[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(`a[${REF_TYPE_ATTR}]`)) {
    const type = el.getAttribute(REF_TYPE_ATTR) as RefType | null;
    if (
      type !== "folder" &&
      type !== "bookmark" &&
      type !== "asset" &&
      type !== "row"
    ) {
      continue;
    }
    const id = el.getAttribute(REF_ID_ATTR);
    const slug = el.getAttribute(REF_SLUG_ATTR);
    const key = `${type}:${id ?? ""}:${slug ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, id, slug });
  }
  return out;
}

const keyOf = (r: { type: string; id?: string | null; slug?: string | null }) =>
  `${r.type}:${r.id ?? ""}:${r.slug ?? ""}`;

interface HoverState {
  ref: ResolvedRef;
  x: number;
  y: number;
}

/**
 * `container` is the element holding the rendered HTML. Everything happens
 * against the live DOM inside it.
 */
export function useRefChips(
  container: React.RefObject<HTMLElement | null>,
  html: string,
) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [chips, setChips] = useState<ChipRef[]>([]);
  const [hover, setHover] = useState<HoverState | null>(null);
  const hoverTimer = useRef<number | null>(null);

  // Re-read whenever the HTML changes: the container's children are replaced
  // wholesale, so any previously found chip is a stale DOM node.
  useEffect(() => {
    const el = container.current;
    setChips(el ? readChips(el) : []);
  }, [html, container]);

  const { data: resolved } = useQuery({
    queryKey: ["refs", "resolve", chips.map(keyOf).sort().join("|")],
    queryFn: () => api.resolveRefs(chips.map((c) => ({ type: c.type, id: c.id ?? undefined, slug: c.slug ?? undefined }))),
    enabled: chips.length > 0,
    // A description is looked at far more often than the things it points at
    // change, and every chip in every open note would otherwise refetch on
    // each focus.
    staleTime: 60_000,
  });

  const byKey = useMemo(() => {
    const m = new Map<string, ResolvedRef>();
    for (const r of resolved ?? []) m.set(keyOf(r), r);
    return m;
  }, [resolved]);

  // Decorate: current title, a "missing" state, and the little open-in-new-tab
  // affordance a bookmark gets.
  useEffect(() => {
    const root = container.current;
    if (!root || !resolved) return;
    for (const el of root.querySelectorAll<HTMLElement>(`a[${REF_TYPE_ATTR}]`)) {
      const type = el.getAttribute(REF_TYPE_ATTR) as RefType;
      const r = byKey.get(
        keyOf({
          type,
          id: el.getAttribute(REF_ID_ATTR),
          slug: el.getAttribute(REF_SLUG_ATTR),
        }),
      );
      if (!r) continue;
      el.classList.add("ab-ref", `ab-ref-${type}`);
      if (!r.found) {
        el.classList.add("ab-ref-missing");
        el.setAttribute("title", t("refs.missing"));
        continue;
      }
      el.classList.remove("ab-ref-missing");
      if (r.title) el.textContent = r.title;
      el.removeAttribute("title");
      // Rebuilt each pass because textContent above wipes it.
      if (type === "bookmark" && r.url) {
        const open = document.createElement("span");
        open.className = "ab-ref-open";
        open.setAttribute("role", "button");
        open.setAttribute("tabindex", "0");
        open.setAttribute("aria-label", t("refs.openUrl"));
        open.title = t("refs.openUrl");
        open.textContent = "↗";
        el.appendChild(open);
      }
    }
  }, [resolved, byKey, t, container, html]);

  // One delegated listener rather than one per chip: the chips are replaced
  // whenever the note changes, and per-element handlers would leak.
  useEffect(() => {
    const root = container.current;
    if (!root) return;

    const chipOf = (target: EventTarget | null): HTMLElement | null =>
      (target as HTMLElement | null)?.closest?.(`a[${REF_TYPE_ATTR}]`) ?? null;

    const resolve = (el: HTMLElement) =>
      byKey.get(
        keyOf({
          type: el.getAttribute(REF_TYPE_ATTR) as RefType,
          id: el.getAttribute(REF_ID_ATTR),
          slug: el.getAttribute(REF_SLUG_ATTR),
        }),
      );

    const onClick = (e: MouseEvent) => {
      const el = chipOf(e.target);
      if (!el) return;
      e.preventDefault();
      const r = resolve(el);
      if (!r?.found) return;
      const wantsUrl = (e.target as HTMLElement).classList?.contains(
        "ab-ref-open",
      );
      if (r.type === "bookmark") {
        // The arrow opens the site; the label opens the bookmark's own page.
        // Two destinations, two targets, no menu in between.
        if (wantsUrl && r.url) window.open(r.url, "_blank", "noopener");
        else navigate(`/bookmark/${r.id}`);
      } else if (r.type === "folder") {
        navigate(`/folder/${r.id}`);
      } else if (r.type === "row") {
        // The id carries both halves: which table, and which row in it. The
        // table page opens that row's dialog on arrival.
        const [databaseId, rowId] = (r.id ?? "").split(":");
        if (databaseId && rowId) navigate(`/databases/${databaseId}?fila=${rowId}`);
      } else if (r.id) {
        window.open(api.attachmentUrl(r.id), "_blank", "noopener");
      }
    };

    const show = (el: HTMLElement) => {
      const r = resolve(el);
      if (!r?.found) return;
      const box = el.getBoundingClientRect();
      setHover({ ref: r, x: box.left, y: box.bottom });
    };

    const onOver = (e: MouseEvent) => {
      const el = chipOf(e.target);
      if (!el) return;
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      // A short delay, or sweeping the mouse across a paragraph full of chips
      // strobes cards at you.
      hoverTimer.current = window.setTimeout(() => show(el), 220);
    };
    const onOut = (e: MouseEvent) => {
      if (!chipOf(e.target)) return;
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => setHover(null), 120);
    };

    root.addEventListener("click", onClick);
    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseout", onOut);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    };
  }, [byKey, navigate, container]);

  return hover ? <RefTooltip state={hover} /> : null;
}

/**
 * The hover card: what it points at on top, what it says underneath.
 *
 * Rendered in a portal and positioned in viewport coordinates so it is never
 * clipped by the description's own scroll container, which is exactly where
 * these chips live.
 */
function RefTooltip({ state }: { state: HoverState }) {
  const { t } = useTranslation();
  const { ref, x, y } = state;
  const WIDTH = 320;
  const left = Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8));
  // Flip above the chip when there is no room below it.
  const below = y + 160 < window.innerHeight;

  return createPortal(
    <div
      role="tooltip"
      data-testid="ref-tooltip"
      style={{
        position: "fixed",
        left,
        top: below ? y + 6 : undefined,
        bottom: below ? undefined : window.innerHeight - y + 22,
        width: WIDTH,
      }}
      className="z-[60] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/60">
        <div className="truncate text-sm font-medium">{ref.title}</div>
        <div className="truncate text-xs text-sky-600 dark:text-sky-400">
          {ref.url ??
            (ref.type === "asset"
              ? `#${ref.slug}`
              : ref.type === "row"
                ? t("refs.rowKind")
                : t("refs.folderKind"))}
        </div>
      </div>
      <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
        {ref.description ?? (
          <span className="italic text-slate-400">{t("refs.noDescription")}</span>
        )}
      </div>
    </div>,
    document.body,
  );
}
