/** Rational frame rates and time literals. All timeline positions resolve to integer frames. */
import { Vid2Error } from "./errors.ts";

export interface Fps { num: number; den: number }
export type TimeUnit = "s" | "f" | "b" | "bar";
export interface TimeLiteralValue { unit: TimeUnit; value: number }
export interface BeatGrid { bpm: number; offsetFrames: number; meter: number }

const NTSC: Record<string, Fps> = {
  "23.976": { num: 24000, den: 1001 }, "29.97": { num: 30000, den: 1001 }, "59.94": { num: 60000, den: 1001 },
};

export function parseFps(v: number | string): Fps {
  const s = String(v).trim();
  const ntsc = NTSC[s];
  if (ntsc) return ntsc;
  const ratio = /^(\d+)\/(\d+)$/.exec(s);
  if (ratio) {
    const num = Number(ratio[1]);
    const den = Number(ratio[2]);
    if (num > 0 && den > 0) return { num, den };
  }
  if (/^\d+$/.test(s) && Number(s) > 0) return { num: Number(s), den: 1 };
  throw new Vid2Error("E_SCHEMA", `invalid fps: ${s}`, { fix: 'use an integer like 30 or a ratio like "30000/1001"' });
}

export const fpsValue = (f: Fps): number => f.num / f.den;
export const secondsToFrames = (s: number, f: Fps): number => Math.round((s * f.num) / f.den);
export const framesToSeconds = (n: number, f: Fps): number => (n * f.den) / f.num;
export const fpsString = (f: Fps): string => (f.den === 1 ? String(f.num) : `${f.num}/${f.den}`);

const LITERAL = /^(\d+(?:\.\d+)?)(s|ms|f|bar|b)$/;

export function parseTimeLiteral(v: number | string): TimeLiteralValue {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) throw new Vid2Error("E_SCHEMA", `invalid time: ${v}`);
    return { unit: "s", value: v };
  }
  const m = LITERAL.exec(v.trim());
  if (!m) throw new Vid2Error("E_SCHEMA", `invalid time literal: ${v}`, { fix: 'use seconds (1.5 or "1.5s"), "1500ms", frames "45f", beats "2b" or bars "1bar"' });
  const value = Number(m[1]);
  const unit = m[2];
  if (unit === "ms") return { unit: "s", value: value / 1000 };
  return { unit: unit as TimeUnit, value };
}

/** Signed durations such as "-0.5s" used by event/marker offsets. */
export function parseSignedLiteral(v: string): { sign: 1 | -1; lit: TimeLiteralValue } {
  const t = v.trim();
  if (t.startsWith("-")) return { sign: -1, lit: parseTimeLiteral(t.slice(1)) };
  return { sign: 1, lit: parseTimeLiteral(t.startsWith("+") ? t.slice(1) : t) };
}

/** Unrounded seconds for authored time; frame literals remain integral. */
export function toSeconds(lit: TimeLiteralValue, ctx: { fps: Fps; beat?: BeatGrid }): number {
  if (lit.unit === "s") return lit.value;
  if (lit.unit === "f") return framesToSeconds(Math.round(lit.value), ctx.fps);
  if (!ctx.beat) throw new Vid2Error("E_SCHEMA", "beat units need a beat grid", { fix: 'add "beat": {"bpm": 120} to the timeline' });
  const beats = lit.unit === "bar" ? lit.value * ctx.beat.meter : lit.value;
  return beats * 60 / ctx.beat.bpm;
}

export function toFrames(lit: TimeLiteralValue, ctx: { fps: Fps; beat?: BeatGrid }, kind: "position" | "duration"): number {
  const frames = secondsToFrames(toSeconds(lit, ctx), ctx.fps);
  return kind === "position" && (lit.unit === "b" || lit.unit === "bar") ? (ctx.beat?.offsetFrames ?? 0) + frames : frames;
}
