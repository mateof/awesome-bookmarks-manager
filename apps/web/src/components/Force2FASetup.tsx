import { useTranslation } from "react-i18next";
import { useAuth } from "../auth.js";
import { TwoFactorEnroll } from "./TwoFactorEnroll.js";

/**
 * Full-screen gate shown when an admin has made 2FA mandatory and this account
 * hasn't enrolled yet. Blocks the app until 2FA is set up.
 */
export function Force2FASetup() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-96 max-w-full space-y-3 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-lg font-semibold">{t("twofa.forcedTitle")}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("twofa.forcedIntro")}
        </p>
        <TwoFactorEnroll onEnabled={refresh} />
      </div>
    </div>
  );
}
