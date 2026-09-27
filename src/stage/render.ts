/**
 * Frame loop. Consecutive frames reuse the previous buffer and only recomposite the dirty region (union of changed items' old and new
 * rects, redrawing every item that intersects it). Any other entry point recomposites the whole canvas, so frame N is a pure function
 * of (spec, N).
 */
import { Canvas, intersect, union } from "./composite.ts";
import type { Rect } from "./composite.ts";
import { frameItems, tintOf } from "./scene.ts";
import type { DrawItem } from "./scene.ts";
import { resetFonts } from "./raster.ts";
import { SpriteCache } from "./sprites.ts";
import type { DecodedImage } from "./sprites.ts";
import { indexTracks } from "./tracks.ts";
import type { TrackIndex } from "./tracks.ts";
import type { StageSpec } from "./types.ts";

const FULL_REDRAW_FRACTION = 0.4;

function paint(canvas: Canvas, items: DrawItem[], region: Rect): void {
  canvas.clear(region);
  for (const item of items) {
    if (!item.rect || !intersect(item.rect, region)) continue;
    for (const layer of item.layers) canvas.draw(layer.variants, tintOf(layer.tint), item.opacity, region, item.clips);
  }
  canvas.export(region);
}

function dirtyRegion(prev: DrawItem[], next: DrawItem[]): Rect | null {
  const before = new Map(prev.map((item) => [item.key, item]));
  const after = new Map(next.map((item) => [item.key, item]));
  let dirty: Rect | null = null;
  for (const item of next) {
    const old = before.get(item.key);
    if (old && old.signature === item.signature) continue;
    dirty = union(union(dirty, item.rect), old?.rect ?? null);
  }
  for (const item of prev) if (!after.has(item.key)) dirty = union(dirty, item.rect);
  const order = (items: DrawItem[]) => items.map((item) => item.key).join("\n");
  if (order(prev) !== order(next)) for (const item of next) dirty = union(dirty, item.rect);
  return dirty;
}

export class StageRenderer {
  readonly spec: StageSpec;
  readonly canvas: Canvas;
  private readonly index: TrackIndex;
  private readonly sprites: SpriteCache;
  private last: { frame: number; items: DrawItem[] } | null = null;
  /** Test hook: always recomposite the full canvas. */
  forceFull = false;
  constructor(spec: StageSpec, images: Map<string, DecodedImage> = new Map()) {
    resetFonts();
    this.spec = spec;
    this.canvas = new Canvas(spec.width, spec.height);
    this.index = indexTracks(spec.tracks);
    this.sprites = new SpriteCache(images);
  }
  /** Straight-alpha RGBA bytes of frame n (the returned view is reused by the next call). */
  frame(n: number): Uint8Array {
    // Spare tail frames hold the last visible state (holdFrame) instead of evaluating tracks past the layer end.
    const items = frameItems(this.spec, this.index, Math.min(n, this.spec.holdFrame ?? n), this.sprites);
    const full = this.canvas.full();
    let region: Rect | null = full;
    if (!this.forceFull && this.last && this.last.frame === n - 1) {
      const dirty = dirtyRegion(this.last.items, items);
      region = dirty ? intersect(dirty, full) : null;
      if (region && (region.x1 - region.x0) * (region.y1 - region.y0) > FULL_REDRAW_FRACTION * full.x1 * full.y1) region = full;
    }
    if (region) paint(this.canvas, items, region);
    this.last = { frame: n, items };
    return this.canvas.out;
  }
}

/** A single frame rendered cold (full recomposite). */
export function renderStageFrame(spec: StageSpec, n: number, images: Map<string, DecodedImage> = new Map()): Uint8Array {
  return new StageRenderer(spec, images).frame(n).slice();
}
