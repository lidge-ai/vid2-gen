/**
 * Sprites: rasterized node content at a scale bucket and blur level. Text, rect and icon content are coverage masks tinted at draw time
 * (so colour animation never re-rasterizes); images are premultiplied RGBA. Sprite (0,0) maps to node-box (-ox, -oy) / scale.
 */
import { blurChannel, measureText, roundedBoxDistance, roundedRectMask, strokeMask, textMask } from "./raster.ts";
import type { Mask } from "./raster.ts";
import { iconPolylines } from "./icons/path.ts";
import type { IconNode, ImageNode, PathNode, RectNode, StageNode, TextNode } from "./types.ts";

export interface Sprite { width: number; height: number; ox: number; oy: number; scale: number; channels: 1 | 4; data: Float32Array }
export interface DecodedImage { width: number; height: number; data: Uint8Array }
/** One tinted sprite of a node; dx/dy offset it in node-box px (shadows). */
export interface Piece { sprite: Sprite; tint: string | null; dx: number; dy: number }

export const BLUR_LEVELS = [0, 2, 4, 8, 16, 32];
const MAX_SPRITES = 3000;

export class SpriteCache {
  private map = new Map<string, Sprite>();
  images: Map<string, DecodedImage>;
  constructor(images: Map<string, DecodedImage> = new Map()) { this.images = images; }
  get(key: string, build: () => Sprite): Sprite {
    const hit = this.map.get(key);
    if (hit) { this.map.delete(key); this.map.set(key, hit); return hit; }
    const sprite = build();
    this.map.set(key, sprite);
    if (this.map.size > MAX_SPRITES) this.map.delete(this.map.keys().next().value!);
    return sprite;
  }
}

/** Smallest bucket 2^(k/4) at or above the effective scale, clamped to [1/4, 4]. */
export function scaleBucket(scale: number): number {
  const k = Math.ceil(Math.log2(Math.max(1 / 4, Math.min(4, scale))) * 4 - 1e-9);
  return 2 ** (k / 4);
}

export function nodeBox(node: StageNode): { width: number; height: number } {
  switch (node.kind) {
    case "text": { const m = measureText(node.font, node.text, node.size, node.letterSpacing); return { width: m.width, height: m.height }; }
    case "rect": case "image": return { width: Math.max(0, node.width), height: Math.max(0, node.height) };
    case "path": return { width: Math.max(0, node.width), height: Math.max(0, node.height) };
    case "icon": return { width: node.size, height: node.size };
    case "group": return { width: 0, height: 0 };
  }
}

/** Source rectangle of the decoded image and destination rectangle inside a w×h box for a fit mode. */
function fitRects(image: DecodedImage, w: number, h: number, fit: ImageNode["fit"]) {
  const s = fit === "cover" ? Math.max(w / image.width, h / image.height) : Math.min(w / image.width, h / image.height);
  const dw = fit === "cover" ? w : image.width * s;
  const dh = fit === "cover" ? h : image.height * s;
  return { s, dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh, sx: (image.width - dw / s) / 2, sy: (image.height - dh / s) / 2 };
}

/** Box-filtered straight RGBA of the decoded image over a source footprint (x0..x1, y0..y1) in source pixels. */
function area(image: DecodedImage, x0: number, y0: number, x1: number, y1: number, out: number[]): void {
  const ix0 = Math.max(0, Math.floor(x0)); const iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(image.width, Math.max(ix0 + 1, Math.ceil(x1))); const iy1 = Math.min(image.height, Math.max(iy0 + 1, Math.ceil(y1)));
  out.fill(0);
  let n = 0;
  for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
    const i = (y * image.width + x) * 4;
    const a = image.data[i + 3]! / 255;
    out[0]! += image.data[i]! / 255 * a; out[1]! += image.data[i + 1]! / 255 * a; out[2]! += image.data[i + 2]! / 255 * a; out[3]! += a;
    n++;
  }
  for (let c = 0; c < 4; c++) out[c] = out[c]! / Math.max(1, n);
}

function maskSprite(mask: Mask, pad: number, scale: number, sigma: number): Sprite {
  const data = blurChannel(mask.data, mask.width, mask.height, sigma * scale);
  return { width: mask.width, height: mask.height, ox: pad, oy: pad, scale, channels: 1, data };
}

const padFor = (blur: number, scale: number) => Math.ceil((blur * 3 + 2) * scale);

function textSprite(node: TextNode, scale: number, blur: number): Sprite {
  const pad = padFor(blur, scale);
  const count = node.reveal === undefined ? [...node.text].length : Math.floor(node.reveal);
  return maskSprite(textMask(node.font, node.text, node.size, node.letterSpacing * 1, count, scale, pad), pad, scale, blur);
}

function rectSprite(node: RectNode, scale: number, blur: number, stroke: boolean): Sprite {
  const pad = padFor(blur, scale);
  const mask = roundedRectMask(node.width * scale, node.height * scale, node.radius * scale, pad, stroke ? node.strokeWidth * scale : 0);
  return maskSprite(mask, pad, scale, blur);
}

function iconSprite(node: IconNode, scale: number, blur: number): Sprite {
  const pad = padFor(blur, scale);
  const size = node.size * scale;
  const lines = iconPolylines(node.paths, size / 24, pad, node.progress);
  const mask = strokeMask(lines, Math.ceil(size + pad * 2), Math.ceil(size + pad * 2), node.strokeWidth * size / 24);
  return maskSprite(mask, pad, scale, blur);
}

function pathSprite(node: PathNode, scale: number, blur: number): Sprite {
  const pad = padFor(blur, scale) + Math.ceil(node.strokeWidth * scale);
  const lines = iconPolylines(node.d, scale, pad, node.progress);
  const mask = strokeMask(lines, Math.ceil(node.width * scale + pad * 2), Math.ceil(node.height * scale + pad * 2), node.strokeWidth * scale);
  return maskSprite(mask, pad, scale, blur);
}

function imageSprite(node: ImageNode, image: DecodedImage, scale: number, blur: number): Sprite {
  const pad = padFor(blur, scale);
  const w = Math.max(1, Math.round(node.width * scale));
  const h = Math.max(1, Math.round(node.height * scale));
  const width = w + pad * 2;
  const height = h + pad * 2;
  const channels = [0, 1, 2, 3].map(() => new Float32Array(width * height));
  const f = fitRects(image, w, h, node.fit);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x + 1 <= f.dx || y + 1 <= f.dy || x >= f.dx + f.dw || y >= f.dy + f.dh) continue;
    const sx0 = f.sx + (x - f.dx) / f.s;
    const sy0 = f.sy + (y - f.dy) / f.s;
    area(image, sx0, sy0, sx0 + 1 / f.s, sy0 + 1 / f.s, px);
    const cover = Math.max(0, Math.min(1, 0.5 - roundedBoxDistance(x + 0.5 - w / 2, y + 0.5 - h / 2, w / 2, h / 2, node.radius * scale)));
    const i = (y + pad) * width + x + pad;
    for (let c = 0; c < 4; c++) channels[c]![i] = px[c]! * cover;
  }
  const blurred = channels.map((ch) => blurChannel(ch, width, height, blur * scale));
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = blurred[c]![i]!;
  return { width, height, ox: pad, oy: pad, scale, channels: 4, data };
}

function rectPieces(node: RectNode, cache: SpriteCache, scale: number, blur: number): Piece[] {
  const geo = `${node.width}|${node.height}|${node.radius}`;
  const pieces: Piece[] = [];
  if (node.shadow) {
    const sb = blur + node.shadow.blur;
    pieces.push({ sprite: cache.get(`rect|${geo}|${scale}|${sb}`, () => rectSprite(node, scale, sb, false)), tint: node.shadow.color,
      dx: node.shadow.x, dy: node.shadow.y });
  }
  if (node.glow) {
    const gb = blur + node.glow.blur;
    pieces.push({ sprite: cache.get(`rect|${geo}|${scale}|${gb}`, () => rectSprite(node, scale, gb, false)), tint: node.glow.color, dx: 0, dy: 0 });
  }
  pieces.push({ sprite: cache.get(`rect|${geo}|${scale}|${blur}`, () => rectSprite(node, scale, blur, false)), tint: node.fill, dx: 0, dy: 0 });
  if (node.stroke && node.strokeWidth > 0) pieces.push({ sprite: cache.get(`rects|${geo}|${node.strokeWidth}|${scale}|${blur}`,
    () => rectSprite(node, scale, blur, true)), tint: node.stroke, dx: 0, dy: 0 });
  return pieces;
}

/** Pieces of a node at one blur level. */
export function nodePieces(node: StageNode, cache: SpriteCache, scale: number, blur: number): Piece[] {
  switch (node.kind) {
    case "group": return [];
    case "rect": return rectPieces(node, cache, scale, blur);
    case "text": {
      const reveal = node.reveal === undefined ? "all" : Math.floor(node.reveal);
      const key = `text|${node.font}|${node.size}|${node.letterSpacing}|${reveal}|${scale}|${blur}|${node.text}`;
      return [{ sprite: cache.get(key, () => textSprite(node, scale, blur)), tint: node.color, dx: 0, dy: 0 }];
    }
    case "icon": {
      const key = `icon|${node.size}|${node.strokeWidth}|${node.progress.toFixed(3)}|${scale}|${blur}|${node.paths.join(" ")}`;
      return [{ sprite: cache.get(key, () => iconSprite(node, scale, blur)), tint: node.color, dx: 0, dy: 0 }];
    }
    case "path": {
      const key = `path|${node.width}x${node.height}|${node.strokeWidth}|${node.progress.toFixed(3)}|${scale}|${blur}|${node.d.join(" ")}`;
      return [{ sprite: cache.get(key, () => pathSprite(node, scale, blur)), tint: node.color, dx: 0, dy: 0 }];
    }
    case "image": {
      const image = cache.images.get(node.image);
      if (!image) return [];
      const key = `image|${node.image}|${node.fit}|${node.width}x${node.height}|${node.radius}|${scale}|${blur}`;
      return [{ sprite: cache.get(key, () => imageSprite(node, image, scale, blur)), tint: null, dx: 0, dy: 0 }];
    }
  }
}

/** The two blur levels bracketing a blur value and the weight of the upper one. */
export function blurMix(blur: number): { low: number; high: number; t: number } {
  const b = Math.max(0, Math.min(BLUR_LEVELS[BLUR_LEVELS.length - 1]!, blur));
  let i = 0;
  while (i + 1 < BLUR_LEVELS.length && BLUR_LEVELS[i + 1]! <= b) i++;
  const low = BLUR_LEVELS[i]!;
  const high = BLUR_LEVELS[Math.min(i + 1, BLUR_LEVELS.length - 1)]!;
  return { low, high, t: high === low ? 0 : (b - low) / (high - low) };
}
