/** Low-resolution frame statistics; signalstats supplies luma/saturation metadata. */
import { runChecked } from "../shared/index.ts";
import type { ShotSpan } from "./types.ts";

const WIDTH = 64;
const HEIGHT = 36;
const BYTES = WIDTH * HEIGHT * 3;
export interface ShotMetrics { motion: number; meanLuma: number; meanSaturation: number; palette: string[] }

function palette(hist: Map<number, number>): string[] {
  return [...hist].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5)
    .map(([rgb]) => `#${rgb.toString(16).padStart(6, "0")}`);
}

function frameStats(data: Buffer, shots: ShotSpan[]): Map<string, { motion: number; count: number; hist: Map<number, number> }> {
  const out = new Map(shots.map((shot) => [shot.id, { motion: 0, count: 0, hist: new Map<number, number>() }]));
  let shotIndex = 0;
  for (let frame = 0; frame < Math.floor(data.length / BYTES); frame++) {
    while (shotIndex + 1 < shots.length && frame >= shots[shotIndex]!.endFrame) shotIndex++;
    const shot = shots[shotIndex];
    if (!shot || frame < shot.startFrame || frame >= shot.endFrame) continue;
    const entry = out.get(shot.id)!;
    const start = frame * BYTES;
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
      const offset = start + pixel * 3;
      const r = data[offset]!, g = data[offset + 1]!, b = data[offset + 2]!;
      const color = ((r >> 5) << 21) | ((g >> 5) << 13) | ((b >> 5) << 5);
      entry.hist.set(color, (entry.hist.get(color) ?? 0) + 1);
      if (frame > shot.startFrame) for (let channel = 0; channel < 3; channel++)
        entry.motion += Math.abs(data[offset + channel]! - data[offset + channel - BYTES]!);
    }
    entry.count++;
  }
  return out;
}

function signalValues(text: string): { y: number[]; sat: number[] } {
  return { y: [...text.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1])),
    sat: [...text.matchAll(/lavfi\.signalstats\.SATAVG=([\d.]+)/g)].map((m) => Number(m[1])) };
}

export async function measureShots(video: string, shots: ShotSpan[], ffmpeg: string): Promise<ShotMetrics[]> {
  const rgb = await runChecked(ffmpeg, ["-v", "error", "-i", video, "-vf", `scale=${WIDTH}:${HEIGHT}`,
    "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  const stats = await runChecked(ffmpeg, ["-v", "error", "-i", video, "-vf", "signalstats,metadata=print:file=-",
    "-an", "-f", "null", "-"]);
  const values = signalValues(stats.stdout.toString("utf8") + stats.stderr);
  const frames = frameStats(rgb.stdout, shots);
  return shots.map((shot) => {
    const entry = frames.get(shot.id)!;
    const start = shot.startFrame, end = Math.min(shot.endFrame, values.y.length);
    const mean = (arr: number[]): number => { const slice = arr.slice(start, end); return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0; };
    return { motion: entry.count > 1 ? entry.motion / ((entry.count - 1) * BYTES) : 0,
      meanLuma: mean(values.y), meanSaturation: mean(values.sat), palette: palette(entry.hist) };
  });
}
