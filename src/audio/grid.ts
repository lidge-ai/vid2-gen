import type { Fps } from "../shared/index.ts";

export interface BeatGridSeconds { bpm: number; offset: number; meter?: number }

export function beatTime(k: number, grid: BeatGridSeconds): number {
  if (!Number.isFinite(grid.bpm) || grid.bpm <= 0 || !Number.isFinite(k)) throw new RangeError("invalid beat grid");
  return grid.offset + k * 60 / grid.bpm;
}

export function snapToBeat(t: number, grid: BeatGridSeconds,
  opts: { win?: number; leadFrames?: number; fps?: Fps } = {}): number {
  const win = opts.win ?? 0.12;
  const fps = opts.fps ?? { num: 30, den: 1 };
  const nearest = Math.round((t - grid.offset) * grid.bpm / 60);
  const candidate = beatTime(nearest, grid);
  if (Math.abs(candidate - t) > win) return t;
  return Math.max(0, candidate - (opts.leadFrames ?? 1) * fps.den / fps.num);
}
