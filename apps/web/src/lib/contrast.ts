import { useEffect, useState } from "react";

export type Tone = "light" | "dark" | null;

/**
 * Perceived luminance (0..1) of a CSS colour (hex `#rgb`/`#rrggbb`/`#rrggbbaa`
 * or `rgb()`/`rgba()`). Returns null when it can't be parsed or is too
 * translucent to imply a tone.
 */
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse `#rgb` / `#rrggbb` / `#rrggbbaa` / `rgb()` / `rgba()`. */
export function parseColor(color: string | null | undefined): Rgba | null {
  if (!color) return null;
  const c = color.trim();
  let r: number;
  let g: number;
  let b: number;
  let a = 1;

  const hex = c.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    let h = hex[1] ?? "";
    if (h.length === 3) {
      h = h
        .split("")
        .map((x) => x + x)
        .join("");
    }
    if (h.length !== 6 && h.length !== 8) return null;
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/i);
    if (!m || !m[1]) return null;
    const parts = m[1].split(",").map((x) => parseFloat(x.trim()));
    if (parts.length < 3) return null;
    r = parts[0] ?? 0;
    g = parts[1] ?? 0;
    b = parts[2] ?? 0;
    if (parts.length >= 4) a = parts[3] ?? 1;
  }

  return { r, g, b, a };
}

export function colorLuminance(color: string | null | undefined): number | null {
  const rgb = parseColor(color);
  if (!rgb || rgb.a < 0.5) return null;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

/** dark background (low luminance) -> light text; light background -> dark text. */
export function toneForLuminance(l: number | null): Tone {
  if (l === null) return null;
  return l < 0.5 ? "light" : "dark";
}

/**
 * WCAG relative luminance. Unlike the perceptual average above it applies the
 * sRGB gamma curve, which is what the contrast-ratio formula expects.
 */
function wcagLuminance(r: number, g: number, b: number): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two luminances, 1 (identical) to 21 (black/white). */
function ratio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = wcagLuminance(255, 255, 255);
const NEAR_BLACK = wcagLuminance(15, 23, 42); // slate-900, the text colour used

/**
 * Which text colour actually reads better on this background.
 *
 * A flat "luminance below 0.5 means light text" cut gets mid-tone colours
 * wrong, and greens and blues worst of all: their perceived brightness and
 * their WCAG luminance disagree. Comparing the real contrast ratio of the two
 * candidates picks the winner instead of guessing at a threshold.
 *
 * Returns null when the colour cannot be read (unparseable, or translucent
 * enough that what shows through decides the outcome).
 */
export function bestTextTone(color: string | null | undefined): Tone {
  const rgb = parseColor(color);
  if (!rgb || rgb.a < 0.5) return null;
  const bg = wcagLuminance(rgb.r, rgb.g, rgb.b);
  return ratio(bg, WHITE) >= ratio(bg, NEAR_BLACK) ? "light" : "dark";
}

/** Best-effort contrast of the winning text colour, for warning the user. */
export function bestContrastRatio(color: string | null | undefined): number | null {
  const rgb = parseColor(color);
  if (!rgb || rgb.a < 0.5) return null;
  const bg = wcagLuminance(rgb.r, rgb.g, rgb.b);
  return Math.max(ratio(bg, WHITE), ratio(bg, NEAR_BLACK));
}

const imgCache = new Map<string, number>();

/**
 * Average luminance (0..1) of a same-origin image, sampled once on a tiny
 * canvas and cached by URL. Returns null while loading or if it can't be read.
 */
export function useImageLuminance(url: string | null): number | null {
  const [lum, setLum] = useState<number | null>(() =>
    url ? (imgCache.get(url) ?? null) : null,
  );

  useEffect(() => {
    if (!url) {
      setLum(null);
      return;
    }
    const cached = imgCache.get(url);
    if (cached !== undefined) {
      setLum(cached);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = 24;
        const h = 24;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let sum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if ((data[i + 3] ?? 0) < 8) continue; // skip transparent pixels
          const rr = data[i] ?? 0;
          const gg = data[i + 1] ?? 0;
          const bb = data[i + 2] ?? 0;
          sum += (0.299 * rr + 0.587 * gg + 0.114 * bb) / 255;
          count++;
        }
        const l = count ? sum / count : 0.5;
        imgCache.set(url, l);
        if (!cancelled) setLum(l);
      } catch {
        /* cross-origin taint or decode error: leave the tone unknown */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return lum;
}

/**
 * Text tone for a card given its background colour and/or image. The image (if
 * any) sits on top of the colour, so it governs once sampled; until then we
 * fall back to the colour so there's no unreadable flash.
 */
export function useCardTone(
  bgColor: string | null | undefined,
  imageUrl: string | null,
): Tone {
  const imgLum = useImageLuminance(imageUrl);
  if (imageUrl && imgLum !== null) return toneForLuminance(imgLum);
  return bestTextTone(bgColor);
}

/**
 * Whether the page itself is currently dark.
 *
 * Needed as the fallback when a background colour tells us nothing: a
 * translucent colour lets the page show through, so the page is what the text
 * has to contrast against. Reading the class the theme module toggles keeps
 * this in step with light, dark and "system" alike.
 */
export function useIsDarkPage(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const target = document.documentElement;
    const update = () => setDark(target.classList.contains("dark"));
    const observer = new MutationObserver(update);
    observer.observe(target, { attributes: true, attributeFilter: ["class"] });
    update();
    return () => observer.disconnect();
  }, []);
  return dark;
}

/**
 * The tone to actually render with, never null.
 *
 * `override` is the user's explicit choice when they have made one. Otherwise
 * the background decides, and when the background cannot decide (translucent,
 * or unreadable) the page theme does. The previous code defaulted to dark text
 * regardless of theme, which is why a translucent colour on a dark page came
 * out as near-black text on a near-black banner.
 */
export function resolveTone(
  computed: Tone,
  isDarkPage: boolean,
  override?: Tone | "auto" | null,
): Exclude<Tone, null> {
  if (override === "light" || override === "dark") return override;
  if (computed) return computed;
  return isDarkPage ? "light" : "dark";
}

export function contrastClass(tone: Tone): string {
  if (tone === "light") return "on-dark-bg";
  if (tone === "dark") return "on-light-bg";
  return "";
}

/**
 * An opaque version of a panel template's `surface`.
 *
 * Several templates make the surface translucent, which is right for a card
 * floating over the page: the background scene shows through and the card sits
 * *in* the design. It is wrong for a modal, where whatever is behind it shows
 * through the text instead, and the more translucent the template, the less
 * readable it gets (one of the tree templates is 4% opaque).
 *
 * So the modal composites the surface over an opaque base rather than picking
 * an arbitrary panel colour: the result is the exact colour the card *appears*
 * to be over its own background, just without letting anything through.
 *
 * The base is the template's own `bg` when that is a plain colour. When it is
 * a gradient or an image (a string this cannot parse), the theme's text colour
 * decides: light text means the design is dark, so the base is near-black, and
 * the other way round. That is the same inference the rest of the panel makes.
 */
export function opaqueSurface(
  surface: string,
  bg: string,
  text: string,
): string {
  const s = parseColor(surface);
  const fallbackDark = (colorLuminance(text) ?? 0) > 0.5;
  const base =
    parseColor(bg) ??
    (fallbackDark
      ? { r: 17, g: 20, b: 26, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 });

  if (!s) {
    // An unparseable surface (a gradient of its own, say) cannot be
    // composited; the base alone is opaque and in keeping with the theme.
    return `rgb(${base.r}, ${base.g}, ${base.b})`;
  }
  if (s.a >= 0.99) return surface;

  const mix = (a: number, b: number) => Math.round(a * s.a + b * (1 - s.a));
  return `rgb(${mix(s.r, base.r)}, ${mix(s.g, base.g)}, ${mix(s.b, base.b)})`;
}
