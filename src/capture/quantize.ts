import { copyFile, link, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fpsString, runChecked, Vid2Error } from "../shared/index.ts";
import type { Fps } from "../shared/index.ts";
import type { CaptureAction } from "./session.ts";
import { CaptureActionSchema, mapEventFrame } from "./session.ts";

export interface CapturedFrame { n: number; tMs: number; file: string }
export interface QuantizeOptions { dir: string; frames: CapturedFrame[]; actions: (Omit<CaptureAction, "frame"> & { frame?: number })[];
  fps: Fps; endMs: number; ffmpeg: string }
export interface QuantizedCapture { footage: string; actions: CaptureAction[]; width: number; height: number; slots: number }

/** Read dimensions from a JPEG SOF marker, independent of libavcodec bindings. */
export function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Vid2Error("E_CAPABILITY", "CDP frame is not a JPEG");
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xff || marker === 0x00 || marker >= 0xd0 && marker <= 0xd7) { offset += 2; continue; }
    const size = bytes.readUInt16BE(offset + 2);
    if (size < 2 || offset + 2 + size > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + size;
  }
  throw new Vid2Error("E_CAPABILITY", "Could not read CDP JPEG geometry");
}

/** Each CFR slot uses the latest source frame whose rounded slot has arrived. */
export function quantize(frames: { n: number; tMs: number }[], endMs: number, fps: Fps): number[] {
  const slots = Math.max(0, Math.round(endMs / 1000 * fps.num / fps.den));
  if (!frames.length) return [];
  const ordered = frames.map((frame, index) => ({ ...frame, index }))
    .sort((a, b) => a.tMs - b.tMs || a.n - b.n);
  const result: number[] = [];
  let source = 0;
  for (let slot = 0; slot < slots; slot++) {
    while (source + 1 < ordered.length && mapEventFrame(ordered[source + 1]!.tMs, fps) <= slot) source++;
    result.push(ordered[source]!.index);
  }
  return result;
}

/** Link/copy captured JPEGs into an image2 sequence, encode CFR footage, and map actions to its slots. */
export async function finalizeFrames(opts: QuantizeOptions): Promise<QuantizedCapture> {
  const slots = quantize(opts.frames, opts.endMs, opts.fps);
  if (!slots.length) throw new Vid2Error("E_RENDER", "No screencast frames to encode");
  const first = opts.frames[slots[0]!]!;
  const { width, height } = jpegDimensions(await readFile(first.file));
  const seq = join(opts.dir, "seq");
  await mkdir(seq, { recursive: true });
  for (let i = 0; i < slots.length; i++) {
    const from = opts.frames[slots[i]!]!.file;
    const to = join(seq, `${String(i).padStart(6, "0")}.jpg`);
    try { await link(from, to); } catch { await copyFile(from, to); }
  }
  const footage = join(opts.dir, "footage.mp4");
  await runChecked(opts.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", fpsString(opts.fps),
    "-i", join(seq, "%06d.jpg"), "-frames:v", String(slots.length), "-vf", "scale=w=trunc(iw/2)*2:h=trunc(ih/2)*2:out_range=tv",
    "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-color_range", "tv", "-movflags", "+faststart", footage]);
  const actions = opts.actions.map((action) => CaptureActionSchema.parse({ ...action, frame: mapEventFrame(action.tMs, opts.fps) }));
  await writeFile(join(opts.dir, "frames.jsonl"), opts.frames.map((frame) =>
    JSON.stringify({ n: frame.n, tMs: frame.tMs, w: width, h: height })).join("\n") + "\n");
  return { footage, actions, width: width - width % 2, height: height - height % 2, slots: slots.length };
}
