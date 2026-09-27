/** Kinetic typography layer (020) → KineticConfig → stage spec, composited like any stage layer. */
import { fpsValue, parseTimeLiteral, toFrames, Vid2Error } from "../../shared/index.ts";
import { iconPaths } from "../../stage/icons/lucide.ts";
import { SpecBuilder } from "../../stage/presets/builder.ts";
import { buildKinetic, kineticStates } from "../../stage/presets/kinetic.ts";
import type { KineticConfig } from "../../stage/presets/kinetic.ts";
import type { BuildContext, LayerOf, LayerOutput } from "../ir.ts";
import { resolveFont } from "../text/fonts.ts";
import { placeStage, stageSpan } from "./stage.ts";

type Kinetic = LayerOf<"kinetic">;

/** Seconds of a time literal (beats honoured) at the output frame grid. */
export function seconds(at: number | string, ctx: BuildContext): number {
  return toFrames(parseTimeLiteral(at), { fps: ctx.fps, ...(ctx.beat ? { beat: ctx.beat } : {}) }, "duration") / fpsValue(ctx.fps);
}

export function iconResolver(ctx: BuildContext): KineticConfig["icons"] {
  return (name) => {
    const paths = iconPaths(name);
    if (paths) return { paths };
    const source = ctx.sources[name];
    if (source?.type === "image") return { image: source.path };
    throw new Vid2Error("E_SCHEMA", `unknown icon: ${name}`, { fix: "use a built-in icon name (vid2 capabilities) or an image source id" });
  };
}

export function kineticConfig(layer: Kinetic, ctx: BuildContext): KineticConfig {
  const canvas = { width: ctx.width / ctx.scale, height: ctx.height / ctx.scale };
  const tokens = kineticStates(layer.states);
  return {
    layout: { fontPath: resolveFont(layer.font, layer.weight, ctx).path, size: layer.size, letterSpacing: layer.letterSpacing, gap: layer.gap,
      lineHeight: layer.lineHeight, maxWidth: layer.maxWidth, align: layer.align, x: layer.x, y: layer.y, iconScale: layer.iconScale },
    color: layer.color, letterSpacing: layer.letterSpacing,
    accent: layer.accent ? { color: layer.accent.color, decay: seconds(layer.accent.decay, ctx) } : undefined,
    enter: { style: layer.enter.style, duration: seconds(layer.enter.duration, ctx), stagger: seconds(layer.enter.stagger, ctx),
      glyphStagger: parseTimeLiteral(layer.enter.glyphStagger).value * (parseTimeLiteral(layer.enter.glyphStagger).unit === "f" ? 1 / fpsValue(ctx.fps) : 1),
      distance: layer.enter.distance, blur: layer.enter.blur },
    exit: { style: layer.exit.style, duration: seconds(layer.exit.duration, ctx) },
    move: layer.move,
    highlight: layer.highlight ? { dim: layer.highlight.dim, sweep: seconds(layer.highlight.sweep, ctx), delay: seconds(layer.highlight.delay, ctx) } : undefined,
    pill: layer.pill, camera: layer.camera, iconStroke: layer.iconStroke, icons: iconResolver(ctx),
    states: layer.states.map((s, i) => ({ at: seconds(s.at, ctx), tokens: tokens[i]!, expand: s.expand ? { token: s.expand.token, radius: s.expand.radius,
      fill: s.expand.fill, to: s.expand.to === "frame" ? { x: 0, y: 0, ...canvas } : s.expand.to } : undefined })),
    duration: (layer.endFrame - layer.startFrame) / fpsValue(ctx.fps), canvas,
  };
}

export function buildKineticLayer(layer: Kinetic, ctx: BuildContext): LayerOutput {
  const b = new SpecBuilder(fpsValue(ctx.fps) * ctx.rate, ctx.scale);
  buildKinetic(b, kineticConfig(layer, ctx));
  const frames = stageSpan(layer, ctx);
  const visible = (layer.endFrame - layer.startFrame) * ctx.rate;
  const spec = b.spec(ctx.width, ctx.height, { num: ctx.fps.num * ctx.rate, den: ctx.fps.den }, frames, frames > visible ? visible - 1 : undefined);
  return placeStage(spec, layer, ctx);
}
