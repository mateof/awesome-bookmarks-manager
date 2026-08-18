import type { PeerCertificate } from "@awesome-bookmarks/shared";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";

/**
 * Offers to trust the certificate a server is presenting.
 *
 * Shown when a connection fails because no public CA vouches for the
 * certificate, which on a LAN NAS is the normal state of affairs: Synology
 * ships a self-signed one, and it is issued for a hostname while people reach
 * the box by IP.
 *
 * What it does *not* do is offer "accept any certificate". The fingerprint is
 * shown and, once accepted, only that exact certificate is accepted from then
 * on, so an impostor on the network still gets refused. That is why the
 * fingerprint is displayed rather than hidden behind a checkbox: it is the
 * thing the user is actually deciding about, and on a NAS it can be checked
 * against DSM's own certificate panel.
 */
export function CertificateTrust({
  url,
  onTrust,
}: {
  url: string;
  onTrust: (fingerprint: string) => void;
}) {
  const { t } = useTranslation();
  const [cert, setCert] = useState<PeerCertificate | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const inspect = useMutation({
    mutationFn: () => api.inspectCertificate(url),
    onSuccess: (c) => {
      setErr(null);
      setCert(c);
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  return (
    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex items-start gap-2">
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-amber-900 dark:text-amber-200">
            {t("cert.explain")}
          </p>

          {!cert && (
            <button
              type="button"
              disabled={inspect.isPending}
              onClick={() => inspect.mutate()}
              className="rounded-lg border border-amber-400 px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              {inspect.isPending ? t("common.loading") : t("cert.inspect")}
            </button>
          )}

          {err && <p className="text-red-700 dark:text-red-300">{err}</p>}

          {cert && (
            <div className="space-y-2">
              <dl className="space-y-1">
                <Row label={t("cert.subject")} value={cert.subject} />
                <Row label={t("cert.issuer")} value={cert.issuer} />
                <Row label={t("cert.validTo")} value={cert.validTo} />
                <div>
                  <dt className="text-amber-800 dark:text-amber-300">
                    {t("cert.fingerprint")}
                  </dt>
                  <dd className="break-all font-mono text-[11px] text-amber-900 dark:text-amber-100">
                    {cert.fingerprint}
                  </dd>
                </div>
              </dl>
              <p className="text-amber-800 dark:text-amber-300">
                {t("cert.compareHint")}
              </p>
              <button
                type="button"
                onClick={() => onTrust(cert.fingerprint)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> {t("cert.trust")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-amber-800 dark:text-amber-300">{label}:</dt>
      <dd className="min-w-0 break-all text-amber-900 dark:text-amber-100">
        {value}
      </dd>
    </div>
  );
}

/** True when a failure looks like "no CA vouches for this certificate". */
export function looksLikeCertError(message: string): boolean {
  return /certificad|certificate|self[- ]signed|ALTNAME|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(
    message,
  );
}

/** Trusted certificate badge, once a fingerprint has been accepted. */
export function TrustedCertBadge({ fingerprint }: { fingerprint: string }) {
  const { t } = useTranslation();
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      {t("cert.trusted", { short: fingerprint.slice(0, 17) })}
    </p>
  );
}
