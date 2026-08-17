import { Globe, Link2, MonitorDown, Smile, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { EmojiPicker } from "./EmojiPicker.js";

type Mode = "emoji" | "image";

const MAX_BYTES = 1024 * 1024; // mirror the server cap for the tab icon

/**
 * Tab icon for a panel: either an emoji or an image, never both (the server
 * clears one when the other is set). The image can be uploaded, fetched from a
 * URL, or pasted straight into the drop area, which is the quickest path when
 * you already have a favicon on the clipboard.
 */
export function FaviconPicker({
  emoji,
  onEmojiChange,
  imageUrl,
  onUpload,
  onClearImage,
}: {
  emoji: string;
  onEmojiChange: (next: string) => void;
  /** Current uploaded icon, when there is one. */
  imageUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  onClearImage: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(imageUrl ? "image" : "emoji");
  const [showEmoji, setShowEmoji] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof ApiError || e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = async (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    // The two are alternatives, so leaving a mode clears what it had set.
    if (next === "emoji" && imageUrl) await run(onClearImage);
    if (next === "image" && emoji) onEmojiChange("");
  };

  const fromUrlServer = () =>
    run(async () => {
      const file = await api.fetchImageFromUrl(url.trim());
      await onUpload(file);
      setUrl("");
    });

  const fromUrlBrowser = () =>
    run(async () => {
      const res = await fetch(url.trim(), { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error(t("background.notAnImage"));
      if (blob.size > MAX_BYTES) throw new Error(t("background.tooLarge"));
      await onUpload(new File([blob], "favicon", { type: blob.type }));
      setUrl("");
    });

  /** Accept an image pasted into the drop area (Cmd/Ctrl+V). */
  const onPaste = (e: React.ClipboardEvent) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    void run(() => onUpload(file));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {(["emoji", "image"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            onClick={() => void switchMode(m)}
            className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${
              mode === m
                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {m === "emoji" ? t("panels.faviconEmojiMode") : t("panels.faviconImageMode")}
          </button>
        ))}
      </div>

      {mode === "emoji" && (
        <div className="relative flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-300 text-xl dark:border-slate-700">
            {emoji || "–"}
          </span>
          <input
            className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-center text-sm dark:border-slate-700 dark:bg-slate-800"
            value={emoji}
            onChange={(e) => onEmojiChange(e.target.value)}
            placeholder="🔖"
            maxLength={8}
          />
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Smile className="h-3.5 w-3.5" /> {t("panels.faviconChoose")}
          </button>
          {emoji && (
            <button
              type="button"
              onClick={() => onEmojiChange("")}
              className="inline-flex items-center gap-0.5 text-xs text-slate-500 hover:text-red-600"
            >
              <X className="h-3 w-3" /> {t("common.remove")}
            </button>
          )}
          {showEmoji && (
            <EmojiPicker
              value={emoji}
              onPick={onEmojiChange}
              onClose={() => setShowEmoji(false)}
            />
          )}
        </div>
      )}

      {mode === "image" && (
        <div className="space-y-2" onPaste={onPaste}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              title={t("panels.faviconPasteHint")}
              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded border border-slate-300 bg-white disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
            >
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-10 w-10 object-contain" />
              ) : (
                <Upload className="h-4 w-4 text-slate-400" />
              )}
            </button>
            <div className="flex flex-col text-xs">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-left text-blue-600 hover:underline"
              >
                {imageUrl ? t("iconPicker.change") : t("iconPicker.upload")}
              </button>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => void run(onClearImage)}
                  className="flex items-center gap-0.5 text-slate-500 hover:text-red-600"
                >
                  <X className="h-3 w-3" /> {t("common.remove")}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Link2 className="h-4 w-4 text-slate-400" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("iconPicker.fromUrlPlaceholder")}
              disabled={busy}
              className="min-w-[9rem] flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={() => void fromUrlServer()}
              disabled={!url.trim().startsWith("http") || busy}
              title={t("iconPicker.fetchUrlServerTitle")}
              className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Globe className="h-3 w-3" /> {t("iconPicker.fetchUrl")}
            </button>
            <button
              type="button"
              onClick={() => void fromUrlBrowser()}
              disabled={
                !(url.trim().startsWith("http") || url.trim().startsWith("data:")) || busy
              }
              title={t("iconPicker.fetchUrlBrowserTitle")}
              className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <MonitorDown className="h-3 w-3" /> {t("iconPicker.fetchUrlBrowser")}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">{t("panels.faviconPasteHint")}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.ico"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(() => onUpload(f));
              e.target.value = "";
            }}
          />
        </div>
      )}

      {msg && <div className="text-xs text-red-600">{msg}</div>}
    </div>
  );
}
