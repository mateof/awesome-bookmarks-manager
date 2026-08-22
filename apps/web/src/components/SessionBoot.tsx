import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";

/**
 * The screen between logging in and having something real to look at.
 *
 * It exists for two reasons, and only the first is cosmetic. The obvious one is
 * that opening the app used to paint an empty shell that filled in piecemeal.
 * The one that matters is that everything here is **decrypted per request**: on
 * a cold session the server derives the key and opens every folder name, every
 * bookmark title. That is real work and it takes real time, so saying nothing
 * for a second or two reads as a hang.
 *
 * The bar counts **steps that have actually finished**, not a timer. A bar that
 * animates on its own is a lie told at the exact moment the user is deciding
 * whether the app is broken, and it always desyncs from the truth: it either
 * reaches 100% while still loading, or crawls when the answer already arrived.
 * Six steps is coarse, but every jump means something really happened.
 */

/**
 * What has to be in hand before the shell is worth painting. Deliberately the
 * queries `Layout` itself runs, by the same keys: React Query serves both from
 * one request, so gating here costs nothing extra and Layout finds a warm cache
 * instead of firing its own round of fetches.
 *
 * Page-level data is **not** here. Waiting for the current route as well would
 * turn every cold start into the slowest thing on the page, and the shell is
 * what the user needs first.
 */
const STEPS = [
  { label: "boot.folders", queryKey: ["folders"], queryFn: api.listFolders },
  {
    label: "boot.bookmarks",
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
  },
  {
    label: "boot.smart",
    queryKey: ["smart-folders"],
    queryFn: api.listSmartFolders,
  },
  {
    label: "boot.trash",
    queryKey: ["trash", "count"],
    queryFn: api.trashCount,
  },
  {
    label: "boot.invitations",
    queryKey: ["invitations"],
    queryFn: api.listMyInvitations,
  },
] as const;

/**
 * Steps counted by the bar, including the session check that `RequireAuth`
 * performs before this component is ever mounted. Counting it keeps the bar
 * continuous: it starts moving at the login button, not after it.
 */
export const BOOT_TOTAL = STEPS.length + 1;

export function BootScreen({
  done,
  label,
}: {
  done: number;
  /** Already translated: what is still being waited on. */
  label: string;
}) {
  const { t } = useTranslation();
  const pct = Math.round((done / BOOT_TOTAL) * 100);
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-8 dark:bg-slate-950">
      <div className="w-72 space-y-3">
        <div className="text-center">
          <div className="text-lg font-semibold">{t("layout.appTitle")}</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("boot.decrypting")}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label={t("boot.title")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        >
          <div
            className="h-full rounded-full bg-slate-900 transition-[width] duration-300 ease-out dark:bg-slate-100"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p
          aria-live="polite"
          className="text-center text-xs text-slate-500 dark:text-slate-400"
        >
          {label} · {pct}%
        </p>
      </div>
    </div>
  );
}

/**
 * Holds the shell back until this user's own data has arrived.
 *
 * The second half of not showing the previous user's content: `auth.tsx` drops
 * the cache when the identity changes, and this makes sure what replaces it is
 * the new user's data rather than an empty frame filling in.
 */
export function SessionBoot({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const results = useQueries({
    queries: STEPS.map((s) => ({ queryKey: s.queryKey, queryFn: s.queryFn })),
  });

  // A step that failed still counts as finished. Blocking on it would put a
  // failing side query — pending invitations, say — between the user and their
  // bookmarks, which is a far worse outcome than a sidebar with one empty
  // section. Whatever failed reports itself where it is used.
  const waitingFor = STEPS.find((_, i) => results[i]?.isPending);
  if (!waitingFor) return <>{children}</>;

  const done = results.filter((r) => !r.isPending).length;
  return (
    // +1 for the session check, already past by the time we are mounted.
    <BootScreen done={done + 1} label={t(waitingFor.label)} />
  );
}
