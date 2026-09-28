import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { num, quoteExpr } from "../compile/escape.ts";
import { runChecked } from "../shared/index.ts";
import type { ResolvedTimeline } from "../timeline/index.ts";
import type { QaFacts } from "./report.ts";

/** Frames per second from an ffprobe rate such as "30/1" or "30000/1001"; undefined when unknown. */
export function rateValue(rate: string | undefined): number | undefined {
  const [num_, den] = (rate ?? "").split("/").map(Number);
  const value = den === undefined ? num_ : num_! / den;
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Input args that land on frame n without decoding from the start. select=eq(n,N) decoded every earlier frame, so
 * QA on a 40 s 1080p film took minutes. Accurate input seek to half a frame early returns frame n first.
 */
export function frameSeekArgs(frame: number, fps: number | undefined): string[] {
  if (fps === undefined || frame <= 0) return [];
  return ["-ss", num((frame - 0.5) / fps)];
}

/** The input and filter args that yield exactly one frame n (then any extra filters). */
export function frameArgs(video: string, frame: number, fps: number | undefined, extra?: string): string[] {
  const seek = frameSeekArgs(frame, fps);
  const select = seek.length || frame <= 0 ? [] : [`select=${quoteExpr(`eq(n,${num(frame)})`)}`];
  const filters = [...select, ...(extra ? [extra] : [])];
  return [...seek, "-i", video, ...(filters.length ? ["-vf", filters.join(",")] : []), "-frames:v", "1"];
}

export async function extractStill(video: string, out: string, frame: number, ffmpeg: string, fps?: number): Promise<void> {
  await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...frameArgs(video, frame, fps), "-update", "1", out]);
}

/** Runs fn over items with at most limit in flight; results keep item order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) { const index = next++; results[index] = await fn(items[index]!, index); }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

function keyframeSlots(timeline: ResolvedTimeline, frames: number): { name: string; frame: number }[] {
  const result: { name: string; frame: number }[] = [];
  const add = (name: string, frame: number) => result.push({ name, frame: Math.max(0, Math.min(frames - 1, frame)) });
  for (const scene of timeline.scenes) {
    const id = scene.id.replace(/[^a-z0-9_-]/gi, "_");
    add(`${id}-start`, scene.startFrame);
    add(`${id}-mid`, scene.startFrame + Math.floor(scene.frames / 2));
    add(`${id}-end`, scene.startFrame + scene.frames - 1);
    if (scene.index > 0) {
      add(`${id}-seam-before`, scene.startFrame - 1);
      add(`${id}-seam-after`, scene.startFrame + 1);
    }
  }
  for (const [i, event] of (timeline.captureEvents ?? []).entries()) {
    add(`event-${i + 1}`, event.frame);
  }
  return result;
}

/** Contact sheet, scene/event stills and audio-only visual artifacts. */
export async function createArtifacts(video: string, out: string, facts: QaFacts, ffmpeg: string,
  timeline?: ResolvedTimeline): Promise<Record<string, string>> {
  await mkdir(out, { recursive: true });
  const artifacts: Record<string, string> = {};
  const contact = join(out, "contact.png");
  const rows = Math.max(1, Math.ceil(facts.durationS / 12));
  await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", video,
    "-vf", `fps=1/2,scale=480:-2,tile=6x${num(rows)}`, "-frames:v", "1", "-update", "1", contact]);
  artifacts["contact"] = contact;
  if (timeline) {
    const directory = join(out, "keyframes");
    await mkdir(directory, { recursive: true });
    const slots = keyframeSlots(timeline, facts.frames);
    const paths = await mapLimit(slots, 4, async (slot) => {
      const path = join(directory, `${slot.name}.png`);
      await extractStill(video, path, slot.frame, ffmpeg, rateValue(facts.fps));
      return path;
    });
    slots.forEach((slot, index) => { artifacts[slot.name] = paths[index]!; });
  }
  if (facts.audio) {
    for (const [name, filter, size] of [["waveform", "showwavespic", "1200x300"],
      ["spectrogram", "showspectrumpic", "1200x600"]] as const) {
      const path = join(out, `${name}.png`);
      await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", video,
        "-filter_complex", `[0:a]${filter}=s=${size}[picture]`, "-map", "[picture]",
        "-frames:v", "1", "-update", "1", path]);
      artifacts[name] = path;
    }
  }
  return artifacts;
}
