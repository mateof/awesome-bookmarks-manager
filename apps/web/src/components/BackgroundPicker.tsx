import { Globe, Image as ImageIcon, Link2, MonitorDown, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";

const PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#0f172a",
];

const MAX_BYTES = 4 * 1024 * 1024;

interface Props {
  /** CSS color: hex (`#rrggbb` / `#rrggbbaa`) or `rgba(...)`. */
  bgColor: string | null;
  onBgColorChange: (next: string | null) => void;

  /** When omitted, the image controls are hidden (create-time scenario). */
  currentImageUrl?: string | null;
  onImagePick?: (file: File) => Promise<void> | void;
  onImageClear?: () => Promise<void> | void;
}

function extFromMime(ct: string): string {
  const lower = ct.toLowerCase();
  if (lower.includes("png")) return ".png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return ".jpg";
  if (lower.includes("gif")) return ".gif";
  if (lower.includes("webp")) return ".webp";
  if (lower.includes("svg")) return ".svg";
  return ".bin";
}

// Parse a color value into a base hex (#rrggbb) + alpha (0..1). Falls back
// to a sensible default on anything we don't recognise — the picker is
// best-effort, the canonical value is whatever was stored in bgColor.
function parseColor(c: string | null): { hex: string; alpha: number } {
  if (!c) return { hex: "#3b82f6", alpha: 0.15 };
  const m8 = /^#([0-9a-fA-F]{8})$/.exec(c);
  if (m8) {
    const h = m8[1]!;
    return {
      hex: `#${h.slice(0, 6).toLowerCase()}`,
      alpha: parseInt(h.slice(6, 8), 16) / 255,
    };
  }
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(c);
  if (m6) return { hex: `#${m6[1]!.toLowerCase()}`, alpha: 1 };
  const rgba =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)$/.exec(c);
  if (rgba) {
    const r = Number(rgba[1]);
    const g = Number(rgba[2]);
    const b = Number(rgba[3]);
    const a = rgba[4] ? Number(rgba[4]) : 1;
    const hex =
      "#" +
      [r, g, b]
        .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
        .join("");
    return { hex, alpha: Math.max(0, Math.min(1, a)) };
  }
  return { hex: "#3b82f6", alpha: 0.15 };
}

function buildColor(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  if (alpha >= 1) return `#${m[1]!.toLowerCase()}`;
  const aHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${m[1]!.toLowerCase()}${aHex}`;
}

export function BackgroundPicker({
  bgColor,
  onBgColorChange,
  currentImageUrl,
  onImagePick,
  onImageClear,
}: Props) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [preview, setPreview] = useState<string | null>(currentImageUrl ?? null);

  const parsed = useMemo(() => parseColor(bgColor), [bgColor]);

  const setHex = (hex: string) => {
    onBgColorChange(buildColor(hex, parsed.alpha));
  };
  const setAlpha = (alpha: number) => {
    onBgColorChange(buildColor(parsed.hex, alpha));
  };

  const handleFile = async (file: File) => {
    if (!onImagePick) return;
    setBusy(true);
    setMsg(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
    try {
      await onImagePick(file);
      setMsg(t("background.imageSaved"));
    } catch (e) {
      setMsg(
        e instanceof ApiError ? e.message : t("background.imageUploadError"),
      );
    } finally {
      setBusy(false);
    }
  };

  const fetchFromServer = async () => {
    const trimmed = imageUrl.trim();
    if (!trimmed) return;
    setBusy(true);
    setMsg(null);
    try {
      const file = await api.fetchImageFromUrl(trimmed);
      await handleFile(file);
      setImageUrl("");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t("background.imageUrlError"));
    } finally {
      setBusy(false);
    }
  };

  const fetchFromBrowser = async () => {
    const trimmed = imageUrl.trim();
    if (!trimmed) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(trimmed, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error(t("background.notAnImage"));
      }
      if (blob.size > MAX_BYTES) {
        throw new Error(t("background.tooLarge"));
      }
      const file = new File([blob], `bg${extFromMime(blob.type)}`, {
        type: blob.type,
      });
      await handleFile(file);
      setImageUrl("");
    } catch (e) {
      setMsg(
        e instanceof Error && e.message
          ? `${t("background.imageBrowserError")} (${e.message})`
          : t("background.imageBrowserError"),
      );
    } finally {
      setBusy(false);
    }
  };

  const clearImage = async () => {
    if (!onImageClear) return;
    setBusy(true);
    setMsg(null);
    try {
      await onImageClear();
      setPreview(null);
    } catch (e) {
      setMsg(
        e instanceof ApiError ? e.message : t("background.imageUploadError"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded border border-slate-200 p-3 dark:border-slate-700">
      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-500">
          {t("background.colorLabel")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setHex(c)}
              style={{ background: c }}
              className={`h-6 w-6 rounded-full border transition hover:scale-110 ${
                parsed.hex === c
                  ? "border-slate-900 dark:border-slate-100"
                  : "border-transparent"
              }`}
              aria-label={c}
            />
          ))}
          <input
            type="color"
            value={parsed.hex}
            onChange={(e) => setHex(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-slate-300 dark:border-slate-700"
            title={t("background.customColor")}
          />
          {bgColor && (
            <button
              type="button"
              onClick={() => onBgColorChange(null)}
              className="flex items-center gap-0.5 text-xs text-slate-500 hover:text-red-600"
            >
              <X className="h-3 w-3" /> {t("background.clearColor")}
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-16">{t("background.opacity")}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(parsed.alpha * 100)}
            onChange={(e) => setAlpha(Number(e.target.value) / 100)}
            className="flex-1"
          />
          <span className="w-10 text-right tabular-nums">
            {Math.round(parsed.alpha * 100)}%
          </span>
        </label>
        <div
          className="h-8 rounded border border-slate-200 dark:border-slate-700"
          style={{ background: bgColor ?? "transparent" }}
          aria-label="preview"
        />
      </div>

      {onImagePick && (
        <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div className="text-xs font-medium text-slate-500">
            {t("background.imageLabel")}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex h-12 w-20 items-center justify-center overflow-hidden rounded border border-slate-300 bg-white disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
            >
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-5 w-5 text-slate-400" />
              )}
            </button>
            <div className="flex flex-col text-xs text-slate-500">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-left text-blue-600 hover:underline"
              >
                {preview
                  ? t("iconPicker.change")
                  : t("iconPicker.upload")}
              </button>
              {preview && onImageClear && (
                <button
                  type="button"
                  onClick={clearImage}
                  className="flex items-center gap-0.5 text-slate-500 hover:text-red-600"
                >
                  <X className="h-3 w-3" /> {t("background.clearImage")}
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link2 className="h-4 w-4 text-slate-400" />
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder={t("iconPicker.fromUrlPlaceholder")}
              disabled={busy}
              className="flex-1 min-w-[10rem] rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={fetchFromServer}
              disabled={!imageUrl.trim().startsWith("http") || busy}
              title={t("iconPicker.fetchUrlServerTitle")}
              className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Globe className="h-3 w-3" />
              {t("iconPicker.fetchUrl")}
            </button>
            <button
              type="button"
              onClick={fetchFromBrowser}
              disabled={
                !(
                  imageUrl.trim().startsWith("http") ||
                  imageUrl.trim().startsWith("data:")
                ) || busy
              }
              title={t("iconPicker.fetchUrlBrowserTitle")}
              className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <MonitorDown className="h-3 w-3" />
              {t("iconPicker.fetchUrlBrowser")}
            </button>
          </div>
          {msg && (
            <div className="text-xs text-slate-500" role="status">
              {msg}
            </div>
          )}
          <input
            ref={fileRef}
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
      )}
    </div>
  );
}
