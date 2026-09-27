/**
 * Decode PNG/JPEG/WebP files to straight RGBA once per file at native resolution (long side capped), with ffmpeg through a bounded
 * stream (no new dependency). Fit and crop happen when a sprite is built, so animated sizes and several fits share one decode.
 */
import { spawn } from "node:child_process";
import { hashFile, runChecked, Vid2Error } from "../shared/index.ts";
import type { DecodedImage } from "./sprites.ts";

const memo = new Map<string, DecodedImage>();
export const MAX_IMAGE_SIDE = 2048;

async function dimensions(ffprobe: string, path: string): Promise<{ width: number; height: number }> {
  const out = await runChecked(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path]);
  const [w, h] = out.stdout.toString("utf8").trim().split("x").map(Number);
  if (!w || !h) throw new Vid2Error("E_INPUT", `cannot read image size: ${path}`);
  return { width: w, height: h };
}

export async function decodeImage(ffmpeg: string, ffprobe: string, path: string): Promise<DecodedImage> {
  const key = await hashFile(path);
  const hit = memo.get(key);
  if (hit) return hit;
  const native = await dimensions(ffprobe, path);
  const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(native.width, native.height));
  const w = Math.max(1, Math.round(native.width * k));
  const h = Math.max(1, Math.round(native.height * k));
  const data = await readRaw(ffmpeg, ["-v", "error", "-i", path, "-frames:v", "1", "-vf", `scale=${w}:${h}:flags=lanczos,format=rgba`,
    "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
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
