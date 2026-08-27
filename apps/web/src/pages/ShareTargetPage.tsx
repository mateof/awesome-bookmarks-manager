import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, FolderClosed, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { FolderPickerDialog } from "../components/FolderPickerDialog.js";
import { TagPicker } from "../components/TagPicker.js";
import { buildFolderPath } from "../hooks.js";

/**
 * Landing page for Android's share sheet (see `share_target` in
 * manifest.webmanifest) and for the "Guardar un enlace" app shortcut.
 *
 * Sharing from a phone is a two-second interaction, so this is deliberately
 * not the full bookmark dialog: URL, title, folder, tags, save. Anything else
 * can be edited later from the desktop.
 */

/** First http(s) URL inside a blob of text, if any. */
function firstUrl(text: string): string | null {
  const match = /\bhttps?:\/\/[^\s<>"']+/i.exec(text);
  return match ? match[0] : null;
}

/**
 * Apps are wildly inconsistent about which share field carries the link:
 * Chrome sends `url`, most others paste everything into `text`, and some put
 * the page title there too. Normalise all of that into one shape.
 */
export function parseSharedPayload(params: {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}): { url: string; title: string; note: string } {
  const rawText = (params.text ?? "").trim();
  const rawTitle = (params.title ?? "").trim();
  const explicit = (params.url ?? "").trim();
  const url = explicit || firstUrl(rawText) || "";
  // Whatever is left of the shared text once the link is removed is a note,
  // not a title: it is often a quoted excerpt.
  const leftover = url ? rawText.replace(url, "").trim() : rawText;
  const title = rawTitle || (url && leftover.length <= 120 ? leftover : "");
  const note = title === leftover ? "" : leftover;
  return { url, title, note };
}

export function ShareTargetPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();

  const shared = useMemo(
    () =>
      parseSharedPayload({
        url: sp.get("url"),
        text: sp.get("text"),
        title: sp.get("title"),
      }),
    [sp],
  );

  const folders = useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
  const [url, setUrl] = useState(shared.url);
  const [title, setTitle] = useState(shared.title);
  const [note, setNote] = useState(shared.note);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<{ id: string; folderId: string | null } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);

  // The params only arrive once, on the navigation from the share sheet.
  useEffect(() => {
    setUrl(shared.url);
    setTitle(shared.title);
    setNote(shared.note);
  }, [shared]);

  // Remember where the last share went: sharing repeatedly into the same
  // inbox folder is the common case, and re-picking it every time is friction.
  useEffect(() => {
    try {
      const last = localStorage.getItem("shareTarget.folderId");
      if (last) setFolderId(last);
    } catch {
      /* private mode: just use the root */
    }
  }, []);

  /** Where it is going to be saved, spelled out on the button. */
  const currentPath = useMemo(() => {
    if (!folderId) return t("sidebar.home");
    const path = buildFolderPath(folders.data ?? [], folderId).map((p) => p.name);
    return path.length > 0 ? path.join(" / ") : t("sidebar.home");
  }, [folders.data, folderId, t]);

  const save = useMutation({
    mutationFn: async () => {
      const created = await api.createBookmark({
        folderId,
        url: url.trim(),
        title: title.trim() || undefined,
        description: note.trim() || undefined,
        tagIds,
        fetchSnapshot: true,
      });
      return created;
    },
    onSuccess: (created) => {
      setErr(null);
      try {
        if (folderId) localStorage.setItem("shareTarget.folderId", folderId);
        else localStorage.removeItem("shareTarget.folderId");
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      setSaved({ id: created.id, folderId: created.folderId });
    },
    onError: (e) =>
      setErr(e instanceof Error ? e.message : t("folder.errorGenericSave")),
  });

  if (saved) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <Check className="h-7 w-7 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-lg font-semibold">{t("shareTarget.saved")}</h1>
        <p className="truncate text-sm text-slate-500">{title || url}</p>
        <div className="flex flex-col gap-2">
          <Link
            to={saved.folderId ? `/folder/${saved.folderId}` : "/"}
            className="rounded bg-slate-900 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            {t("shareTarget.openFolder")}
          </Link>
          <Link
            to={`/bookmark/${saved.id}`}
            className="rounded border border-slate-300 py-2 text-sm dark:border-slate-700"
          >
            {t("shareTarget.openBookmark")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setSaved(null);
              setUrl("");
              setTitle("");
              setNote("");
              setTagIds([]);
            }}
            className="py-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            {t("shareTarget.saveAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="flex items-center gap-2">
        <Share2 className="h-5 w-5 text-slate-400" />
        <h1 className="text-xl font-semibold">{t("shareTarget.title")}</h1>
      </div>
      <p className="text-sm text-slate-500">{t("shareTarget.subtitle")}</p>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) save.mutate();
        }}
      >
        <label className="block text-xs font-medium text-slate-500">
          {t("shareTarget.url")}
          <input
            type="url"
            required
            autoFocus={!url}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="block text-xs font-medium text-slate-500">
          {t("shareTarget.titleField")}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <div className="block text-xs font-medium text-slate-500">
          {/* Not a `<label>` any more: a label points at a form control, and
              this is a button that opens a dialog. The text still names the
              button, through `aria-labelledby`, so it is read as "Carpeta,
              Inicio" rather than leaving the button to announce a bare path. */}
          <span id="share-folder-label">{t("shareTarget.folder")}</span>
          {/* A button that opens a real picker rather than a `<select>` with
              two hundred flat lines in it: on a phone that control has no
              search, and the shape of the library — the thing you navigate
              by — is exactly what a flat list throws away. */}
          <button
            type="button"
            id="share-folder-button"
            aria-labelledby="share-folder-label share-folder-button"
            onClick={() => setPickingFolder(true)}
            className="mt-1 flex w-full items-center gap-2 rounded border border-slate-300 bg-white px-2 py-2 text-left text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <FolderClosed className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate">{currentPath}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </div>

        <div>
          <span className="text-xs font-medium text-slate-500">
            {t("shareTarget.tags")}
          </span>
          <TagPicker value={tagIds} onChange={setTagIds} />
        </div>

        {note && (
          <label className="block text-xs font-medium text-slate-500">
            {t("shareTarget.note")}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
        )}

        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={!url.trim() || save.isPending}
          className="w-full rounded bg-slate-900 py-2.5 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {save.isPending ? t("common.saving") : t("shareTarget.save")}
        </button>
        <button
          type="button"
          onClick={() => nav("/")}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
        >
          {t("common.cancel")}
        </button>
        {pickingFolder && (
          <FolderPickerDialog
            folders={folders.data ?? []}
            value={folderId}
            onPick={(id) => {
              setFolderId(id);
              setPickingFolder(false);
            }}
            onClose={() => setPickingFolder(false)}
          />
        )}
      </form>
    </div>
  );
}
