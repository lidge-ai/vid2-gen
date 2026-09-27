/** Premultiplied RGBA float canvas with bilinear affine sprite drawing, rect-limited clearing and straight-alpha export. */
import type { Sprite } from "./sprites.ts";

/** One sprite drawn through a matrix (sprite px → canvas px) with a mixing weight. */
export interface Variant { sprite: Sprite; matrix: Matrix; weight: number }

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

/** Weighted premultiplied RGBA of all variants at canvas point (x, y); mask sprites are tinted. */
function mixSample(variants: Variant[], inverses: Matrix[], x: number, y: number, tint: [number, number, number, number] | null,
  out: [number, number, number, number]): void {
  out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
  const [tr, tg, tb, ta] = tint ?? [1, 1, 1, 1];
  for (let v = 0; v < variants.length; v++) {
    const { sprite, weight } = variants[v]!;
    const [sx, sy] = apply(inverses[v]!, x, y);
    if (sx < -1 || sy < -1 || sx > sprite.width + 1 || sy > sprite.height + 1) continue;
    if (sprite.channels === 1) {
      const cov = sample(sprite, sx - 0.5, sy - 0.5, 0) * ta * weight;
      out[0] += tr * cov; out[1] += tg * cov; out[2] += tb * cov; out[3] += cov;
    } else {
      for (let c = 0; c < 4; c++) out[c] = out[c]! + sample(sprite, sx - 0.5, sy - 0.5, c) * weight;
    }
  }
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
  /**
   * Composite one node layer: its blur-level variants (sprite + matrix + weight) are sampled and mixed per pixel into a single
   * premultiplied colour, then drawn source-over once with the tint (mask sprites) and opacity, limited to region.
   */
  draw(variants: Variant[], tint: [number, number, number, number] | null, opacity: number, region: Rect, clips: Clip[] = []): void {
    let box: Rect | null = null;
    for (const v of variants) box = union(box, bounds(v.matrix, v.sprite.width, v.sprite.height));
    const r = box && intersect(box, region);
    if (!r || opacity <= 0) return;
    const inverses = variants.map((v) => invert(v.matrix));
    const px: [number, number, number, number] = [0, 0, 0, 0];
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      mixSample(variants, inverses, x + 0.5, y + 0.5, tint, px);
      if (px[3] <= 0) continue;
      const k = opacity * (clips.length ? clipCoverage(clips, x + 0.5, y + 0.5) : 1);
      const i = (y * this.width + x) * 4;
      const pa = px[3] * k;
      const keep = 1 - pa;
      const pr = px[0] * k; const pg = px[1] * k; const pb = px[2] * k;
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
