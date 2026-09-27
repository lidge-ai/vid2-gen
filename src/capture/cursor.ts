import type { Fps } from "../shared/time.ts";
import type { CaptureAction } from "./session.ts";
import { stepSpring } from "./spring.ts";
import type { SpringState } from "./spring.ts";

export interface CursorAction { frame: number; point: { x: number; y: number }; kind: CaptureAction["kind"] | "move" }
export interface CursorOptions { fps: Fps; frames: number; width: number; height: number }
export interface CursorRipple { x: number; y: number; age: number }
export interface CursorSample { frame: number; x: number; y: number; scale: number; alpha: number; ripples: CursorRipple[] }
export interface Sprite { width: number; height: number; rgba: Uint8Array }

const SPRING = { stiffness: 530, damping: 40, mass: 1 };
function clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)); }
function seconds(frames: number, fps: Fps): number { return frames * fps.den / fps.num; }

/** Cursor samples are on the layer-relative timeline clock, one per output frame. */
export function planCursor(actions: CursorAction[], opts: CursorOptions): CursorSample[] {
  if (opts.frames <= 0 || opts.width <= 0 || opts.height <= 0 || opts.fps.num <= 0 || opts.fps.den <= 0) return [];
  const ordered = [...actions].filter((action) => Number.isFinite(action.frame) && action.frame >= 0 && action.frame < opts.frames)
    .sort((a, b) => a.frame - b.frame);
  if (!ordered.length) return [];
  let x: SpringState = { value: clamp(ordered[0]!.point.x, 0, opts.width), velocity: 0 };
  let y: SpringState = { value: clamp(ordered[0]!.point.y, 0, opts.height), velocity: 0 };
  const dt = opts.fps.den / opts.fps.num;
  const samples: CursorSample[] = [];
  let latest = -1;
  for (let frame = 0; frame < opts.frames; frame++) {
    while (ordered[latest + 1] && ordered[latest + 1]!.frame <= frame) latest++;
    const upcoming = ordered.find((action) => action.kind === "click" && action.frame >= frame && seconds(action.frame - frame, opts.fps) <= 0.5);
    const point = upcoming?.point ?? ordered[Math.max(0, latest)]!.point;
    if (frame > 0) {
      x = stepSpring(x, clamp(point.x, 0, opts.width), dt, SPRING);
      y = stepSpring(y, clamp(point.y, 0, opts.height), dt, SPRING);
    }
    const idle = upcoming ? 0 : latest < 0 ? Infinity : seconds(frame - ordered[latest]!.frame, opts.fps);
    const alpha = clamp((0.9 - idle) / 0.4, 0, 1);
    const click = ordered.slice(0, latest + 1).findLast((action) => action.kind === "click");
    const clickAge = click ? seconds(frame - click.frame, opts.fps) : Infinity;
    const ripples = ordered.slice(0, latest + 1).filter((action) => action.kind === "click")
      .map((action) => ({ x: clamp(action.point.x, 0, opts.width), y: clamp(action.point.y, 0, opts.height),
        age: seconds(frame - action.frame, opts.fps) }))
      .filter((ripple) => ripple.age < 0.6).slice(-6);
    samples.push({ frame, x: clamp(x.value, 0, opts.width), y: clamp(y.value, 0, opts.height),
      scale: clickAge < 0.13 ? 0.8 : 1, alpha, ripples });
  }
  return samples;
}

function polygon(x: number, y: number, points: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!, b = points[j]!;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function cursorCoverage(style: "arrow" | "dot", x: number, y: number): { outer: boolean; inner: boolean } {
  if (style === "dot") {
    const d = Math.hypot(x - 0.5, y - 0.5);
    return { outer: d <= 0.48, inner: d <= 0.36 };
  }
  const points: [number, number][] = [[0.06, 0.02], [0.06, 0.88], [0.28, 0.68], [0.42, 0.98],
    [0.62, 0.89], [0.48, 0.62], [0.82, 0.62]];
  return { outer: polygon(x, y, points), inner: polygon((x - 0.38) / 0.82 + 0.38, (y - 0.5) / 0.82 + 0.5, points) };
}

/** Antialiased white cursor with dark outline; main encodes the RGBA bytes as PNG. */
export function cursorSprite(style: "arrow" | "dot", heightPx: number): Sprite {
  if (!Number.isInteger(heightPx) || heightPx < 2) throw new RangeError("cursor height must be an integer >= 2");
  const width = style === "dot" ? heightPx : Math.max(2, Math.round(heightPx * 0.72));
  const rgba = new Uint8Array(width * heightPx * 4);
  for (let y = 0; y < heightPx; y++) for (let x = 0; x < width; x++) {
    let outer = 0, inner = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const hit = cursorCoverage(style, (x + (sx + 0.5) / 4) / width, (y + (sy + 0.5) / 4) / heightPx);
      if (hit.outer) outer++;
      if (hit.inner && hit.outer) inner++;
    }
    const i = (y * width + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = outer ? Math.round(255 * inner / outer) : 0;
    rgba[i + 3] = Math.round(255 * outer / 16);
  }
  return { width, height: heightPx, rgba };
}

/** A ring sprite at progress t in [0,1]; radius is its maximum pixel radius. */
export function rippleSprite(radius: number, t: number): Sprite {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(t)) throw new RangeError("invalid ripple radius or progress");
  const progress = clamp(t, 0, 1);
  const half = Math.ceil(radius) + 2;
  const width = half * 2 + 1, height = width;
  const rgba = new Uint8Array(width * height * 4);
  const current = radius * (0.2 + 0.8 * progress);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let alpha = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const distance = Math.hypot(x + (sx + 0.5) / 4 - half, y + (sy + 0.5) / 4 - half);
      alpha += clamp(1.5 - Math.abs(distance - current), 0, 1);
    }
    const i = (y * width + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
    rgba[i + 3] = Math.round(255 * 0.8 * (1 - progress) * alpha / 16);
  }
  return { width, height, rgba };
}
