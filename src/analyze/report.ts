/** Cut timing and summary builders for AnalyzeReport v1. */
import { z } from "zod";
import { AUDIO_BANDS } from "./types.ts";
import type { AnalyzeCut, AnalyzeShot, AnalyzeSummary } from "./types.ts";

export function nearestDeltaMs(timeS: number, events: number[]): number | null {
  if (!events.length) return null;
  let nearest = events[0]! - timeS;
  for (const event of events) if (Math.abs(event - timeS) < Math.abs(nearest)) nearest = event - timeS;
  return nearest * 1000;
}

export function beatDeltaMs(timeS: number, bpm: number | null, offsetS: number): number | null {
  if (bpm === null) return null;
  const period = 60 / bpm;
  return (offsetS + Math.round((timeS - offsetS) / period) * period - timeS) * 1000;
}

export function buildCuts(shots: AnalyzeShot[], bpm: number | null, offsetS: number,
  onsets: number[] | null): AnalyzeCut[] {
  return shots.slice(1).map((shot) => ({ frame: shot.startFrame, s: shot.startS,
    beatDeltaMs: beatDeltaMs(shot.startS, bpm, offsetS),
    onsetDeltaMs: onsets === null ? null : nearestDeltaMs(shot.startS, onsets) }));
}

export function buildSummary(shots: AnalyzeShot[], cuts: AnalyzeCut[], fps: number,
  bpm: number | null, onsets: number[] | null): AnalyzeSummary {
  const lengths = shots.map((shot) => shot.seconds).sort((a, b) => a - b);
  const middle = Math.floor(lengths.length / 2);
  const histogram: Record<string, number> = {};
  if (bpm !== null) for (const shot of shots) {
    const key = String(Math.round(shot.seconds * bpm / 60 * 2) / 2);
    histogram[key] = (histogram[key] ?? 0) + 1;
  }
  return { shots: shots.length,
    asl: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
    medianShot: lengths.length ? lengths.length % 2 ? lengths[middle]! : (lengths[middle - 1]! + lengths[middle]!) / 2 : 0,
    cutsOnBeat: bpm === null ? null : cuts.filter((cut) => cut.beatDeltaMs !== null && Math.abs(cut.beatDeltaMs) <= 1000 / fps).length,
    cutsNearOnset: onsets === null ? null : cuts.filter((cut) => cut.onsetDeltaMs !== null && Math.abs(cut.onsetDeltaMs) <= 50).length,
    beatHistogram: histogram };
}


const finite = z.number().finite();
const nullableNumber = finite.nullable();
const shotSchema = z.strictObject({
  id: z.string(), sceneId: z.string().nullable(), startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(), startS: finite, endS: finite, seconds: finite,
  beats: nullableNumber, nearestBeatDeltaMs: nullableNumber, nearestOnsetDeltaMs: nullableNumber,
  motion: finite, meanLuma: finite, meanSaturation: finite, palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/)),
  keyframe: z.string(),
});
const cutSchema = z.strictObject({ frame: z.number().int().nonnegative(), s: finite,
  beatDeltaMs: nullableNumber, onsetDeltaMs: nullableNumber });
const audioSchema = z.strictObject({
  integratedLufs: finite, truePeakDbtp: finite, lra: finite,
  bands: z.array(z.strictObject({ name: z.enum(AUDIO_BANDS.map((band) => band.name)),
    fromHz: finite, toHz: finite, share: finite })),
  perShot: z.array(z.strictObject({ shotId: z.string(), lufs: nullableNumber, onsetDensity: finite })),
  onsets: z.array(finite), loudestS: finite, quietestS: finite,
  warnings: z.array(z.enum(["AUDIO_CLIPPING", "AUDIO_FLAT_DYNAMICS", "AUDIO_LOW_END_DOMINANT", "AUDIO_SILENT_SPAN"])),
});

/** Exact JSON contract validated before report.json is written. */
export const AnalyzeReportSchema = z.strictObject({
  version: z.literal(1), video: z.string(), method: z.enum(["timeline", "scene-detect-0.30"]),
  fps: finite, durationS: finite, bpm: nullableNumber, beatOffsetS: nullableNumber,
  shots: z.array(shotSchema), cuts: z.array(cutSchema),
  summary: z.strictObject({ shots: z.number().int().nonnegative(), asl: finite, medianShot: finite,
    cutsOnBeat: z.number().int().nonnegative().nullable(), cutsNearOnset: z.number().int().nonnegative().nullable(),
    beatHistogram: z.record(z.string(), z.number().int().nonnegative()) }),
  audio: audioSchema.nullable(),
  artifacts: z.strictObject({ dir: z.string(), report: z.string(), keyframes: z.string(),
    sheets: z.array(z.string()), sheetIndex: z.string(), spectrogram: z.string().nullable() }),
  warnings: z.array(z.string()),
});
