import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "../shared/index.ts";
import type { AnalyzeReport } from "../analyze/types.ts";
import type { ReviewEvidence, ReviewImage } from "./types.ts";

const MAX_IMAGES = 24;
const MAX_BYTES = 6 * 1024 * 1024;

async function scaled(ffmpeg: string, source: string, target: string): Promise<boolean> {
  const result = await run(ffmpeg, ["-v", "error", "-i", source, "-vf",
    "scale=1280:1280:force_original_aspect_ratio=decrease", "-frames:v", "1", "-q:v", "5", "-y", target], { timeoutMs: 30_000 });
  return result.code === 0;
}

async function motion(ffmpeg: string, video: string, durationS: number, target: string): Promise<boolean> {
  const start = Math.max(0, Math.min(durationS - 1, durationS / 2 - 0.5));
  const result = await run(ffmpeg, ["-v", "error", "-ss", String(start), "-t", "1", "-i", video,
    "-vf", "fps=4,scale=320:320:force_original_aspect_ratio=decrease,tile=4x1", "-frames:v", "1",
    "-q:v", "5", "-y", target], { timeoutMs: 30_000 });
  return result.code === 0;
}

/** Build a bounded set of images without putting their bytes into evidence.json. */
export async function buildEvidence(input: { analyze: AnalyzeReport; qa: unknown; out: string; ffmpeg: string }): Promise<ReviewEvidence> {
  const dir = join(input.out, "images");
  await mkdir(dir, { recursive: true });
  const sources: { path: string; role: ReviewImage["role"] }[] = [
    ...input.analyze.artifacts.sheets.map((path) => ({ path, role: "sheet" as const })),
    ...(input.analyze.artifacts.spectrogram ? [{ path: input.analyze.artifacts.spectrogram, role: "spectrogram" as const }] : []),
    ...input.analyze.shots.map((shot) => ({ path: shot.keyframe, role: "keyframe" as const })),
  ];
  const images: ReviewImage[] = [];
  let total = 0;
  const add = async (path: string, role: ReviewImage["role"]): Promise<void> => {
    const bytes = (await stat(path)).size;
    if (images.length >= MAX_IMAGES || total + bytes > MAX_BYTES) return;
    images.push({ path, role, bytes }); total += bytes;
  };
  const motionPath = join(dir, "motion.jpg");
  if (await motion(input.ffmpeg, input.analyze.video, input.analyze.durationS, motionPath)) await add(motionPath, "motion");
  for (const [index, source] of sources.entries()) {
    if (images.length >= MAX_IMAGES) break;
    const path = join(dir, `frame-${index}.jpg`);
    if (await scaled(input.ffmpeg, source.path, path)) await add(path, source.role);
  }
  const evidence: ReviewEvidence = { version: 1, video: input.analyze.video, analyze: input.analyze, qa: input.qa, images };
  await writeFile(join(input.out, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  return evidence;
}
