/** Keyframe and optional audio spectrogram artifacts. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { extractStill, mapLimit } from "../qa/artifacts.ts";
import { runChecked } from "../shared/index.ts";
import type { ShotSpan } from "./types.ts";

export async function writeKeyframes(video: string, out: string, shots: ShotSpan[], ffmpeg: string, fps?: number): Promise<string[]> {
  const dir = join(out, "keyframes");
  await mkdir(dir, { recursive: true });
  return mapLimit(shots, 4, async (shot) => {
    const frame = Math.floor((shot.startFrame + shot.endFrame - 1) / 2);
    const path = join(dir, `${shot.id}.png`);
    await extractStill(video, path, frame, ffmpeg, fps);
    return path;
  });
}

export async function writeSpectrogram(video: string, out: string, ffmpeg: string): Promise<string> {
  const path = join(out, "spectrogram.png");
  await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", video,
    "-filter_complex", "[0:a]showspectrumpic=s=1280x320:legend=0[picture]", "-map", "[picture]",
    "-frames:v", "1", "-update", "1", path]);
  return path;
}
