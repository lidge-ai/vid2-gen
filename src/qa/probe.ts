import { open } from "node:fs/promises";
import { extname } from "node:path";
import { runChecked, Vid2Error } from "../shared/index.ts";
import type { QaFacts } from "./report.ts";

interface Stream { codec_type?: string; codec_name?: string; pix_fmt?: string; width?: number; height?: number;
  avg_frame_rate?: string; nb_read_frames?: string; duration?: string }
interface RawProbe { streams?: Stream[]; format?: { duration?: string; format_name?: string } }

async function faststart(path: string): Promise<boolean> {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(4 * 1024 * 1024);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    const moov = bytes.indexOf("moov");
    const mdat = bytes.indexOf("mdat");
    return moov >= 0 && mdat >= 0 && moov < mdat;
  } finally { await file.close(); }
}

function fpsNumber(fps: string): number {
  const [num, den] = fps.split("/").map(Number);
  return Number.isFinite(num) && Number.isFinite(den) && den! > 0 ? num! / den! : 0;
}

async function audioDuration(video: string, ffprobe: string, stream: Stream, formatDuration: string | undefined): Promise<number> {
  const direct = Number(stream.duration);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const packets = await runChecked(ffprobe, ["-v", "error", "-select_streams", "a:0", "-show_entries",
    "packet=pts_time,duration_time", "-of", "csv=p=0", video]);
  const last = packets.stdout.toString("utf8").trim().split(/\r?\n/).at(-1)?.split(",").map(Number);
  const seconds = last && last.length >= 2 ? last[0]! + last[1]! : Number(formatDuration);
  return Number.isFinite(seconds) ? seconds : Number(formatDuration);
}

/** Full ffprobe facts for QA, including counted video frames and container atoms. */
export async function probeQa(video: string, ffprobe: string): Promise<{ facts: QaFacts; raw: RawProbe }> {
  const result = await runChecked(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", video]);
  const raw = JSON.parse(result.stdout.toString("utf8")) as RawProbe;
  const image = raw.streams?.find((stream) => stream.codec_type === "video");
  if (!image?.width || !image.height) throw new Vid2Error("E_QA", "Media has no video stream");
  const audio = raw.streams?.find((stream) => stream.codec_type === "audio");
  const fps = image.avg_frame_rate ?? "0/1";
  const durationS = Number(image.duration ?? raw.format?.duration);
  const frames = Number(image.nb_read_frames);
  if (!Number.isFinite(durationS) && !Number.isFinite(frames)) throw new Vid2Error("E_QA", "Could not determine video duration");
  const suffix = extname(video).toLowerCase();
  const container = suffix === ".webm" ? "webm" : suffix === ".mov" ? "mov" : suffix === ".mp4" ? "mp4" : suffix.slice(1);
  const facts: QaFacts = { container, codec: image.codec_name ?? "unknown", pixFmt: image.pix_fmt ?? "unknown",
    width: image.width, height: image.height, fps, frames: Number.isFinite(frames) ? frames : Math.round(durationS * fpsNumber(fps)),
    durationS: Number.isFinite(durationS) ? durationS : frames / fpsNumber(fps),
    ...(["mp4", "mov"].includes(container) ? { faststart: await faststart(video) } : {}),
    ...(audio ? { audio: { codec: audio.codec_name ?? "unknown",
      durationS: await audioDuration(video, ffprobe, audio, raw.format?.duration) } } : {}) };
  return { facts, raw };
}
