import type { TwoFactorSetupResponse } from "@awesome-bookmarks/shared";
import { useMutation } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";

/**
 * Enrollment flow: POST /2fa/setup on mount to get a fresh secret + otpauth
 * URI, render the QR, then confirm with a code to enable. `onEnabled` fires
 * once the server has flipped 2FA on.
 */
export function TwoFactorEnroll({ onEnabled }: { onEnabled: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<TwoFactorSetupResponse | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .twoFactorSetup()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setLoadErr(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!data?.otpauthUri) return;
    QRCode.toDataURL(data.otpauthUri, { margin: 1, width: 200 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [data?.otpauthUri]);

  const enable = useMutation({
    mutationFn: () => api.twoFactorEnable(code.trim()),
    onSuccess: () => onEnabled(),
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  if (loadErr)
    return <div className="text-sm text-red-600">{t("common.error")}</div>;
  if (!data)
    return <div className="text-sm text-slate-400">{t("common.loading")}</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("twofa.enrollIntro")}
      </p>
      {qr && (
        <img
          src={qr}
          alt=""
          width={200}
          height={200}
          className="rounded border border-slate-200 dark:border-slate-800"
        />
      )}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        {t("twofa.manualEntry")}{" "}
        <code className="select-all break-all font-mono text-slate-700 dark:text-slate-200">
          {data.secret}
        </code>
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          if (code.trim().length >= 6) enable.mutate();
        }}
      >
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("twofa.codePlaceholder")}
          className="w-40 rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={code.trim().length < 6 || enable.isPending}
          className="block rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {enable.isPending ? t("common.saving") : t("twofa.enable")}
        </button>
      </form>
    </div>
  );
}
