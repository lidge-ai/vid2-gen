import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { num, quoteExpr } from "../compile/escape.ts";
import { runChecked } from "../shared/index.ts";
import type { ResolvedTimeline } from "../timeline/index.ts";
import type { QaFacts } from "./report.ts";

async function still(video: string, out: string, frame: number, ffmpeg: string): Promise<void> {
  const filter = `select=${quoteExpr(`eq(n,${num(frame)})`)}`;
  await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", video,
    "-vf", filter, "-frames:v", "1", "-update", "1", out]);
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
    for (const slot of keyframeSlots(timeline, facts.frames)) {
      const path = join(directory, `${slot.name}.png`);
      await still(video, path, slot.frame, ffmpeg);
      artifacts[slot.name] = path;
    }
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
