import { open } from "node:fs/promises";
import { runChecked, Vid2Error } from "../shared/index.ts";

interface ProbeStream { width?: number; height?: number; nb_read_packets?: string; pix_fmt?: string; color_range?: string }
export interface ExpectedVideo { width: number; height: number; frames: number; pixFmt?: string; range?: string; faststart?: boolean }
export interface VerifiedVideo { width: number; height: number; frames: number; pixFmt: string; range: string | undefined }

function mismatch(path: string, field: string, expected: unknown, actual: unknown): never {
  throw new Vid2Error("E_RENDER", `Output verification failed: ${field}`, { details: { path, field, expected, actual } });
}

async function checkFaststart(path: string): Promise<void> {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(4 * 1024 * 1024);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const start = buffer.subarray(0, bytesRead);
    const moov = start.indexOf("moov");
    const mdat = start.indexOf("mdat");
    if (moov < 0 || mdat < 0 || moov > mdat) mismatch(path, "faststart", "moov before mdat", { moov, mdat });
  } finally { await file.close(); }
}

/** Probe packet count and visible stream properties after every encode. */
export async function verifyVideo(path: string, ffprobe: string, expected: ExpectedVideo): Promise<VerifiedVideo> {
  const result = await runChecked(ffprobe, ["-v", "error", "-select_streams", "v:0", "-count_packets",
    "-show_entries", "stream=width,height,nb_read_packets,pix_fmt,color_range", "-of", "json", path]);
  const parsed = JSON.parse(result.stdout.toString("utf8")) as { streams?: ProbeStream[] };
  const stream = parsed.streams?.[0];
  if (!stream) mismatch(path, "stream", "one video stream", "missing");
  const frames = Number(stream.nb_read_packets);
  if (stream.width !== expected.width) mismatch(path, "width", expected.width, stream.width);
  if (stream.height !== expected.height) mismatch(path, "height", expected.height, stream.height);
  if (!Number.isFinite(frames) || Math.abs(frames - expected.frames) > 1) mismatch(path, "frames", expected.frames, frames);
  if (expected.pixFmt && stream.pix_fmt !== expected.pixFmt) mismatch(path, "pix_fmt", expected.pixFmt, stream.pix_fmt);
  // H.264 commonly omits the default limited-range flag; reject explicit disagreement.
  if (expected.range && stream.color_range && stream.color_range !== expected.range) {
    mismatch(path, "color_range", expected.range, stream.color_range);
  }
  if (expected.faststart) await checkFaststart(path);
  return { width: stream.width, height: stream.height, frames, pixFmt: stream.pix_fmt ?? "unknown", range: stream.color_range };
}
