/** Stage-family layers → a StageSpec registered on the plan, composited as an alpha clip for the layer span (010). */
import { join } from "node:path";
import { hashJson, parseTimeLiteral, toFrames, Vid2Error } from "../../shared/index.ts";
import type { StageNode, StageSpec, StageTrack } from "../../stage/types.ts";
import { STAGE_VERSION } from "../../stage/types.ts";
import { COLOR_PROPS, SPATIAL_PROPS } from "../../timeline/stage-schema.ts";
import { num } from "../escape.ts";
import type { BuildContext, LayerOf, LayerOutput } from "../ir.ts";
import { SPARE_TAIL_FRAMES } from "../ir.ts";
import { resolveFont } from "../text/fonts.ts";
import { layerRate } from "./media.ts";

type Stage = LayerOf<"stage">;
type AuthoredNode = Stage["nodes"][number];

/** Stage frames (fps × internal rate) of a time literal relative to the layer start. */
export function stageFrame(at: number | string, ctx: BuildContext): number {
  return toFrames(parseTimeLiteral(at), { fps: ctx.fps, ...(ctx.beat ? { beat: ctx.beat } : {}) }, "duration") * ctx.rate;
}

function scaled<T extends object>(value: T, keys: string[], s: number): T {
  const out = { ...value } as Record<string, unknown>;
  for (const k of keys) if (typeof out[k] === "number") out[k] = (out[k]) * s;
  return out as T;
}

function imagePath(source: string, ctx: BuildContext): string {
  const src = ctx.sources[source];
  if (!src || src.type !== "image") throw new Vid2Error("E_SCHEMA", `stage image node needs an image source: ${source}`,
    { fix: "declare an image source (generated sources must be materialized with vid2 assets resolve)" });
  return src.path;
}

export function stageNode(node: AuthoredNode, ctx: BuildContext): StageNode {
  const s = ctx.scale;
  const base = scaled(node, ["x", "y", "blur"], s);
  switch (node.kind) {
    case "text": {
      const { weight, ...rest } = scaled(base as typeof node, ["size", "letterSpacing"], s);
      return { ...rest, font: resolveFont(node.font, weight, ctx).path };
    }
    case "image": { const { source, ...rest } = scaled(base as typeof node, ["width", "height", "radius"], s); return { ...rest, image: imagePath(source, ctx) }; }
    case "rect": {
      const rect = scaled(base as typeof node, ["width", "height", "radius", "strokeWidth"], s);
      return { ...rect, ...(node.shadow ? { shadow: scaled(node.shadow, ["blur", "x", "y"], s) } : {}),
        ...(node.glow ? { glow: scaled(node.glow, ["blur"], s) } : {}) };
    }
    case "group": return { ...(base as typeof node), ...(node.clip ? { clip: scaled(node.clip, ["x", "y", "width", "height", "radius"], s) } : {}) };
  }
}

function stageTracks(layer: Stage, ctx: BuildContext): StageTrack[] {
  return layer.tracks.map((t) => ({ node: t.node, prop: t.prop, keys: t.keys.map((k) => ({
    frame: stageFrame(k.at, ctx), ease: k.ease, ...(k.spring ? { spring: k.spring } : {}),
    value: typeof k.value === "number" && SPATIAL_PROPS.includes(t.prop) && !COLOR_PROPS.includes(t.prop) ? k.value * ctx.scale : k.value })) }));
}

/** Frames the clip must cover: the layer span, plus the spare tail when the layer reaches the scene end. */
export function stageSpan(layer: { startFrame: number; endFrame: number }, ctx: BuildContext): number {
  const tail = layer.endFrame >= ctx.frames ? ctx.renderFrames - ctx.frames : 0;
  return (layer.endFrame - layer.startFrame + Math.min(tail, SPARE_TAIL_FRAMES)) * ctx.rate;
}

export function specFor(layer: Stage, ctx: BuildContext): StageSpec {
  return { version: STAGE_VERSION, width: ctx.width, height: ctx.height, fps: { num: ctx.fps.num * ctx.rate, den: ctx.fps.den },
    frames: stageSpan(layer, ctx), nodes: layer.nodes.map((n) => stageNode(n, ctx)), tracks: stageTracks(layer, ctx),
    events: layer.events.map((e) => ({ frame: stageFrame(e.at, ctx), kind: e.kind, ...(e.sfx ? { sfx: e.sfx } : {}) })) };
}

/** Register a compiled spec and composite its clip over the layer span. */
export function placeStage(spec: StageSpec, layer: { startFrame: number; startSeconds: number; absoluteStartFrame: number }, ctx: BuildContext): LayerOutput {
  if (!ctx.stages) throw new Vid2Error("E_INTERNAL", "stage layers need a plan stage collector");
  const hash = hashJson(spec);
  const id = `stage-${hash.slice(0, 16)}`;
  const out = join(ctx.workDir, `${id}.mkv`);
  ctx.stages.set(id, { id, hash, spec, out, frames: spec.frames, width: spec.width, height: spec.height });
  ctx.stageEvents?.push(...spec.events.map((e) => ({ ...e, absoluteFrame: layer.absoluteStartFrame + Math.round(e.frame / ctx.rate) })));
  const input = ctx.inputs.add({ kind: "video", path: out, args: ["-i", out] });
  const label = ctx.graph.add([input], ["setpts=PTS-STARTPTS", `fps=${layerRate(ctx)}`, "format=rgba",
    `setpts=PTS-STARTPTS+${num(layer.startSeconds)}/TB`]);
  return { mode: "overlay", label, x: "0", y: "0" };
}

export function buildStageLayer(layer: Stage, ctx: BuildContext): LayerOutput {
  return placeStage(specFor(layer, ctx), layer, ctx);
}
