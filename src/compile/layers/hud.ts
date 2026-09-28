/** Full-timeline HUD stage clips and their post placement (030 G-11, B5, R2-10; 031). Stub signatures by main; W3 implements. */
import { join } from "node:path";
import { fpsValue, hashJson, Vid2Error } from "../../shared/index.ts";
import { buildHudSpec } from "../../stage/presets/hud.ts";
import type { ResolvedHud } from "../../timeline/film.ts";
import type { ResolvedTimeline } from "../../timeline/index.ts";
import type { BuildContext, StageRender } from "../ir.ts";
import { num, quoteExpr } from "../escape.ts";
import { GraphBuilder } from "../graph.ts";
import type { SegmentBase } from "../segment.ts";
import { inputRegistry } from "../segment.ts";
import { resolveFont } from "../text/fonts.ts";

/**
 * Time-ordered, contiguous absolute-time chunks (each ≤ chunkSeconds) covering [h.startFrame, h.endFrame). Registers each
 * chunk in base.stages itself (as placeStage does); plan.ts stores only the returned ids in PostPlan.hud.renders.
 */
export function hudRenders(h: ResolvedHud, t: ResolvedTimeline, base: SegmentBase, chunkSeconds = 20): StageRender[] {
  const chunkFrames = Math.floor(chunkSeconds * fpsValue(base.fps));
  if (!Number.isFinite(chunkFrames) || chunkFrames < 1) throw new Vid2Error("E_INPUT", "HUD chunk length must span at least one frame");
  if (!base.stages) throw new Vid2Error("E_INTERNAL", "HUD needs a plan stage collector");
  const fontCtx: BuildContext = { ...base, graph: new GraphBuilder(), inputs: inputRegistry(), rate: 1, frames: t.totalFrames,
    renderFrames: t.totalFrames, sceneId: "hud" };
  const fontPath = resolveFont(h.font, "regular", fontCtx).path;
  const renders: StageRender[] = [];
  for (let start = h.startFrame; start < h.endFrame; start += chunkFrames) {
    const end = Math.min(start + chunkFrames, h.endFrame);
    const spec = buildHudSpec(h, { width: base.width, height: base.height, scale: base.scale, fps: base.fps, frames: end - start, fontPath,
      base: start, counterKeys: h.counterKeys.map((k) => ({ ...k, frame: k.frame - start })),
      tickerItems: h.tickerItems.map((item) => ({ ...item, frame: item.frame - start })) });
    const hash = hashJson({ spec, start, end });
    const id = `hud-${hash.slice(0, 16)}`;
    const out = join(base.workDir, `${id}.mkv`);
    const render = { id, hash, spec, out, frames: spec.frames, width: spec.width, height: spec.height };
    base.stages.set(id, render);
    renders.push(render);
  }
  return renders;
}

/** Concats the chunks (concat=n=k:v=1:a=0) and overlays them on `canvas` enabled over [start, end); returns the output label. */
export function placeHud(ctx: Pick<BuildContext, "graph" | "inputs" | "fps">, canvas: string, renders: StageRender[], h: ResolvedHud): string {
  if (!renders.length) throw new Vid2Error("E_INTERNAL", "HUD has no stage renders");
  const inputs = renders.map((r) => {
    const input = ctx.inputs.add({ kind: "video", path: r.out, args: ["-i", r.out] });
    return ctx.graph.add([input], ["setpts=PTS-STARTPTS", "format=rgba"]);
  });
  const joined = ctx.graph.add(inputs, [`concat=n=${inputs.length}:v=1:a=0`]);
  // Chunk clips carry millisecond MKV timestamps, so concat could start a later chunk one frame early or late.
  // Re-time by frame index instead: output frame k of the HUD sits exactly at (startFrame + k) / fps.
  const overlay = ctx.graph.add([joined], [
    `setpts=(N+${num(h.startFrame)})*${num(ctx.fps.den)}/(${num(ctx.fps.num)}*TB)`, "format=rgba"]);
  const fps = fpsValue(ctx.fps);
  const from = num((h.startFrame - 0.5) / fps);
  const to = num((h.endFrame - 0.5) / fps);
  return ctx.graph.add([canvas, overlay], [`overlay=x=0:y=0:eof_action=pass:format=auto:` +
    `enable=${quoteExpr(`gte(t,${from})*lt(t,${to})`)}`, "format=rgba"]);
}
