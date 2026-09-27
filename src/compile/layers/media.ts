import { Vid2Error } from "../../shared/errors.ts";
import { framesToSeconds } from "../../shared/time.ts";
import { escapeValue, num } from "../escape.ts";
import type { BuildContext, LayerBuilder, LayerOf } from "../ir.ts";
import { perspectiveFilters } from "../motion.ts";
import { buildWindowLayer } from "./window.ts";

type Media = LayerOf<"media">;
type Source = BuildContext["sources"][string];

export function layerRate(ctx: BuildContext): string {
  return `${num(ctx.fps.num * ctx.rate)}/${num(ctx.fps.den)}`;
}

export function spanSeconds(layer: { startFrame: number; endFrame: number }, ctx: BuildContext): number {
  const frames = layer.endFrame - layer.startFrame;
  if (frames <= 0) throw new Vid2Error("E_INPUT", "layer span must contain at least one frame");
  return framesToSeconds(frames, ctx.fps);
}

export function pngInput(path: string, seconds: number, ctx: BuildContext): string {
  return ctx.inputs.add({ kind: "png", path, args: ["-framerate", layerRate(ctx), "-loop", "1", "-t", num(seconds), "-i", path] });
}

export function sourceInput(source: Source, seconds: number, ctx: BuildContext, opts: { inSeconds?: number; speed?: number } = {}): string {
  if (source.type === "generate" || source.type === "capture" || source.type === "audio") {
    throw new Vid2Error("E_CAPABILITY", `source type ${source.type} cannot be rendered as video in wp3`);
  }
  if (source.type === "color") {
    const lavfi = `color=c=${escapeValue(source.color)}:s=${num(ctx.width)}x${num(ctx.height)}:r=${layerRate(ctx)}:d=${num(seconds)}`;
    return ctx.inputs.add({ kind: "lavfi", lavfi, args: ["-f", "lavfi", "-i", lavfi] });
  }
  const path = source.path;
  if (source.type === "image") return ctx.inputs.add({ kind: "image", path,
    args: ["-framerate", layerRate(ctx), "-loop", "1", "-t", num(seconds), "-i", path] });
  const speed = opts.speed ?? 1;
  return ctx.inputs.add({ kind: "video", path, args: ["-ss", num(opts.inSeconds ?? 0), "-t", num(seconds * speed), "-i", path] });
}

export function fitFilters(mode: Media["fit"], width: number, height: number): string[] {
  const w = num(width);
  const h = num(height);
  if (mode === "cover") return [`scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${w}:${h}`];
  return [`scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos`, "format=rgba",
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0`];
}

function fitted(input: string, mode: Media["fit"], width: number, height: number, ctx: BuildContext): string {
  const normalized = ctx.graph.add([input], ["scale=in_range=auto:out_range=tv"]);
  if (mode !== "blurfill") return ctx.graph.add([normalized], [...fitFilters(mode, width, height), "format=rgba", "setsar=1"]);
  const [back, front] = ctx.graph.split(normalized, 2);
  const blurred = ctx.graph.add([back!], [...fitFilters("cover", width, height), "gblur=sigma=48", "eq=brightness=-0.3", "format=rgba"]);
  const subject = ctx.graph.add([front!], [...fitFilters("contain", width, height), "format=rgba"]);
  return ctx.graph.add([blurred, subject], ["overlay=x=0:y=0:eof_action=pass:format=auto", "format=rgba", "setsar=1"]);
}

/** Source-to-fitted RGBA stream at PTS zero; window composites shift PTS after applying masks. */
export function prepareMedia(layer: Media, ctx: BuildContext, width: number, height: number): string {
  const source = ctx.sources[layer.source];
  if (!source) throw new Vid2Error("E_SCHEMA", `unknown media source: ${layer.source}`);
  const duration = spanSeconds(layer, ctx);
  const input = sourceInput(source, duration, ctx, { ...(layer.inSeconds === undefined ? {} : { inSeconds: layer.inSeconds }), speed: layer.speed });
  const rate = layerRate(ctx);
  const speed = source.type === "video" ? [`setpts=(PTS-STARTPTS)/${num(layer.speed)}`, `fps=${rate}`] : [`fps=${rate}`];
  const fit = fitted(input, layer.fit, width, height, ctx);
  const video = ctx.graph.add([fit], speed);
  if (!layer.camera && layer.motion === "none") return video;
  const motion = perspectiveFilters(layer, ctx, width, height);
  return ctx.graph.add([video], [...motion.before, motion.perspective, ...motion.after]);
}

export const buildMediaLayer: LayerBuilder<Media> = (layer, ctx) => {
  if (layer.window) return buildWindowLayer(layer, ctx);
  const prepared = prepareMedia(layer, ctx, ctx.width, ctx.height);
  const filters = [`setpts=PTS-STARTPTS+${num(layer.startSeconds)}/TB`];
  if (layer.opacity < 1) filters.push(`colorchannelmixer=aa=${num(layer.opacity)}`);
  return { mode: "overlay", label: ctx.graph.add([prepared], filters), x: "0", y: "0" };
};
