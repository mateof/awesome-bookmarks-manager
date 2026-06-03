import { Globe, Image as ImageIcon, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";

interface Props {
  currentUrl: string | null;
  onPick: (file: File) => Promise<void> | void;
  onClear?: () => Promise<void> | void;
  autoFetchUrl?: string;
}

export function IconPicker({ currentUrl, onPick, onClear, autoFetchUrl }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [msg, setMsg] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setMsg(null);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
    try {
      await onPick(file);
    } finally {
      setBusy(false);
    }
  };

  const handleAutoFetch = async () => {
    if (!autoFetchUrl) return;
    setBusy(true);
    setMsg(null);
    try {
      const file = await api.fetchFaviconForUrl(autoFetchUrl);
      await handleFile(file);
      setMsg(t("iconPicker.downloaded"));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t("iconPicker.downloadError"));
    } finally {
      setBusy(false);
    }
  };

  const canAutoFetch =
    !!autoFetchUrl &&
    autoFetchUrl.startsWith("http") &&
    !busy;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-12 w-12 items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={t("iconPicker.iconAlt")}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-slate-400" />
          )}
        </button>
        <div className="flex flex-col text-xs text-slate-500">
          <span>{t("iconPicker.iconLabel")}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-blue-600 hover:underline"
            >
              {previewUrl ? t("iconPicker.change") : t("iconPicker.upload")}
            </button>
            {previewUrl && onClear && (
              <button
                type="button"
                onClick={async () => {
                  setPreviewUrl(null);
                  await onClear?.();
                }}
                className="flex items-center gap-0.5 text-slate-500 hover:text-red-600"
              >
                <X className="h-3 w-3" /> {t("iconPicker.remove")}
              </button>
            )}
          </div>
        </div>
        {autoFetchUrl !== undefined && (
          <button
            type="button"
            onClick={handleAutoFetch}
            disabled={!canAutoFetch}
            title={
              canAutoFetch
                ? t("iconPicker.downloadTitle")
                : t("iconPicker.enterUrlFirst")
            }
            className="ml-auto flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Globe className="h-4 w-4" />
            {busy ? t("iconPicker.downloading") : t("iconPicker.download")}
          </button>
        )}
      </div>
      {msg && (
        <div className="text-xs text-slate-500" role="status">
          {msg}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
