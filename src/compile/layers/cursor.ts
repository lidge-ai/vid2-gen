/**
 * Synthetic cursor and click ripples over a capture layer (030). The track is in authored canvas px after fit and camera; the
 * cursor moves with piecewise-linear overlay expressions sampled every 2 frames, ripples grow and fade for 0.6 s.
 */
import { cursorSprite } from "../../capture/cursor.ts";
import { num, quoteExpr } from "../escape.ts";
import type { BuildContext, LayerOf, LayerOutput } from "../ir.ts";
import { cachedPng, encodePng } from "../png.ts";
import { layerRate, pngInput } from "./media.ts";

type Media = LayerOf<"media">;
type Track = NonNullable<Media["cursorTrack"]>;
export interface CursorOverlay { built: LayerOutput; span: { startFrame: number; endFrame: number } }

const RIPPLE_SECONDS = 0.6;
const MAX_RIPPLES = 24;

/** Piecewise-linear expression in t (scene seconds) through (seconds, value) points. */
export function linearExpr(points: [number, number][]): string {
  if (!points.length) return "0";
  if (points.length === 1) return num(points[0]![1]);
  const terms = [`lt(t,${num(points[0]![0])})*${num(points[0]![1])}`];
  for (let i = 0; i < points.length - 1; i++) {
    const [ta, va] = points[i]!, [tb, vb] = points[i + 1]!;
    if (tb <= ta) continue;
    terms.push(`gte(t,${num(ta)})*lt(t,${num(tb)})*(${num(va)}+${num(vb - va)}*(t-${num(ta)})/${num(tb - ta)})`);
  }
  const last = points.at(-1)!;
  terms.push(`gte(t,${num(last[0])})*${num(last[1])}`);
  return terms.join("+");
}

function ringPng(radius: number): Buffer {
  const size = Math.ceil(radius) * 2 + 5;
  const c = size / 2;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const d = Math.hypot(x + (sx + 0.5) / 4 - c, y + (sy + 0.5) / 4 - c);
      a += Math.max(0, Math.min(1, 2 - Math.abs(d - radius)));
    }
    const i = (y * size + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
    rgba[i + 3] = Math.round((220 * a) / 16);
  }
  return encodePng(size, size, 4, rgba);
}

function rippleBirths(track: Track): { frame: number; x: number; y: number }[] {
  const births: { frame: number; x: number; y: number }[] = [];
  for (const s of track) for (const r of s.ripples) {
    if (!births.some((b) => Math.abs(b.x - r.x) < 1 && Math.abs(b.y - r.y) < 1 && s.frame - b.frame < 20)) births.push({ frame: s.frame, x: r.x, y: r.y });
  }
  return births.slice(0, MAX_RIPPLES);
}

export function buildCursorOverlays(layer: Media, style: "arrow" | "dot", ctx: BuildContext): CursorOverlay[] {
  const track = layer.cursorTrack ?? [];
  if (!track.length) return [];
  const sec = (f: number) => layer.startSeconds + (f * ctx.fps.den) / ctx.fps.num;
  const sampled = track.filter((s, i) => s.frame % 2 === 0 || i === track.length - 1);
  const height = Math.max(8, Math.round(28 * (layer.cursor?.scale ?? 1) * ctx.scale));
  const sprite = cursorSprite(style, height);
  const hot = style === "dot" ? { x: sprite.width / 2, y: sprite.height / 2 } : { x: sprite.width * 0.06, y: sprite.height * 0.02 };
  const png = cachedPng(ctx.pngDir, { cursor: style, height }, () => encodePng(sprite.width, sprite.height, 4, sprite.rgba));
  const spanSeconds = (layer.endFrame - layer.startFrame) * ctx.fps.den / ctx.fps.num;
  const input = pngInput(png, spanSeconds, ctx);
  const label = ctx.graph.add([input], ["format=rgba", `setpts=PTS-STARTPTS+${num(layer.startSeconds)}/TB`]);
  const x = linearExpr(sampled.map((s) => [sec(s.frame), s.x * ctx.scale - hot.x]));
  const y = linearExpr(sampled.map((s) => [sec(s.frame), s.y * ctx.scale - hot.y]));
  const first = track.find((s) => s.alpha > 0.05)?.frame ?? 0;
  const out: CursorOverlay[] = [];
  if (layer.cursor?.ripple !== false) out.push(...ripples(layer, track, ctx));
  out.push({ built: { mode: "overlay", label, x, y }, span: { startFrame: layer.startFrame + first, endFrame: layer.endFrame } });
  return out;
}

function ripples(layer: Media, track: Track, ctx: BuildContext): CursorOverlay[] {
  const radius = Math.max(6, Math.round(34 * ctx.scale));
  const png = cachedPng(ctx.pngDir, { ring: radius }, () => ringPng(radius));
  const frames = Math.round(RIPPLE_SECONDS * ctx.fps.num / ctx.fps.den);
  return rippleBirths(track).map((b) => {
    const start = layer.startSeconds + (b.frame * ctx.fps.den) / ctx.fps.num;
    const input = pngInput(png, RIPPLE_SECONDS, ctx);
    const grow = `(0.3+0.7*(1-(1-t/${num(RIPPLE_SECONDS)})*(1-t/${num(RIPPLE_SECONDS)})))`;
    const label = ctx.graph.add([input], ["format=rgba", `fps=${layerRate(ctx)}`,
      `scale=w=${quoteExpr(`2*trunc(iw*${grow}/2)+2`)}:h=${quoteExpr(`2*trunc(ih*${grow}/2)+2`)}:eval=frame`,
      `fade=t=out:st=0:d=${num(RIPPLE_SECONDS)}:alpha=1`, `setpts=PTS-STARTPTS+${num(start)}/TB`]);
    const x = `${num(b.x * ctx.scale)}-overlay_w/2`, y = `${num(b.y * ctx.scale)}-overlay_h/2`;
    const f0 = layer.startFrame + b.frame;
    return { built: { mode: "overlay" as const, label, x, y }, span: { startFrame: f0, endFrame: Math.min(layer.endFrame, f0 + frames) } };
  });
}
