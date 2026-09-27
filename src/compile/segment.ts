/** One scene → one SegmentPlan: canvas, layers in authored order (text runs as ASS), scene effects, frame trim. */
import { Vid2Error, framesToSeconds, fpsString, hashJson } from "../shared/index.ts";
import type { ResolvedLayer, ResolvedScene } from "../timeline/index.ts";
import { effectFilters, internalRateFor } from "./effects/registry.ts";
import { num, quoteExpr, escapeValue } from "./escape.ts";
import { GraphBuilder } from "./graph.ts";
import type { BuildContext, InputRegistry, InputSpec, LayerOf, LayerOutput, SegmentPlan } from "./ir.ts";
import { SPARE_TAIL_FRAMES } from "./ir.ts";
import { buildMediaLayer } from "./layers/media.ts";
import { buildOverlayLayer } from "./layers/overlay.ts";
import { buildShapeLayer } from "./layers/shape.ts";
import { buildTextRuns } from "./layers/text.ts";
import { buildRasterText } from "./layers/text-raster.ts";
import { buildCursorOverlays } from "./layers/cursor.ts";

export const COLOR = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export interface SegmentBase {
  width: number; height: number; scale: number; oversample: 1 | 2; profile: BuildContext["profile"];
  fps: BuildContext["fps"]; background: string; sources: BuildContext["sources"]; fonts: BuildContext["fonts"];
  workDir: string; pngDir: string; textBackend: BuildContext["textBackend"]; beat?: NonNullable<BuildContext["beat"]>;
}

export function inputRegistry(first = 0): InputRegistry {
  const list: InputSpec[] = [];
  return {
    add(spec) {
      const index = first + list.length;
      list.push({ id: `in${index}`, ...spec });
      return `${index}:v`;
    },
    list: () => [...list],
  };
}

/**
 * Composite one built layer onto the canvas. The enable window uses t with half-frame tolerance at the internal rate
 * (fps × rate): ffmpeg 6.1's overlay miscounts n in timeline expressions once framesync repeats frames.
 */
export function composite(ctx: BuildContext, canvas: string, built: LayerOutput, span: { startFrame: number; endFrame: number }): string {
  if (built.mode === "blend") {
    const mode = built.blend === "add" ? "addition" : built.blend === "screen" ? "screen" : "normal";
    const base = ctx.graph.add([canvas], ["format=gbrp"]);
    return ctx.graph.add([base, built.label], [`blend=all_mode=${mode}:all_opacity=${num(built.opacity)}`, "format=rgba"]);
  }
  const internal = (ctx.fps.num * ctx.rate) / ctx.fps.den;
  const from = num((span.startFrame * ctx.rate - 0.5) / internal);
  const to = num((span.endFrame * ctx.rate - 0.5) / internal);
  return ctx.graph.add([canvas, built.label], [`overlay=x=${quoteExpr(built.x)}:y=${quoteExpr(built.y)}:eof_action=pass:format=auto:` +
    `enable=${quoteExpr(`gte(t,${from})*lt(t,${to})`)}`, "format=rgba"]);
}

function buildLayer(layer: ResolvedLayer, ctx: BuildContext): LayerOutput {
  switch (layer.type) {
    case "media": return buildMediaLayer(layer, ctx);
    case "shape": return buildShapeLayer(layer, ctx);
    case "overlay": return buildOverlayLayer(layer, ctx);
    case "text": throw new Vid2Error("E_INTERNAL", "text layers are compiled as runs");
  }
}

/** Walk layers in order; consecutive text layers become one ASS run applied at that position. */
export function compositeLayers(ctx: BuildContext, canvas: string, layers: ResolvedLayer[]): { canvas: string; ass: SegmentPlan["assFiles"]; fonts: string[] } {
  const ass: SegmentPlan["assFiles"] = [];
  const fonts: string[] = [];
  let run: LayerOf<"text">[] = [];
  const flush = (): void => {
    if (!run.length) return;
    const text = buildTextRuns(run, ctx, ass.length);
    ass.push(text.ass);
    fonts.push(...text.fontFiles);
    canvas = ctx.graph.add([canvas], [text.filter, "format=rgba"]);
    run = [];
  };
  for (const layer of layers) {
    if (layer.type === "text" && ctx.textBackend === "raster") { flush(); canvas = composite(ctx, canvas, buildRasterText(layer, ctx), layer); continue; }
    if (layer.type === "text") { run.push(layer); continue; }
    flush();
    canvas = composite(ctx, canvas, buildLayer(layer, ctx), layer);
    if (layer.type === "media" && layer.cursorTrack?.length && layer.cursor && layer.cursor.style !== "none") {
      for (const c of buildCursorOverlays(layer, layer.cursor.style, ctx)) canvas = composite(ctx, canvas, c.built, c.span);
    }
  }
  flush();
  return { canvas, ass, fonts: [...new Set(fonts)] };
}

function sceneLayers(scene: ResolvedScene, base: SegmentBase): { background: string; layers: ResolvedLayer[] } {
  const bg = scene.background;
  if (!bg || COLOR.test(bg)) return { background: bg ?? base.background, layers: scene.layers };
  if (!base.sources[bg]) throw new Vid2Error("E_SCHEMA", `scene ${scene.id} background is neither a colour nor a source id: ${bg}`);
  const first = scene.layers[0];
  const span = { startFrame: 0, endFrame: scene.frames, startSeconds: 0, endSeconds: scene.seconds, absoluteStartFrame: scene.startFrame,
    absoluteEndFrame: scene.startFrame + scene.frames, absoluteStartSeconds: scene.startSeconds, absoluteEndSeconds: scene.startSeconds + scene.seconds };
  const media = { type: "media", source: bg, fit: "cover", speed: 1, motion: "none", opacity: 1, volume: 0, start: 0, ...span } as ResolvedLayer;
  return { background: base.background, layers: first ? [media, ...scene.layers] : [media] };
}

export function compileSegment(scene: ResolvedScene, base: SegmentBase, last: boolean): SegmentPlan {
  const rate = internalRateFor(scene.effects);
  const renderFrames = scene.frames + (last ? 0 : SPARE_TAIL_FRAMES);
  const { background, layers } = sceneLayers(scene, base);
  const ctx: BuildContext = { ...base, graph: new GraphBuilder(), inputs: inputRegistry(), rate, frames: scene.frames, renderFrames,
    background, sceneId: scene.id };
  const seconds = framesToSeconds(renderFrames, base.fps);
  const lavfi = `color=c=${escapeValue(background)}:s=${base.width}x${base.height}:r=${fpsString({ num: base.fps.num * rate, den: base.fps.den })}:d=${num(seconds)}`;
  const bgInput = ctx.inputs.add({ kind: "lavfi", lavfi, args: ["-f", "lavfi", "-i", lavfi] });
  let canvas = ctx.graph.add([bgInput], ["format=rgba", "setsar=1"]);
  const built = compositeLayers(ctx, canvas, layers);
  canvas = built.canvas;
  const ordered = [...scene.effects.filter((e) => e.type !== "motionblur"), ...scene.effects.filter((e) => e.type === "motionblur")];
  const effectCtx = { fps: base.fps, rate, frames: renderFrames, width: base.width, height: base.height, clock: "segment" as const };
  const filters = ordered.flatMap((e) => effectFilters(e, effectCtx));
  if (rate > 1 && !filters.some((f) => f.startsWith("fps="))) filters.push(`fps=${fpsString(base.fps)}`);
  const out = ctx.graph.add([canvas], [...filters, `trim=end_frame=${renderFrames}`, "setpts=PTS-STARTPTS", "format=yuv420p", "setsar=1"], "vout");
  const inputs = ctx.inputs.list();
  const graph = ctx.graph.toString();
  const plan = { id: `seg-${scene.index}-${scene.id}`, sceneId: scene.id, index: scene.index, frames: scene.frames, renderFrames,
    width: base.width, height: base.height, fps: base.fps, inputs, graph, outLabel: out, assFiles: built.ass, fontFiles: built.fonts,
    textBackend: base.textBackend, internalRate: rate };
  return { ...plan, hash: hashJson({ graph, inputs, ass: built.ass.map((a) => a.content), fonts: built.fonts }) };
}
