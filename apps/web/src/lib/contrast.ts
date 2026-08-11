import { useEffect, useState } from "react";

export type Tone = "light" | "dark" | null;

/**
 * Perceived luminance (0..1) of a CSS colour (hex `#rgb`/`#rrggbb`/`#rrggbbaa`
 * or `rgb()`/`rgba()`). Returns null when it can't be parsed or is too
 * translucent to imply a tone.
 */
export function colorLuminance(color: string | null | undefined): number | null {
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

  if (a < 0.5) return null;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** dark background (low luminance) -> light text; light background -> dark text. */
export function toneForLuminance(l: number | null): Tone {
  if (l === null) return null;
  return l < 0.5 ? "light" : "dark";
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
  return toneForLuminance(colorLuminance(bgColor));
}

export function contrastClass(tone: Tone): string {
  if (tone === "light") return "on-dark-bg";
  if (tone === "dark") return "on-light-bg";
  return "";
}
