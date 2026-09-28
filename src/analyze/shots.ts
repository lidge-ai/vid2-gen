/** Shot boundaries from authored scenes or FFmpeg's 0.30 scene score. */
import { runChecked, Vid2Error } from "../shared/index.ts";
import type { ResolvedTimeline } from "../timeline/index.ts";
import type { AnalyzeMethod, ShotSpan } from "./types.ts";

export interface ShotBoundary extends ShotSpan { sceneId: string | null }

export function timelineShots(timeline: ResolvedTimeline, frames: number, fps: number): ShotBoundary[] {
  const starts = timeline.scenes.map((scene) => ({ frame: scene.startFrame, sceneId: scene.id }));
  return spans(starts, frames, fps);
}

function spans(starts: { frame: number; sceneId: string | null }[], frames: number, fps: number): ShotBoundary[] {
  const unique = starts.filter(({ frame }, index) => frame >= 0 && frame < frames && (index === 0 || frame > starts[index - 1]!.frame));
  if (!unique.length || unique[0]!.frame !== 0) unique.unshift({ frame: 0, sceneId: null });
  return unique.map((entry, index) => {
    const endFrame = unique[index + 1]?.frame ?? frames;
    return { id: `shot-${String(index + 1).padStart(3, "0")}`, sceneId: entry.sceneId,
      startFrame: entry.frame, endFrame, startS: entry.frame / fps, endS: endFrame / fps };
  });
}

export async function detectShots(video: string, frames: number, fps: number, ffmpeg: string): Promise<ShotBoundary[]> {
  const result = await runChecked(ffmpeg, ["-hide_banner", "-i", video, "-vf",
    "select=gt(scene\\,0.30),showinfo", "-an", "-f", "null", "-"]);
  const cuts = [...result.stderr.matchAll(/pts_time:([\d.]+)/g)]
    .map((match) => Math.round(Number(match[1]) * fps)).filter((frame) => frame > 0 && frame < frames);
  const starts = [0, ...new Set(cuts)].sort((a, b) => a - b).map((frame) => ({ frame, sceneId: null }));
  return spans(starts, frames, fps);
}

export async function resolveShots(video: string, frames: number, fps: number, ffmpeg: string,
  timeline?: ResolvedTimeline): Promise<{ method: AnalyzeMethod; shots: ShotBoundary[] }> {
  if (frames < 1 || !Number.isFinite(fps) || fps <= 0) throw new Vid2Error("E_INPUT", "Video has no usable frames or frame rate");
  return timeline ? { method: "timeline", shots: timelineShots(timeline, frames, fps) } :
    { method: "scene-detect-0.30", shots: await detectShots(video, frames, fps, ffmpeg) };
}
