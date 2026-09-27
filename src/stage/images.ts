/** Decode PNG/JPEG/WebP files to straight RGBA at an exact size with ffmpeg (bounded stream, no new dependency). */
import { spawn } from "node:child_process";
import { hashFile, Vid2Error } from "../shared/index.ts";
import type { DecodedImage } from "./sprites.ts";

const memo = new Map<string, DecodedImage>();

export async function decodeImage(ffmpeg: string, path: string, width: number, height: number, fit: "cover" | "contain"): Promise<DecodedImage> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const key = `${await hashFile(path)}|${w}x${h}|${fit}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const vf = fit === "cover" ? `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`
    : `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
  const data = await readRaw(ffmpeg, ["-v", "error", "-i", path, "-frames:v", "1", "-vf", `${vf},format=rgba`, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
    w * h * 4, path);
  const image = { width: w, height: h, data };
  memo.set(key, image);
  return image;
}

function readRaw(ffmpeg: string, args: string[], size: number, path: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const out = new Uint8Array(size);
    let offset = 0;
    let err = "";
    const child = spawn(ffmpeg, args, { windowsHide: true });
    child.stdout.on("data", (chunk: Buffer) => {
      if (offset + chunk.length > size) { child.kill(); reject(new Vid2Error("E_INPUT", `image decode produced too many bytes: ${path}`)); return; }
      out.set(chunk, offset);
      offset += chunk.length;
    });
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-2000); });
    child.on("error", (cause) => reject(new Vid2Error("E_RENDER", "ffmpeg could not start for image decode", { cause })));
    child.on("close", (code) => {
      if (code !== 0) reject(new Vid2Error("E_INPUT", `cannot decode image: ${path}`, { details: { stderr: err } }));
      else if (offset !== size) reject(new Vid2Error("E_INPUT", `image decode returned ${offset} of ${size} bytes: ${path}`));
      else resolve(out);
    });
  });
}
