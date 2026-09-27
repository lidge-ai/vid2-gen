/** Coverage rasterizers for stage content: analytic rounded rectangles, OpenType glyph runs and stroked polylines. */
import opentype from "opentype.js";
import type { Font, FontPath } from "opentype.js";
import { readFileSync, statSync } from "node:fs";
import { rasterizePaths } from "../compile/text/raster/rasterize.ts";

export interface Mask { width: number; height: number; data: Float32Array }

export function emptyMask(width: number, height: number): Mask {
  return { width: Math.max(1, width), height: Math.max(1, height), data: new Float32Array(Math.max(1, width) * Math.max(1, height)) };
}

/** Signed distance from a point to a rounded box centred at the origin with half extents (hx, hy) and radius r. */
export function roundedBoxDistance(px: number, py: number, hx: number, hy: number, r: number): number {
  const radius = Math.min(r, hx, hy);
  const qx = Math.abs(px) - hx + radius;
  const qy = Math.abs(py) - hy + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * Coverage of a rounded rect of size w×h drawn at offset (pad, pad) inside a mask of (w+2pad)×(h+2pad). With stroke > 0 only the inner
 * band of that width is covered.
 */
export function roundedRectMask(w: number, h: number, radius: number, pad: number, stroke = 0): Mask {
  const mask = emptyMask(Math.ceil(w + pad * 2), Math.ceil(h + pad * 2));
  const hx = w / 2;
  const hy = h / 2;
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const d = roundedBoxDistance(x + 0.5 - pad - hx, y + 0.5 - pad - hy, hx, hy, radius);
    const fill = Math.max(0, Math.min(1, 0.5 - d));
    mask.data[y * mask.width + x] = stroke > 0 ? Math.max(0, fill - Math.max(0, Math.min(1, 0.5 - (d + stroke)))) : fill;
  }
  return mask;
}

const fonts = new Map<string, { font: Font; stamp: string }>();
const metrics = new Map<string, TextMetrics>();

/** Forget parsed fonts and metrics (each stage clip starts fresh, so a font replaced at the same path is re-read). */
export function resetFonts(): void { fonts.clear(); metrics.clear(); }

/** Parsed font, re-read when the file's size or mtime changes. */
export function loadFont(path: string): Font {
  const st = statSync(path);
  const stamp = `${st.size}|${st.mtimeMs}`;
  const hit = fonts.get(path);
  if (hit && hit.stamp === stamp) return hit.font;
  const font = opentype.parse(readFileSync(path));
  fonts.set(path, { font, stamp });
  for (const key of metrics.keys()) if (key.startsWith(path + "|")) metrics.delete(key);
  return font;
}

export interface TextMetrics { width: number; height: number; emSize: number; ascent: number; advances: number[] }

/** Metrics of a single-line run at a libass-normalized size; advances[i] is the pen x before glyph i (length = glyphs + 1). */
export function measureText(fontPath: string, text: string, size: number, letterSpacing = 0): TextMetrics {
  const font = loadFont(fontPath);
  const key = `${fontPath}|${size}|${letterSpacing}|${text}`;
  const hit = metrics.get(key);
  if (hit) return hit;
  const emSize = size * font.unitsPerEm / (font.ascender - font.descender);
  const scale = emSize / font.unitsPerEm;
  const glyphs = [...text].map((ch) => font.charToGlyph(ch));
  const advances = [0];
  let pen = 0;
  glyphs.forEach((g, i) => {
    pen += (g.advanceWidth ?? 0) * scale + letterSpacing;
    const next = glyphs[i + 1];
    if (next) pen += font.getKerningValue(g, next) * scale;
    advances.push(pen);
  });
  const width = Math.max(0, pen - (glyphs.length ? letterSpacing : 0));
  const result = { width, height: size, emSize, ascent: emSize * font.ascender / font.unitsPerEm, advances };
  metrics.set(key, result);
  return result;
}

/** Coverage of the first `count` glyphs of a run, drawn at scale into a mask with padding pad (node px × scale). */
export function textMask(fontPath: string, text: string, size: number, letterSpacing: number, count: number, scale: number, pad: number): Mask {
  const font = loadFont(fontPath);
  const m = measureText(fontPath, text, size, letterSpacing);
  const mask = emptyMask(Math.ceil(m.width * scale + pad * 2), Math.ceil(m.height * scale + pad * 2));
  const chars = [...text].slice(0, Math.max(0, count));
  const paths: FontPath[] = chars.map((ch, i) => font.charToGlyph(ch).getPath(pad + m.advances[i]! * scale, pad + m.ascent * scale,
    m.emSize * scale));
  if (!paths.length) return mask;
  const alpha = rasterizePaths(paths, mask.width, mask.height);
  for (let i = 0; i < alpha.length; i++) mask.data[i] = alpha[i]! / 255;
  return mask;
}

export interface Polyline { points: { x: number; y: number }[]; closed: boolean }

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Round-capped stroke coverage of polylines (already in mask pixel coordinates). */
export function strokeMask(lines: Polyline[], width: number, height: number, strokeWidth: number): Mask {
  const mask = emptyMask(width, height);
  const half = strokeWidth / 2;
  const segments: number[][] = [];
  for (const line of lines) {
    const pts = line.closed ? [...line.points, line.points[0]!] : line.points;
    for (let i = 0; i + 1 < pts.length; i++) segments.push([pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y]);
    if (pts.length === 1) segments.push([pts[0]!.x, pts[0]!.y, pts[0]!.x, pts[0]!.y]);
  }
  for (const [ax, ay, bx, by] of segments) {
    const x0 = Math.max(0, Math.floor(Math.min(ax!, bx!) - half - 1));
    const x1 = Math.min(width, Math.ceil(Math.max(ax!, bx!) + half + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay!, by!) - half - 1));
    const y1 = Math.min(height, Math.ceil(Math.max(ay!, by!) + half + 1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cover = Math.max(0, Math.min(1, half + 0.5 - segmentDistance(x + 0.5, y + 0.5, ax!, ay!, bx!, by!)));
      const i = y * width + x;
      if (cover > mask.data[i]!) mask.data[i] = cover;
    }
  }
  return mask;
}

/** Separable three-pass box blur approximating a Gaussian with standard deviation sigma (in mask pixels). */
export function blurChannel(data: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (sigma <= 0.25) return data;
  const radius = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  let a = data;
  for (let pass = 0; pass < 3; pass++) a = boxPass(boxPass(a, width, height, radius, true), width, height, radius, false);
  return a;
}

function boxPass(src: Float32Array, width: number, height: number, r: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const lines = horizontal ? height : width;
  const len = horizontal ? width : height;
  const step = horizontal ? 1 : width;
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * width : l;
    let acc = 0;
    for (let i = -r; i <= r; i++) if (i >= 0 && i < len) acc += src[base + i * step]!;
    for (let i = 0; i < len; i++) {
      out[base + i * step] = acc * inv;
      const add = i + r + 1;
      const sub = i - r;
      if (add < len) acc += src[base + add * step]!;
      if (sub >= 0) acc -= src[base + sub * step]!;
    }
  }
  return out;
}
