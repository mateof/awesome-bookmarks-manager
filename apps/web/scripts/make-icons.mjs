import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generate the PWA icons committed under apps/web/public.
 *
 * Chrome only offers to install an app (and only then exposes it as a share
 * target) when the manifest ships raster icons at 192 and 512 px, so an SVG
 * alone will not do. Rather than add an image dependency for two flat shapes,
 * this writes the PNGs by hand: fill a buffer, deflate it, wrap it in the
 * three chunks a PNG needs.
 *
 * Run with: node apps/web/scripts/make-icons.mjs
 */

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [79, 70, 229]; // indigo-600, the app's accent
const FG = [255, 255, 255];

/** CRC-32, as PNG specifies it. */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** `pixels` is RGBA, row-major, width*height*4 bytes. */
function encodePng(width, height, pixels) {
  const stride = width * 4;
  // Every scanline is prefixed with its filter byte; 0 means "no filter".
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Signed distance to a rounded rectangle; negative inside. */
function roundedRectSdf(x, y, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(x - cx) - (halfW - r);
  const qy = Math.abs(y - cy) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * The bookmark ribbon: a rounded rectangle with a triangular notch cut out of
 * the bottom edge. Returns a signed distance so edges can be antialiased.
 */
function ribbonSdf(x, y, size) {
  const halfW = size * 0.17;
  const halfH = size * 0.25;
  const cx = size / 2;
  const cy = size * 0.47;
  const body = roundedRectSdf(x, y, cx, cy, halfW, halfH, size * 0.035);
  // Notch: a wedge cut out of the bottom edge, widest at the edge and
  // tapering to a point inside the ribbon — the classic bookmark tail.
  const bottom = cy + halfH;
  const notchTop = cy + halfH * 0.3;
  const t = (y - notchTop) / (bottom - notchTop);
  const notchHalf = halfW * t;
  const inNotch = y > notchTop && Math.abs(x - cx) < notchHalf;
  if (!inNotch) return body;
  return Math.max(body, notchHalf - Math.abs(x - cx));
}

/**
 * `maskable` variants are cropped to whatever shape the launcher likes, so the
 * background goes full-bleed and the ribbon shrinks into the 80%-diameter safe
 * zone. The plain variant keeps its own rounded square instead.
 */
function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const pad = size * 0.055;
  const cx = size / 2;
  const glyphScale = maskable ? 0.72 : 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = x + 0.5;
      const sy = y + 0.5;
      // Antialias by turning the signed distance into coverage over one pixel.
      const bgCov = maskable
        ? 1
        : clamp01(
            0.5 - roundedRectSdf(sx, sy, cx, cx, cx - pad, cx - pad, size * 0.22),
          );
      const gx = cx + (sx - cx) / glyphScale;
      const gy = cx + (sy - cx) / glyphScale;
      const fgCov = clamp01(0.5 - ribbonSdf(gx, gy, size) * glyphScale);
      const mix = Math.min(fgCov, bgCov);
      const i = (y * size + x) * 4;
      px[i] = Math.round(BG[0] * (1 - mix) + FG[0] * mix);
      px[i + 1] = Math.round(BG[1] * (1 - mix) + FG[1] * mix);
      px[i + 2] = Math.round(BG[2] * (1 - mix) + FG[2] * mix);
      px[i + 3] = Math.round(bgCov * 255);
    }
  }
  return encodePng(size, size, px);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log(`wrote ${file}`);
}
const maskable = join(OUT, "icon-maskable-512.png");
writeFileSync(maskable, render(512, { maskable: true }));
console.log(`wrote ${maskable}`);
