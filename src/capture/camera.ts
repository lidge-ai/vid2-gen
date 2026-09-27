import type { Fps } from "../shared/time.ts";
import { stepSpring } from "./spring.ts";
import type { SpringState } from "./spring.ts";

export interface CameraAction {
  /** Frame on the layer-relative timeline clock; caller has already placed the capture source. */
  frame: number;
  bbox?: { x: number; y: number; width: number; height: number };
  point?: { x: number; y: number };
}
export interface CameraOptions {
  fps: Fps;
  startFrame: number;
  frames: number;
  width: number;
  height: number;
  zoom?: number;
  minScale?: number;
  maxScale?: number;
  pad?: number;
  margin?: number;
  merge?: number;
  leadIn?: number;
  hold?: number;
  leadOut?: number;
}
export interface CameraKeyOut { at: number; zoom: number; x: number; y: number; ease: "linear" }

type Rect = { x: number; y: number; width: number; height: number };
type Group = { first: number; last: number; rect: Rect; count: number };
type Target = { zoom: number; x: number; y: number };
type FrameTarget = Target & { rect?: Rect };
const BASE: Target = { zoom: 1, x: 0.5, y: 0.5 };
const SPRING = { stiffness: 200, damping: 40, mass: 2.25 };

function clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)); }
function frameCount(seconds: number, fps: Fps): number { return Math.round(seconds * fps.num / fps.den); }
function rectOf(action: CameraAction): Rect | undefined {
  if (action.bbox && action.bbox.width > 0 && action.bbox.height > 0) return action.bbox;
  if (action.point) return { x: action.point.x - 60, y: action.point.y - 60, width: 120, height: 120 };
  return undefined;
}
function padded(rect: Rect, opts: CameraOptions): Rect {
  const px = rect.width * (opts.pad ?? 0.12);
  const py = rect.height * (opts.pad ?? 0.12);
  const left = clamp(rect.x - px, 0, opts.width);
  const top = clamp(rect.y - py, 0, opts.height);
  return { x: left, y: top, width: Math.max(1, clamp(rect.x + rect.width + px, 0, opts.width) - left),
    height: Math.max(1, clamp(rect.y + rect.height + py, 0, opts.height) - top) };
}
function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
function groupsFor(actions: CameraAction[], opts: CameraOptions): Group[] {
  const groups: Group[] = [];
  const mergeFrames = frameCount(opts.merge ?? 0.7, opts.fps);
  for (const action of [...actions].sort((a, b) => a.frame - b.frame)) {
    const raw = rectOf(action);
    if (!raw || action.frame < 0 || action.frame >= opts.frames) continue;
    const rect = padded(raw, opts);
    const previous = groups.at(-1);
    if (previous && (action.frame - previous.last <= mergeFrames || overlaps(previous.rect, rect))) {
      previous.last = action.frame;
      previous.rect = union(previous.rect, rect);
      previous.count++;
    } else groups.push({ first: action.frame, last: action.frame, rect, count: 1 });
  }
  return groups;
}
function focus(group: Group, opts: CameraOptions): Target {
  const fit = Math.min(opts.width / group.rect.width, opts.height / group.rect.height) * (1 - (opts.margin ?? 0.05));
  const minScale = opts.minScale ?? 1.15;
  const desired = opts.zoom ?? (group.count > 1 ? fit : 0.45 * opts.width / group.rect.width);
  const zoom = fit < minScale ? 1 :
    clamp(Math.min(desired, fit), group.count > 1 ? 1 : minScale, opts.maxScale ?? 2.2);
  const half = 0.5 / zoom;
  return { zoom, x: clamp((group.rect.x + group.rect.width / 2) / opts.width, half, 1 - half),
    y: clamp((group.rect.y + group.rect.height / 2) / opts.height, half, 1 - half) };
}
function targetAt(frame: number, groups: Group[], opts: CameraOptions): FrameTarget {
  let target = BASE;
  let rect: Rect | undefined;
  for (const group of groups) {
    const start = Math.max(0, group.first - frameCount(opts.leadIn ?? 0.22, opts.fps));
    const holdEnd = group.last + frameCount(opts.hold ?? 0.5, opts.fps);
    const out = Math.max(1, frameCount(opts.leadOut ?? 0.27, opts.fps));
    if (frame < start || frame > holdEnd + out) continue;
    rect = group.rect;
    const focusTarget = focus(group, opts);
    if (frame <= holdEnd) target = focusTarget;
    else {
      const remain = 1 - (frame - holdEnd) / out;
      target = { zoom: 1 + (focusTarget.zoom - 1) * remain,
        x: 0.5 + (focusTarget.x - 0.5) * remain, y: 0.5 + (focusTarget.y - 0.5) * remain };
    }
  }
  return rect ? { ...target, rect } : target;
}
function safeFocus(value: number, zoom: number, start: number, length: number, size: number): number {
  const half = 0.5 / zoom;
  const low = Math.max(half, (start + length) / size - half);
  const high = Math.min(1 - half, start / size + half);
  return clamp(value, Math.min(low, high), Math.max(low, high));
}
function same(a: CameraKeyOut, b: CameraKeyOut): boolean {
  return Math.abs(a.zoom - b.zoom) < 1e-6 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}
function append(keys: CameraKeyOut[], key: CameraKeyOut): void {
  const last = keys.at(-1);
  if (!last || !same(last, key)) { keys.push(key); return; }
  if (keys.length === 1 || !same(keys[keys.length - 2]!, key)) keys.push(key);
  else keys[keys.length - 1] = key;
}

/** Returns linear camera keys at ≤2-frame sampling; at is seconds from the layer start. */
export function planCamera(actions: CameraAction[], opts: CameraOptions): CameraKeyOut[] {
  if (opts.frames <= 0 || opts.width <= 0 || opts.height <= 0 || opts.fps.num <= 0 || opts.fps.den <= 0) return [];
  const groups = groupsFor(actions, opts);
  if (!groups.length) return [];
  let zoom: SpringState = { value: 1, velocity: 0 };
  let x: SpringState = { value: 0.5, velocity: 0 };
  let y: SpringState = { value: 0.5, velocity: 0 };
  const dt = opts.fps.den / opts.fps.num;
  const keys: CameraKeyOut[] = [];
  for (let frame = 0; frame < opts.frames; frame++) {
    const target = targetAt(frame, groups, opts);
    if (frame > 0) {
      zoom = stepSpring(zoom, target.zoom, dt, SPRING);
      x = stepSpring(x, target.x, dt, SPRING);
      y = stepSpring(y, target.y, dt, SPRING);
    }
    if (frame % 2 !== 0 && frame !== opts.frames - 1) continue;
    const fit = target.rect ? Math.min(opts.width / target.rect.width, opts.height / target.rect.height) * (1 - (opts.margin ?? 0.05)) : Infinity;
    const z = Math.max(1, Math.min(zoom.value, fit));
    const half = 0.5 / z;
    const cx = target.rect ? safeFocus(x.value, z, target.rect.x, target.rect.width, opts.width) : clamp(x.value, half, 1 - half);
    const cy = target.rect ? safeFocus(y.value, z, target.rect.y, target.rect.height, opts.height) : clamp(y.value, half, 1 - half);
    append(keys, { at: frame * dt, zoom: z, x: cx, y: cy, ease: "linear" });
  }
  return keys;
}
