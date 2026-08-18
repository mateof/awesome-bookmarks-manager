import type { ReactNode } from "react";
import type { Tone } from "../lib/contrast.js";
import { bestTextTone, resolveTone, useIsDarkPage } from "../lib/contrast.js";

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
  textTone,
}: {
  imageUrl?: string | null;
  bgColor?: string | null;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** User's explicit choice, when they made one. */
  textTone?: Tone | "auto" | null;
}) {
  const hasImage = !!imageUrl;
  const isDarkPage = useIsDarkPage();
  // An image always gets a dark scrim, so white reads over any of them. For a
  // plain colour the winner is whichever of white/near-black has the better
  // contrast ratio against it.
  //
  // When the colour says nothing (translucent, so the page shows through, or
  // unparseable) the *page theme* decides. The previous version fell back to
  // dark text unconditionally, which is how a translucent colour on a dark
  // page ended up as near-black text on a near-black banner.
  const light = hasImage
    ? true
    : resolveTone(bestTextTone(bgColor), isDarkPage, textTone) === "light";
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
      {/* A scrim behind the text, not only over images. A mid-tone colour is
          the case where neither white nor near-black is comfortable, and a
          gentle wash in the opposite direction settles it without asking the
          user for anything. */}
      <div
        className={`absolute inset-0 bg-gradient-to-t ${
          light
            ? "from-black/60 via-black/10 to-transparent"
            : "from-white/70 via-white/20 to-transparent"
        }`}
      />

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
              light ? "text-white drop-shadow-md" : "text-slate-900"
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <div
              className={`truncate text-sm ${
                light ? "text-white/85 drop-shadow" : "text-slate-700"
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
