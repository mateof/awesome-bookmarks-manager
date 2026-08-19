import { Github, Heart, MessageSquarePlus, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

const GH_PROFILE = "https://github.com/mateof";
const GH_REPO = "https://github.com/mateof/awesome-bookmarks-manager";
const GH_ISSUES =
  "https://github.com/mateof/awesome-bookmarks-manager/issues/new";
const GH_RELEASES =
  "https://github.com/mateof/awesome-bookmarks-manager/releases";

const linkCls =
  "flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="flex flex-wrap items-center justify-center gap-1">
          {t("footer.madeWithPrefix")}
          <Heart className="h-4 w-4 fill-red-500 text-red-500" aria-hidden />
          {t("footer.by")}
          <a
            href={GH_PROFILE}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-700 hover:underline dark:text-slate-200"
          >
            Mateo
          </a>
          {/* Baked in at build time, so what it says is the release this
              bundle came from and not whatever the server reports. */}
          <a
            href={GH_RELEASES}
            target="_blank"
            rel="noopener noreferrer"
            title={t("footer.versionTitle")}
            className="ml-1 rounded border border-slate-300 px-1.5 py-px font-mono text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            v{__APP_VERSION__}
          </a>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a href={GH_REPO} target="_blank" rel="noopener noreferrer" className={linkCls}>
            <Star className="h-4 w-4" /> {t("footer.star")}
          </a>
          <a href={GH_REPO} target="_blank" rel="noopener noreferrer" className={linkCls}>
            <Github className="h-4 w-4" /> {t("footer.viewRepo")}
          </a>
          <a href={GH_ISSUES} target="_blank" rel="noopener noreferrer" className={linkCls}>
            <MessageSquarePlus className="h-4 w-4" /> {t("footer.report")}
          </a>
        </div>
      </div>
    </footer>
  );
}
