import { num, quoteExpr } from "../escape.ts";
import type { BuildContext, LayerBuilder, LayerOf } from "../ir.ts";
import { projectWindowCorners } from "../motion.ts";
import { cachedPng, roundedRectBorder, roundedRectMask, softShadow } from "../png.ts";
import { pngInput, prepareMedia, spanSeconds, layerRate } from "./media.ts";

type Media = LayerOf<"media">;
const PAD = 40;

function pngLayer(ctx: BuildContext, path: string, seconds: number): string {
  return ctx.graph.add([pngInput(path, seconds, ctx)], ["format=rgba"]);
}

function maskedContent(layer: Media, ctx: BuildContext, width: number, height: number, radius: number, seconds: number): string {
  const content = prepareMedia(layer, ctx, width, height);
  const path = cachedPng(ctx.pngDir, { kind: "mask", width, height, radius }, () => roundedRectMask(width, height, radius));
  const mask = ctx.graph.add([pngInput(path, seconds, ctx)], ["format=gray"]);
  return ctx.graph.add([content, mask], ["alphamerge", "format=rgba"]);
}

function localWindow(layer: Media, ctx: BuildContext, width: number, height: number, radius: number, seconds: number): string {
  const window = layer.window!;
  const content = maskedContent(layer, ctx, width, height, radius, seconds);
  let framed = content;
  if (window.border) {
    const path = cachedPng(ctx.pngDir, { kind: "border", width, height, radius }, () => roundedRectBorder(width, height, radius));
    framed = ctx.graph.add([framed, pngLayer(ctx, path, seconds)], ["overlay=x=0:y=0:eof_action=pass:format=auto"]);
  }
  if (!window.shadow) return framed;
  const path = cachedPng(ctx.pngDir, { kind: "shadow", width, height, radius, pad: PAD }, () => softShadow(width, height, radius, PAD));
  const shadow = pngLayer(ctx, path, seconds);
  return ctx.graph.add([shadow, framed], [`overlay=x=${num(PAD)}:y=${num(PAD)}:eof_action=pass:format=auto`, "format=rgba"]);
}

function transparentCanvas(ctx: BuildContext, seconds: number): string {
  const lavfi = `color=c=black@0:s=${num(ctx.width)}x${num(ctx.height)}:r=${layerRate(ctx)}:d=${num(seconds)}`;
  const input = ctx.inputs.add({ kind: "lavfi", lavfi, args: ["-f", "lavfi", "-i", lavfi] });
  return ctx.graph.add([input], ["format=rgba"]);
}

function perspectiveWindow(label: string, ctx: BuildContext, x: number, y: number, centerX: number, centerY: number, rx: number, ry: number, seconds: number): string {
  const canvas = transparentCanvas(ctx, seconds);
  const placed = ctx.graph.add([canvas, label], [`overlay=x=${num(x)}:y=${num(y)}:eof_action=pass:format=auto`, "format=rgba"]);
  const corners = projectWindowCorners(ctx.width, ctx.height, centerX, centerY, rx, ry);
  const opts = corners.map((corner, i) => `x${i}=${quoteExpr(num(corner.x))}:y${i}=${quoteExpr(num(corner.y))}`).join(":");
  return ctx.graph.add([placed], [`perspective=${opts}:interpolation=cubic:sense=destination:eval=init`, "format=rgba"]);
}

export const buildWindowLayer: LayerBuilder<Media> = (layer, ctx) => {
  const window = layer.window!;
  const width = Math.max(1, Math.round(window.width * ctx.scale));
  const height = Math.max(1, Math.round(window.height * ctx.scale));
  const radius = Math.max(0, Math.round(window.radius * ctx.scale));
  const x = window.x * ctx.scale;
  const y = window.y * ctx.scale;
  const seconds = spanSeconds(layer, ctx);
  const local = localWindow(layer, ctx, width, height, radius, seconds);
  const pad = window.shadow ? PAD : 0;
  const positioned = window.perspective ? perspectiveWindow(local, ctx, x - pad, y - pad, x + width / 2, y + height / 2,
    window.perspective.rx, window.perspective.ry, seconds) : local;
  const filters = [`setpts=PTS-STARTPTS+${num(layer.startSeconds)}/TB`];
  if (layer.opacity < 1) filters.push(`colorchannelmixer=aa=${num(layer.opacity)}`);
  return { mode: "overlay", label: ctx.graph.add([positioned], filters),
    x: window.perspective ? "0" : num(x - pad), y: window.perspective ? "0" : num(y - pad) };
};
