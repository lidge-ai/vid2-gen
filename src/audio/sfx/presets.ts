export type SfxName = "whoosh" | "riser" | "click" | "impact" | "pop" | "type" | "swoosh-up" | "shimmer";
export type SfxAnchor = "start" | "peak" | "end";
export interface SfxPreset { durationS: number; peakS: number; anchor: SfxAnchor; gainDb: number; seed: number }

/** Synthesis timing and nominal mix gain. Peak offsets are measured from the WAV start. */
export const SFX_PRESETS: Record<SfxName, SfxPreset> = {
  whoosh: { durationS: 0.78, peakS: 0.38, anchor: "peak", gainDb: -7, seed: 3101 },
  riser: { durationS: 1.2, peakS: 1.196, anchor: "end", gainDb: -9, seed: 3102 },
  click: { durationS: 0.14, peakS: 0.002, anchor: "start", gainDb: -10, seed: 3103 },
  impact: { durationS: 0.72, peakS: 0.004, anchor: "start", gainDb: -5, seed: 3104 },
  pop: { durationS: 0.22, peakS: 0.007, anchor: "start", gainDb: -9, seed: 3105 },
  type: { durationS: 0.09, peakS: 0.002, anchor: "start", gainDb: -13, seed: 3106 },
  "swoosh-up": { durationS: 0.55, peakS: 0.32, anchor: "peak", gainDb: -8, seed: 3107 },
  shimmer: { durationS: 1.0, peakS: 0.25, anchor: "peak", gainDb: -11, seed: 3108 },
};
