import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";

/**
 * The server's clock and yours, side by side, with the gap between them.
 *
 * Built to answer one question: "these timestamps look wrong, whose fault is
 * it?" A clock on its own does not answer it. The gap does, and it separates
 * the two things that get confused:
 *
 * - **The zone difference** is normal and not a bug. Timestamps are stored in
 *   UTC and rendered in whatever zone the reader is in, so a server in UTC and
 *   a reader in Madrid legitimately show times two hours apart.
 * - **Drift** is the actual problem: the two clocks disagreeing about the
 *   *instant*, not about how to name it. That is what shows up here as a
 *   non-zero drift, and it is what would make durations and orderings wrong.
 *
 * It ticks locally from one fetched reading rather than polling every second:
 * a clock is not worth a request per second, and the difference is what is
 * being measured anyway. It re-reads every half minute so a long-open tab does
 * not quietly accumulate drift of its own.
 */
export function ServerClock() {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ["server-time"],
    queryFn: api.serverTime,
    refetchInterval: 30_000,
    staleTime: 0,
  });

  // Re-render once a second. The value shown is derived from the reading plus
  // elapsed local time, so this is the tick, not a new measurement.
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, []);

  if (!q.data) {
    return (
      <div className="text-sm text-slate-400">{t("common.loading")}</div>
    );
  }

  // How far the server was from us when it answered. `dataUpdatedAt` is when
  // the answer landed here, so this includes the trip back — a few
  // milliseconds on a LAN, and honest about not being better than that.
  const skewMs = new Date(q.data.now).getTime() - q.dataUpdatedAt;
  const serverNow = new Date(Date.now() + skewMs);
  const localNow = new Date();

  const fmt = (d: Date, timeZone?: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "medium",
      ...(timeZone ? { timeZone } : {}),
    }).format(d);

  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localOffset = -localNow.getTimezoneOffset();
  const hours = (m: number) =>
    `${m < 0 ? "−" : "+"}${String(Math.floor(Math.abs(m) / 60)).padStart(2, "0")}:${String(
      Math.abs(m) % 60,
    ).padStart(2, "0")}`;

  const rows: [string, string][] = [
    [t("clock.server"), `${fmt(serverNow, "UTC")} UTC`],
    [t("clock.yours"), `${fmt(localNow)} (${localZone}, ${hours(localOffset)})`],
    [
      t("clock.drift"),
      Math.abs(skewMs) < 1000
        ? t("clock.inSync")
        : t("clock.driftValue", { seconds: Math.round(skewMs / 1000) }),
    ],
  ];

  return (
    <div className="space-y-2">
      <dl className="space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap gap-x-2 text-sm">
            <dt className="w-32 shrink-0 text-slate-500 dark:text-slate-400">
              {label}
            </dt>
            <dd className="font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("clock.explain")}
      </p>
    </div>
  );
}
