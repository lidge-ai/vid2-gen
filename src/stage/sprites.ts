/**
 * Sprites: rasterized node content at a scale bucket and blur level. Text, rect and icon content are coverage masks tinted at draw time
 * (so colour animation never re-rasterizes); images are premultiplied RGBA. Sprite (0,0) maps to node-box (-ox, -oy) / scale.
 */
import { blurChannel, measureText, roundedBoxDistance, roundedRectMask, strokeMask, textMask } from "./raster.ts";
import type { Mask } from "./raster.ts";
import { iconPolylines } from "./icons/path.ts";
import type { IconNode, ImageNode, RectNode, StageNode, TextNode } from "./types.ts";

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
    case "icon": return { width: node.size, height: node.size };
    case "group": return { width: 0, height: 0 };
  }
}

/** Decoded-image lookup key: the same file may be decoded at several sizes and fits. */
export function imageKey(node: ImageNode): string { return `${node.image}|${node.fit}|${node.width}x${node.height}`; }

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

function imageSprite(node: ImageNode, image: DecodedImage, scale: number, blur: number): Sprite {
  const pad = padFor(blur, scale);
  const w = Math.max(1, Math.round(node.width * scale));
  const h = Math.max(1, Math.round(node.height * scale));
  const width = w + pad * 2;
  const height = h + pad * 2;
  const channels = [0, 1, 2, 3].map(() => new Float32Array(width * height));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / w));
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / h));
    const src = (sy * image.width + sx) * 4;
    const cover = Math.max(0, Math.min(1, 0.5 - roundedBoxDistance(x + 0.5 - w / 2, y + 0.5 - h / 2, w / 2, h / 2, node.radius * scale)));
    const a = image.data[src + 3]! / 255 * cover;
    const i = (y + pad) * width + x + pad;
    for (let c = 0; c < 3; c++) channels[c]![i] = image.data[src + c]! / 255 * a;
    channels[3]![i] = a;
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
    case "image": {
      const image = cache.images.get(imageKey(node));
      if (!image) return [];
      const key = `image|${imageKey(node)}|${node.radius}|${scale}|${blur}`;
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
