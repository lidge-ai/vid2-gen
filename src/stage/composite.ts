/** Premultiplied RGBA float canvas with bilinear affine sprite drawing, rect-limited clearing and straight-alpha export. */
import type { Sprite } from "./sprites.ts";

/** 2×3 affine [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];
export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Clip { inverse: Matrix; hx: number; hy: number; cx: number; cy: number; radius: number }

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

export function apply(m: Matrix, x: number, y: number): [number, number] { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

export function bounds(m: Matrix, w: number, h: number): Rect {
  const pts = [apply(m, 0, 0), apply(m, w, 0), apply(m, 0, h), apply(m, w, h)];
  return { x0: Math.floor(Math.min(...pts.map((p) => p[0]))), y0: Math.floor(Math.min(...pts.map((p) => p[1]))),
    x1: Math.ceil(Math.max(...pts.map((p) => p[0]))), y1: Math.ceil(Math.max(...pts.map((p) => p[1]))) };
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const r = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
  return r.x0 < r.x1 && r.y0 < r.y1 ? r : null;
}

export function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

function sample(s: Sprite, x: number, y: number, c: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= s.width || yy >= s.height ? 0 : s.data[(yy * s.width + xx) * s.channels + c]!);
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

function clipCoverage(clips: Clip[], x: number, y: number): number {
  let cover = 1;
  for (const c of clips) {
    const [lx, ly] = apply(c.inverse, x, y);
    const qx = Math.abs(lx - c.cx) - c.hx + c.radius;
    const qy = Math.abs(ly - c.cy) - c.hy + c.radius;
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - c.radius;
    cover *= Math.max(0, Math.min(1, 0.5 - d));
  }
  return cover;
}

export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly buf: Float32Array;
  readonly out: Uint8Array;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buf = new Float32Array(width * height * 4);
    this.out = new Uint8Array(width * height * 4);
  }
  full(): Rect { return { x0: 0, y0: 0, x1: this.width, y1: this.height }; }
  clear(r: Rect): void {
    for (let y = r.y0; y < r.y1; y++) this.buf.fill(0, (y * this.width + r.x0) * 4, (y * this.width + r.x1) * 4);
  }
  /** Draw sprite through matrix (sprite px → canvas px) with a tint (mask sprites) and opacity, limited to region. */
  draw(sprite: Sprite, m: Matrix, tint: [number, number, number, number] | null, opacity: number, region: Rect, clips: Clip[] = []): void {
    const r = intersect(bounds(m, sprite.width, sprite.height), region);
    if (!r || opacity <= 0) return;
    const inv = invert(m);
    const [tr, tg, tb, ta] = tint ?? [1, 1, 1, 1];
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const [sx, sy] = apply(inv, x + 0.5, y + 0.5);
      if (sx < -1 || sy < -1 || sx > sprite.width + 1 || sy > sprite.height + 1) continue;
      const k = opacity * (clips.length ? clipCoverage(clips, x + 0.5, y + 0.5) : 1);
      const i = (y * this.width + x) * 4;
      let pr: number, pg: number, pb: number, pa: number;
      if (sprite.channels === 1) {
        const cov = sample(sprite, sx - 0.5, sy - 0.5, 0) * ta * k;
        if (cov <= 0) continue;
        pr = tr * cov; pg = tg * cov; pb = tb * cov; pa = cov;
      } else {
        pa = sample(sprite, sx - 0.5, sy - 0.5, 3) * k;
        if (pa <= 0) continue;
        pr = sample(sprite, sx - 0.5, sy - 0.5, 0) * k; pg = sample(sprite, sx - 0.5, sy - 0.5, 1) * k; pb = sample(sprite, sx - 0.5, sy - 0.5, 2) * k;
      }
      const keep = 1 - pa;
      this.buf[i] = pr + this.buf[i]! * keep;
      this.buf[i + 1] = pg + this.buf[i + 1]! * keep;
      this.buf[i + 2] = pb + this.buf[i + 2]! * keep;
      this.buf[i + 3] = pa + this.buf[i + 3]! * keep;
    }
  }
  /** Convert a region of the premultiplied float buffer into the straight-alpha 8-bit output. */
  export(r: Rect): void {
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const i = (y * this.width + x) * 4;
      const a = Math.min(1, this.buf[i + 3]!);
      if (a <= 1 / 512) { this.out[i] = 0; this.out[i + 1] = 0; this.out[i + 2] = 0; this.out[i + 3] = 0; continue; }
      this.out[i] = Math.round(Math.min(1, this.buf[i]! / a) * 255);
      this.out[i + 1] = Math.round(Math.min(1, this.buf[i + 1]! / a) * 255);
      this.out[i + 2] = Math.round(Math.min(1, this.buf[i + 2]! / a) * 255);
      this.out[i + 3] = Math.round(a * 255);
    }
  }
}
