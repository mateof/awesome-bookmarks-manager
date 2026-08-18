import { AlertTriangle, Info, TriangleAlert } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useBackdropDismiss } from "../lib/overlay.js";

/**
 * In-app replacements for `window.confirm` and `window.alert`.
 *
 * The browser's own dialogs cannot be styled, ignore the app's language and
 * theme, and on some platforms are rendered detached from the window that
 * raised them. They also block the main thread, which stops React from
 * repainting whatever the user was looking at.
 *
 * The API stays promise-shaped and imperative on purpose:
 *
 *     if (!(await confirm({ message: … }))) return;
 *
 * so every existing `if (!confirm(…)) return;` keeps its control flow and the
 * change is a rename plus an `await`, rather than each call site being turned
 * inside out into declarative dialog state.
 */

export interface ConfirmOptions {
  title?: string;
  message: string;
  /** Secondary line, e.g. what exactly will be removed. */
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, warning icon, and focus starts on Cancel. */
  danger?: boolean;
}

export interface AlertOptions {
  title?: string;
  message: string;
  details?: string;
  /** Amber styling for a warning rather than plain information. */
  tone?: "info" | "warning";
}

/**
 * Both accept a bare string for the common "just a message" case, which is
 * what most call sites need and keeps them readable.
 */
interface DialogApi {
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  alert: (opts: AlertOptions | string) => Promise<void>;
}

const Ctx = createContext<DialogApi | null>(null);

/**
 * Module-level handle, wired up by the provider on mount.
 *
 * A hook would be more idiomatic, but these dialogs are called from ~40 places
 * spread over deeply nested card and row components, and threading a hook into
 * every one of them adds plumbing to files that otherwise have no reason to
 * change. There is exactly one provider, mounted at the root, so a singleton
 * is safe here — the same shape `react-hot-toast` and friends use. `useDialogs`
 * stays available for components that prefer the hook.
 */
let impl: DialogApi | null = null;

function notReady(): never {
  throw new Error("Dialogs used before <DialogProvider> mounted");
}

export const dlg: DialogApi = {
  confirm: (opts) => (impl ? impl.confirm(opts) : notReady()),
  alert: (opts) => (impl ? impl.alert(opts) : notReady()),
};

type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "alert"; opts: AlertOptions; resolve: () => void };

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions | string) =>
      new Promise<boolean>((resolve) => {
        setPending({
          kind: "confirm",
          opts: typeof opts === "string" ? { message: opts } : opts,
          resolve,
        });
      }),
    [],
  );

  const alert = useCallback(
    (opts: AlertOptions | string) =>
      new Promise<void>((resolve) => {
        setPending({
          kind: "alert",
          opts: typeof opts === "string" ? { message: opts } : opts,
          resolve,
        });
      }),
    [],
  );

  const api = useMemo<DialogApi>(() => ({ confirm, alert }), [confirm, alert]);

  useEffect(() => {
    impl = api;
    return () => {
      if (impl === api) impl = null;
    };
  }, [api]);

  const settle = (value: boolean) => {
    if (!pending) return;
    // Resolve before clearing so the caller's continuation runs in the same
    // task as the click. That keeps the browser's user activation alive, which
    // matters for the callers that go on to open tabs.
    if (pending.kind === "confirm") pending.resolve(value);
    else pending.resolve();
    setPending(null);
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {pending && <DialogHost pending={pending} onSettle={settle} />}
    </Ctx.Provider>
  );
}

export function useDialogs(): DialogApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useDialogs must be used inside <DialogProvider>");
  }
  return ctx;
}

function DialogHost({
  pending,
  onSettle,
}: {
  pending: Pending;
  onSettle: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const isConfirm = pending.kind === "confirm";
  const danger = isConfirm && pending.opts.danger === true;
  const warn = !isConfirm && pending.opts.tone === "warning";
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // A destructive action starts with Cancel focused, so a stray Enter or
  // Space right after the dialog appears does not delete anything.
  useEffect(() => {
    const target = danger ? cancelRef.current : primaryRef.current;
    target?.focus();
  }, [danger]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSettle(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSettle]);

  // Dismissing by clicking outside means "no", which is the safe reading for
  // both a confirmation and an acknowledgement.
  const backdrop = useBackdropDismiss(() => onSettle(false));

  const title =
    pending.opts.title ??
    (isConfirm ? t("dialog.confirmTitle") : t("dialog.noticeTitle"));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm sm:items-center"
      {...backdrop}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        aria-describedby="dlg-body"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl motion-safe:animate-[spotPop_.14s_ease-out] dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex gap-3 p-5">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              danger
                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                : warn
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {danger ? (
              <TriangleAlert className="h-5 w-5" />
            ) : warn ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Info className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="dlg-title" className="text-base font-semibold">
              {title}
            </h2>
            <p
              id="dlg-body"
              className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300"
            >
              {pending.opts.message}
            </p>
            {pending.opts.details && (
              <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-950/40">
                {pending.opts.details}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end dark:border-slate-800 dark:bg-slate-950/40">
          {isConfirm && (
            <button
              ref={cancelRef}
              type="button"
              onClick={() => onSettle(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {pending.opts.cancelLabel ?? t("common.cancel")}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={() => onSettle(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            }`}
          >
            {isConfirm
              ? (pending.opts.confirmLabel ?? t("common.confirm"))
              : t("common.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
