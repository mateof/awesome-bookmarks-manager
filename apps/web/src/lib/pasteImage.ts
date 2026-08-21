/**
 * Turn a pasted/dropped/picked image into a data URL small enough to live
 * inside a description.
 *
 * Descriptions are sealed and stored as one field with a 1 MB cap, so images
 * are inlined as data URLs rather than uploaded: they ride inside the same
 * ciphertext, survive the .abz export, travel to group shares with the text,
 * and need no new endpoint or quota plumbing. The price is size, so anything
 * big is resized down and re-encoded before it goes in.
 */

/** Longest edge after resize. Screenshots stay readable; photos lose nothing
 * that matters inside a note. */
const MAX_EDGE = 1600;
/** A single image may not eat most of the 1 MB field. */
const MAX_DATA_URL = 700_000;

export function isImageFile(f: File | null | undefined): f is File {
  return !!f && f.type.startsWith("image/");
}

export async function imageFileToDataUrl(file: File): Promise<string> {
  // Small files go in untouched: re-encoding a 40 kB PNG into JPEG would only
  // lose its transparency for nothing.
  if (file.size <= 200_000) {
    const raw = await readAsDataUrl(file);
    if (raw.length <= MAX_DATA_URL) return raw;
  }

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  // JPEG has no alpha channel; paint the ground white so transparent regions
  // do not come out black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.85, 0.7, 0.5]) {
    const out = canvas.toDataURL("image/jpeg", quality);
    if (out.length <= MAX_DATA_URL) return out;
  }
  throw new Error("too-large");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("not-an-image"));
    };
    img.src = url;
  });
}
