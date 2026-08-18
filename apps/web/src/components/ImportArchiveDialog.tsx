import { useMutation } from "@tanstack/react-query";
import { FileArchive, Info } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { Modal } from "./Modal.js";

/**
 * Import an `.abz` into the folder the user is standing in.
 *
 * The imported tree gets fresh ids rather than reusing the ones in the file.
 * That is what separates this from restoring a backup: a folder someone sent
 * you must not be able to overwrite rows of yours that happen to share an id,
 * and importing the same file twice should give you two copies rather than a
 * silent overwrite.
 */
export function ImportArchiveDialog({
  parentId,
  onClose,
  onDone,
}: {
  parentId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{
    folders: number;
    bookmarks: number;
    tags: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useMutation({
    mutationFn: () =>
      api.importArchive(file!, {
        parentId,
        passphrase: passphrase || undefined,
      }),
    onSuccess: (res) => {
      setErr(null);
      setDone(res);
      onDone();
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  return (
    <Modal title={t("archive.importTitle")} onClose={onClose}>
      <div className="space-y-3">
        {done ? (
          <>
            <p className="text-sm">
              {t("archive.imported", {
                folders: done.folders,
                bookmarks: done.bookmarks,
              })}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded bg-slate-900 py-2 text-white dark:bg-slate-100 dark:text-slate-900"
            >
              {t("common.close")}
            </button>
          </>
        ) : (
          <>
            <p className="flex items-start gap-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("archive.importHint")}
            </p>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 p-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <FileArchive className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-left">
                {file ? file.name : t("archive.pickFile")}
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".abz,application/zip"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setErr(null);
                e.target.value = "";
              }}
            />

            <label className="block text-xs font-medium text-slate-500">
              {t("archive.passphraseOptional")}
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            {err && (
              <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {err}
              </div>
            )}

            <button
              type="button"
              disabled={!file || run.isPending}
              onClick={() => run.mutate()}
              className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {run.isPending ? t("common.loading") : t("archive.importAction")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
