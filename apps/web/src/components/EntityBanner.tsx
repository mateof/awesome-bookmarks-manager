import type { ReactNode } from "react";

/**
 * siyuan-style cover header shown at the top of a folder or bookmark when it
 * has a background image or colour: a wide banner with the icon and title
 * overlaid, and optional action controls in the corner.
 */
export function EntityBanner({
  imageUrl,
  bgColor,
  icon,
  title,
  subtitle,
  actions,
}: {
  imageUrl?: string | null;
  bgColor?: string | null;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const hasImage = !!imageUrl;
  return (
    <div className="relative h-32 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 sm:h-40">
      <div
        className="absolute inset-0"
        style={
          hasImage
            ? {
                backgroundImage: `url('${imageUrl}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : { background: bgColor ?? "#e2e8f0" }
        }
      />
      {hasImage && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      )}

      {actions && (
        <div className="absolute right-2 top-2 flex flex-wrap items-center gap-2 rounded-lg bg-white/80 p-1 backdrop-blur dark:bg-slate-900/70">
          {actions}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
        {icon}
        <div className="min-w-0 flex-1">
          <h1
            className={`truncate text-xl font-semibold ${
              hasImage
                ? "text-white drop-shadow-md"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <div
              className={`truncate text-sm ${
                hasImage
                  ? "text-white/85 drop-shadow"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
