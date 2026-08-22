import { Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/**
 * "This is not yours, it reached you through a group, and here is what you may
 * do with it."
 *
 * Shared content opens on the ordinary pages now, which is the point: one
 * folder page rather than a full one and a reduced copy. What the reduced copy
 * did carry, and the ordinary page did not, was this piece of context. So it
 * moves here instead of being lost, and doubles as the way back to the list.
 */
export function SharedBadge({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/shared"
      title={t("shared.title")}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/70"
    >
      <Share2 className="h-3 w-3" />
      {t("folder.shared")}
      <span
        className={`rounded-full px-1.5 ${
          canWrite
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
            : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
        }`}
      >
        {canWrite ? t("shared.canEdit") : t("shared.readOnly")}
      </span>
    </Link>
  );
}
