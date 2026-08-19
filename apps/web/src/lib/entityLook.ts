import type React from "react";
import {
  contrastClass,
  resolveTone,
  useCardTone,
  useIsDarkPage,
  type Tone,
} from "./contrast.js";

/**
 * How a folder or bookmark card is painted, reduced to the three things that
 * decide it: the colour, the background image and the tone override.
 *
 * It exists so the owner's view and the shared views cannot drift. They render
 * different data (owned rows vs a group share's payload, whose images live at
 * a different URL), but a card that looks one way at home has to look the same
 * way to the person it was shared with, and that only holds if both go through
 * the same two functions.
 */
export interface EntityLook {
  bgColor: string | null | undefined;
  imageUrl: string | null;
  textTone: Tone | "auto" | null | undefined;
}

export function lookStyle(look: EntityLook): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (look.bgColor) s.backgroundColor = look.bgColor;
  if (look.imageUrl) {
    s.backgroundImage = `url('${look.imageUrl}')`;
    s.backgroundSize = "cover";
    s.backgroundPosition = "center";
  }
  return s;
}

/**
 * The class that forces readable text over a custom background; empty for the
 * default one, where the theme's own colours already apply.
 *
 * When the background is set but says nothing about tone (a translucent colour
 * lets the page through), the page theme decides rather than a fixed guess.
 * `textTone` overrides all of it when the user has chosen.
 */
export function useLookClass(look: EntityLook): string {
  const tone = useCardTone(look.bgColor, look.imageUrl);
  const isDark = useIsDarkPage();
  if (!look.bgColor && !look.imageUrl) return "";
  return contrastClass(resolveTone(tone, isDark, look.textTone));
}
