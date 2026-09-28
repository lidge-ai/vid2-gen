/** Content-addressed FFV1 cuts for sources read repeatedly by one segment. */
import { randomUUID } from "node:crypto";
import { rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { InputSpec, RenderPlan } from "../compile/ir.ts";
import { cacheDir, hashFile, hashJson, runChecked, Vid2Error } from "../shared/index.ts";

interface VideoFacts { pix_fmt?: string; color_range?: string; avg_frame_rate?: string; r_frame_rate?: string;
  nb_read_frames?: string; duration?: string }
export interface ProbeData { streams?: VideoFacts[]; format?: { duration?: string } }
export interface PretrimOptions { noCache?: boolean; hashes: Map<string, Promise<string>>; signal?: AbortSignal }
export interface PretrimResult { path: string; cached: boolean }

const locks = new Map<string, Promise<PretrimResult>>();

async function probe(ffprobe: string, path: string, countFrames = false): Promise<ProbeData> {
  const result = await runChecked(ffprobe, ["-v", "error", "-select_streams", "v:0", ...(countFrames ? ["-count_frames"] : []),
    "-show_entries", "stream=pix_fmt,color_range,avg_frame_rate,r_frame_rate,nb_read_frames,duration:format=duration",
    "-of", "json", path]);
  return JSON.parse(result.stdout.toString("utf8")) as ProbeData;
}

function frameSeconds(stream: VideoFacts): number {
  const rate = stream.avg_frame_rate && stream.avg_frame_rate !== "0/0" ? stream.avg_frame_rate : stream.r_frame_rate;
  const [numerator, denominator] = (rate ?? "0/0").split("/").map(Number);
  if (!numerator || !denominator) throw new Error("source frame rate unavailable");
  return denominator / numerator;
}

/** A read past the source end yields only the remaining frames; the segment graph's tpad holds the last one (wp5 hold). */
export function expectedCutSeconds(source: ProbeData, inSeconds: number, requested: number): number {
  const available = Number(source.format?.duration ?? source.streams?.[0]?.duration) - inSeconds;
  return Number.isFinite(available) && available > 0 ? Math.min(requested, available) : requested;
}

function checkCut(source: ProbeData, cut: ProbeData, durationSeconds: number): void {
  const original = source.streams?.[0];
  const result = cut.streams?.[0];
  if (!original || !result) throw new Error("video stream missing");
  const frames = Number(result.nb_read_frames);
  const duration = Number(cut.format?.duration ?? result.duration);
  if (!Number.isFinite(frames) || frames < 1) throw new Error("pretrim has no video frames");
  if (!Number.isFinite(duration) || Math.abs(duration - durationSeconds) > frameSeconds(original)) {
    throw new Error(`pretrim duration ${duration} differs from requested ${durationSeconds}`);
  }
  if (original.pix_fmt && result.pix_fmt !== original.pix_fmt) throw new Error("pretrim changed pix_fmt");
  if (original.color_range && result.color_range !== original.color_range) throw new Error("pretrim changed color_range");
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).size > 0; } catch { return false; }
}

async function cutFresh(input: NonNullable<InputSpec["pretrim"]>, plan: RenderPlan, target: string,
  opts: PretrimOptions): Promise<void> {
  const source = await probe(plan.tool.ffprobe, input.sourcePath);
  const stream = source.streams?.[0];
  if (!stream?.pix_fmt) throw new Error("source pixel format unavailable");
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp.mkv`;
  try {
    if (opts.signal?.aborted) throw new Error("pretrim interrupted");
    await runChecked(plan.tool.ffmpeg, ["-hide_banner", "-nostdin", "-y", "-v", "error",
      "-ss", String(input.inSeconds), "-i", input.sourcePath, "-t", String(input.durationSeconds),
      "-map", "0:v:0", "-an", "-c:v", "ffv1", "-pix_fmt", stream.pix_fmt,
      ...(stream.color_range ? ["-color_range", stream.color_range] : []), "-fps_mode", "passthrough", temp]);
    checkCut(source, await probe(plan.tool.ffprobe, temp, true), expectedCutSeconds(source, input.inSeconds, input.durationSeconds));
    await rename(temp, target);
  } finally { await rm(temp, { force: true }); }
}

/** Memoized hashes live for one render; callers share the map across parallel segments. */
export async function materializePretrim(input: NonNullable<InputSpec["pretrim"]>, plan: RenderPlan,
  segment: string, opts: PretrimOptions): Promise<PretrimResult> {
  const path = input.sourcePath;
  try {
    let digest = opts.hashes.get(path);
    if (!digest) { digest = hashFile(path); opts.hashes.set(path, digest); }
    const key = hashJson({ source: await digest, inSeconds: input.inSeconds,
      durationSeconds: input.durationSeconds, ffmpegVersion: plan.tool.version });
    const target = join(cacheDir("pretrim"), `${key}.mkv`);
    const existing = locks.get(key);
    if (existing) return await existing;
    const work = (async (): Promise<PretrimResult> => {
      if (!opts.noCache && await exists(target)) return { path: target, cached: true };
      await cutFresh(input, plan, target, opts);
      return { path: target, cached: false };
    })();
    locks.set(key, work);
    try { return await work; } finally { locks.delete(key); }
  } catch (cause) {
    throw new Vid2Error("E_RENDER", `pretrim failed for segment ${segment}`, { cause,
      details: { source: path, segment } });
  }
}
