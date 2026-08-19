import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ArchiveScope } from "@awesome-bookmarks/shared";
import { ApiError, api } from "../api.js";
import { Modal } from "./Modal.js";

/**
 * Options for an `.abz` export.
 *
 * The import side has always asked for a passphrase; the export side used to
 * fire the download straight from the menu, so there was no way to produce an
 * encrypted file in the first place. Both halves of the format are reachable
 * from here now, along with the snapshots, which are opt-in because archived
 * page copies are the bulk of the size.
 *
 * The passphrase is asked twice on purpose. There is no recovery path for an
 * export: a typo does not fail, it produces a file nobody can ever open.
 */
export function ExportArchiveDialog({
  scope,
  id,
  onClose,
}: {
  scope: ArchiveScope;
  id?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [includeSnapshots, setIncludeSnapshots] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const wants = passphrase.length > 0;
  const tooShort = wants && passphrase.length < 8;
  const mismatch = wants && repeat !== passphrase;

  const run = useMutation({
    mutationFn: () =>
      api.exportArchive({
        scope,
        ...(id ? { id } : {}),
        includeSnapshots,
        ...(wants ? { passphrase } : {}),
      }),
    onSuccess: onClose,
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  const inputCls =
    "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

  return (
    <Modal title={t("archive.exportTitle")} onClose={onClose}>
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("archive.exportHint")}
        </p>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeSnapshots}
            onChange={(e) => setIncludeSnapshots(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            {t("archive.includeSnapshots")}
            <span className="block text-xs text-slate-500">
              {t("archive.includeSnapshotsHint")}
            </span>
          </span>
        </label>

        <label className="block text-xs font-medium text-slate-500">
          {t("archive.passphraseExport")}
          <input
            type="password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setErr(null);
            }}
            autoComplete="new-password"
            className={inputCls}
          />
        </label>

        {wants && (
          <label className="block text-xs font-medium text-slate-500">
            {t("archive.passphraseRepeat")}
            <input
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              className={inputCls}
            />
          </label>
        )}

        {tooShort && (
          <div className="text-xs text-red-600 dark:text-red-400">
            {t("archive.passphraseTooShort")}
          </div>
        )}
        {!tooShort && mismatch && (
          <div className="text-xs text-red-600 dark:text-red-400">
            {t("archive.passphraseMismatch")}
          </div>
        )}

        {!wants && (
          <div className="flex items-start gap-2 rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("archive.plaintextWarning")}
          </div>
        )}
        {wants && !tooShort && !mismatch && (
          <div className="text-xs text-slate-500">
            {t("archive.passphraseNoRecovery")}
          </div>
        )}

        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}

        <button
          type="button"
          disabled={run.isPending || tooShort || mismatch}
          onClick={() => run.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {run.isPending ? t("common.loading") : t("archive.exportAction")}
        </button>
      </div>
    </Modal>
  );
}
