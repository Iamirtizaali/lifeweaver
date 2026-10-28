import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { UPLOAD_DIR } from "./db";

const EXT: Record<string, string> = { jpeg: "jpg", png: "png", webp: "webp" };
export const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Validate real image type by decoding, then store original + 1024px JPEG analysis copy. */
export async function storePhoto(id: string, buf: Buffer) {
  let format: string | undefined;
  try {
    format = (await sharp(buf).metadata()).format;
  } catch {
    format = undefined;
  }
  const ext = format ? EXT[format] : undefined;
  if (!ext) return { ok: false as const };
  const dir = path.join(UPLOAD_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const original = `${id}/original.${ext}`;
  const analysis = `${id}/analysis.jpg`;
  await fs.writeFile(path.join(UPLOAD_DIR, original), buf);
  await sharp(buf)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(path.join(UPLOAD_DIR, analysis));
  return { ok: true as const, original, analysis, mime: MIME[ext] };
}

/** Resolve a stored relative path, refusing anything outside the upload dir. */
export function uploadPath(rel: string) {
  const p = path.resolve(UPLOAD_DIR, rel);
  if (!p.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) throw new Error("bad path");
  return p;
}

export async function removePhotoFiles(id: string) {
  await fs.rm(uploadPath(id), { recursive: true, force: true });
}
