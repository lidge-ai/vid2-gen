/** Pure-JS raster text, composited as a PNG overlay at its authored layer position. */
import { framesToSeconds, parseTimeLiteral, toFrames } from "../../shared/time.ts";
import { sha256 } from "../../shared/hash.ts";
import { num, quoteExpr } from "../escape.ts";
import type { BuildContext, LayerBuilder, LayerOf, LayerOutput } from "../ir.ts";
import { cachedPng, encodePng } from "../png.ts";
import { layerRate, pngInput, spanSeconds } from "./media.ts";
import { renderTextImage } from "../text/raster/image.ts";
import type { RasterTextImage } from "../text/raster/image.ts";

type TextLayer = LayerOf<"text">;

function anchor(layer: TextLayer, ctx: BuildContext, image: RasterTextImage): { x: number; y: number } {
  const x = layer.x === "center" ? ctx.width / 2 : layer.x * ctx.scale;
  const y = layer.y === "center" ? ctx.height / 2 : layer.y * ctx.scale;
  return { x: layer.align === "left" ? x - image.inkLeft : layer.align === "right" ? x - image.inkLeft - image.inkWidth
    : x - image.width / 2, y: y - image.height / 2 };
}

function animationFrames(layer: TextLayer, ctx: BuildContext): number {
  const beat = ctx.beat;
  return Math.max(1, toFrames(parseTimeLiteral(layer.animationDuration), { fps: ctx.fps,
    ...(beat === undefined ? {} : { beat }) }, "duration") * ctx.rate);
}

function pngStream(image: RasterTextImage, ctx: BuildContext, seconds: number, kind: string, extra: unknown, png = image.png): string {
  const path = cachedPng(ctx.pngDir, { kind, hash: sha256(image.png), extra }, () => png);
  return pngInput(path, seconds, ctx);
}

function reveal(image: RasterTextImage, count: number, wipeFraction?: number): Buffer {
  const data = image.data.slice();
  let remaining = count;
  for (const line of image.lines) {
    const chars = line.boundaries.length - 1;
    const visible = Math.max(0, Math.min(chars, remaining));
    remaining -= chars;
    const boundary = wipeFraction === undefined ? line.left + line.boundaries[visible]! : image.width * wipeFraction;
    for (let y = Math.max(0, line.top - 2); y < Math.min(image.height, line.bottom + 2); y++) {
      for (let x = Math.max(0, Math.floor(boundary)); x < image.width; x++) {
        const coverage = Math.max(0, Math.min(1, boundary - x));
        data[(y * image.width + x) * 4 + 3] = Math.round(data[(y * image.width + x) * 4 + 3]! * coverage);
      }
    }
  }
  return encodePng(image.width, image.height, 4, data);
}

function steppedStream(layer: TextLayer, ctx: BuildContext, image: RasterTextImage): string {
  const total = (layer.endFrame - layer.startFrame) * ctx.rate;
  const entrance = Math.min(total, animationFrames(layer, ctx));
  const steps = Math.max(1, Math.min(entrance, layer.animation === "type" ? image.chars : 32));
  const rate = { num: ctx.fps.num * ctx.rate, den: ctx.fps.den };
  const frameSeconds = framesToSeconds(1, rate);
  const labels: string[] = [];
  for (let step = 0; step < steps; step++) {
    const first = Math.floor(step * entrance / steps);
    const last = Math.floor((step + 1) * entrance / steps);
    const frames = last - first;
    if (!frames) continue;
    const shown = Math.floor((step + 1) * image.chars / steps);
    const png = reveal(image, shown, layer.animation === "wipe" ? (step + 1) / steps : undefined);
    const input = pngStream(image, ctx, framesToSeconds(frames, rate), layer.animation, step, png);
    labels.push(ctx.graph.add([input], [`fps=${layerRate(ctx)}`, `trim=end_frame=${num(frames)}`, `setpts=PTS-STARTPTS+${num(frameSeconds)}/TB`, "format=rgba"]));
  }
  const rest = total - entrance;
  if (rest > 0) {
    const input = pngStream(image, ctx, framesToSeconds(rest, rate), "raster-text", "rest");
    labels.push(ctx.graph.add([input], [`fps=${layerRate(ctx)}`, `trim=end_frame=${num(rest)}`, `setpts=PTS-STARTPTS+${num(frameSeconds)}/TB`, "format=rgba"]));
  }
  if (labels.length === 1) return ctx.graph.add([labels[0]!], ["setpts=PTS-STARTPTS"]);
  return ctx.graph.add(labels, [`concat=n=${num(labels.length)}:v=1:a=0`, "setpts=PTS-STARTPTS", "format=rgba"]);
}

function blurImage(image: RasterTextImage, radius: number): Buffer {
  const data = image.data.slice();
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    let alpha = 0;
    const rgb = [0, 0, 0];
    let count = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue;
      const index = (yy * image.width + xx) * 4;
      const a = image.data[index + 3]!;
      alpha += a;
      for (let c = 0; c < 3; c++) rgb[c]! += image.data[index + c]! * a;
      count++;
    }
    const index = (y * image.width + x) * 4;
    for (let c = 0; c < 3; c++) data[index + c] = alpha ? Math.round(rgb[c]! / alpha) : 0;
    data[index + 3] = Math.round(alpha / count);
  }
  return encodePng(image.width, image.height, 4, data);
}

function baseStream(layer: TextLayer, ctx: BuildContext, image: RasterTextImage, duration: number): string {
  if (layer.animation === "type" || layer.animation === "wipe") return steppedStream(layer, ctx, image);
  if (layer.animation !== "blur") return pngStream(image, ctx, spanSeconds(layer, ctx), "raster-text", "full");
  const blurred = pngStream(image, ctx, spanSeconds(layer, ctx), "blurred", 4, blurImage(image, 4));
  const sharp = pngStream(image, ctx, spanSeconds(layer, ctx), "sharp", "full");
  const back = ctx.graph.add([blurred], ["format=rgba", `fade=t=out:st=0:d=${num(duration)}:alpha=1`]);
  const front = ctx.graph.add([sharp], ["format=rgba", `fade=t=in:st=0:d=${num(duration)}:alpha=1`]);
  return ctx.graph.add([back, front], ["overlay=x=0:y=0:eof_action=pass:format=auto", "format=rgba"]);
}

function animate(layer: TextLayer, ctx: BuildContext, image: RasterTextImage, source: string): LayerOutput {
  const span = spanSeconds(layer, ctx);
  const duration = Math.min(span, framesToSeconds(animationFrames(layer, ctx), { num: ctx.fps.num * ctx.rate, den: ctx.fps.den }));
  const base = anchor(layer, ctx, image);
  const filters = ["format=rgba"];
  let x = num(base.x), y = num(base.y);
  if (layer.animation === "fade" || layer.animation === "rise") filters.push(`fade=t=in:st=0:d=${num(duration)}:alpha=1`);
  if (["fade", "rise", "slam", "pop"].includes(layer.animation)) {
    filters.push(`fade=t=out:st=${num(Math.max(0, span - 0.12))}:d=${num(Math.min(0.12, span))}:alpha=1`);
  }
  if (layer.animation === "rise") y = `${num(base.y)}+${num(24 * ctx.scale)}*pow(max(0,1-min(1,(t-${num(layer.startSeconds)})/${num(duration)})),2)`;
  if (layer.animation === "slam" || layer.animation === "pop") {
    const progress = `min(1,n/${num(animationFrames(layer, ctx))})`;
    const factor = layer.animation === "slam" ? `1+0.45*pow(1-${progress},2)`
      : `if(lt(${progress},0.6),0.8+0.28*${progress}/0.6,1.08-0.08*(${progress}-0.6)/0.4)`;
    filters.push(`scale=w=${quoteExpr(`${num(image.width)}*(${factor})`)}:h=${quoteExpr(`${num(image.height)}*(${factor})`)}:eval=frame`);
    x = `${num(base.x)}+(${num(image.width)}-overlay_w)/2`;
    y = `${num(base.y)}+(${num(image.height)}-overlay_h)/2`;
    filters.push(`fade=t=in:st=0:d=${num(layer.animation === "slam" ? 0.06 : 0.08)}:alpha=1`);
  }
  filters.push(`setpts=PTS-STARTPTS+${num(layer.startSeconds)}/TB`);
  return { mode: "overlay", label: ctx.graph.add([source], filters), x, y };
}

export const buildRasterText: LayerBuilder<TextLayer> = (layer, ctx) => {
  const image = renderTextImage(layer, ctx);
  const duration = framesToSeconds(animationFrames(layer, ctx), { num: ctx.fps.num * ctx.rate, den: ctx.fps.den });
  return animate(layer, ctx, image, baseStream(layer, ctx, image, duration));
};
