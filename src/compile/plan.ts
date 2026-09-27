/** Timeline → RenderPlan: per-scene segments, the join, and the post-join pass (timeline overlays/effects). */
import { cacheDir, hashJson, Vid2Error } from "../shared/index.ts";
import { requireFeatures } from "../probe/index.ts";
import type { FfmpegInfo } from "../probe/index.ts";
import type { ResolvedLayer, ResolvedTimeline } from "../timeline/index.ts";
import { effectFilters, requiredFilters } from "./effects/registry.ts";
import { GraphBuilder } from "./graph.ts";
import type { TextBackend, BuildContext, EffectOp, OverlayOp, PostPlan, ProfileName, RenderPlan, ResolvedOutput, SegmentPlan } from "./ir.ts";
import { planJoin } from "./joins.ts";
import { buildOverlayLayer as buildOverlayFor } from "./layers/overlay.ts";
import { requireTextCapability } from "./layers/text.ts";
import { compileSegment, composite, inputRegistry } from "./segment.ts";
import type { SegmentBase } from "./segment.ts";

/** Output after the render profile (proxy halves dimensions); produced by render/profiles applyProfile. */
export interface ProfiledOutput extends ResolvedOutput { scale: number; oversample: 1 | 2 }

export interface CompileOptions {
  profile: ProfileName;
  output: ProfiledOutput;
  workDir: string;
  ffmpeg: FfmpegInfo;
  ffprobe: string;
  timelineHash: string;
  pngDir?: string;
  /** Force a text engine; default: "ass" when ffmpeg has libass, else "raster". VID2_TEXT_BACKEND overrides. */
  textBackend?: TextBackend;
}

/** Output settings of a resolved timeline before any profile is applied. */
export function timelineOutput(t: ResolvedTimeline): ResolvedOutput {
  const o = t.output;
  return { width: t.width, height: t.height, fps: t.fps, background: o.background, container: o.container,
    videoCodec: o.videoCodec, quality: o.quality };
}

/** libass when available (best typography); pure-JS raster text otherwise (e.g. Homebrew ffmpeg without libass). */
export function pickTextBackend(info: FfmpegInfo, requested?: TextBackend): TextBackend {
  const env = process.env["VID2_TEXT_BACKEND"];
  const want = requested ?? (env === "ass" || env === "raster" ? env : undefined);
  if (want) return want;
  return info.libs.ass && info.filters.has("ass") ? "ass" : "raster";
}

function checkCapabilities(t: ResolvedTimeline, info: FfmpegInfo, backend: TextBackend): void {
  const layers = [...t.scenes.flatMap((s) => s.layers), ...t.overlays];
  if (backend === "ass" && layers.some((l) => l.type === "text")) requireTextCapability(info);
  const effects = [...t.scenes.flatMap((s) => s.effects), ...t.effects];
  const transitions = t.scenes.some((s) => s.transitionOut && s.transitionOut.frames > 0);
  const hasWindow = layers.some((l) => l.type === "media" && l.window);
  const filters = [...requiredFilters(effects), "overlay", ...(transitions ? ["xfade"] : []), ...(hasWindow ? ["alphamerge"] : [])];
  requireFeatures(info, { filters }, "render plan");
}

function overlayOps(overlays: ResolvedLayer[], t: ResolvedTimeline): OverlayOp[] {
  return overlays.flatMap((l) => {
    if (l.type !== "overlay") return [];
    const src = t.sources[l.source];
    const kind = src?.type === "video" ? "video" : "image";
    return [{ source: l.source, kind, blend: l.blend, opacity: l.opacity, motion: l.motion, startFrame: l.absoluteStartFrame, endFrame: l.absoluteEndFrame }];
  });
}

function postPlan(t: ResolvedTimeline, base: SegmentBase, totalFrames: number): PostPlan {
  const overlays = overlayOps(t.overlays, t);
  const effectCtx = { fps: base.fps, rate: 1, frames: totalFrames, width: base.width, height: base.height, clock: "absolute-t" as const };
  const effects: EffectOp[] = t.effects.map((e) => ({ type: e.type, filters: effectFilters(e, effectCtx) }));
  if (t.effects.some((e) => e.type === "motionblur")) throw new Vid2Error("E_INPUT", "motionblur is a scene effect; move it into a scene");
  if (!overlays.length && !effects.length) return { overlays, effects, inputs: [], graph: null };
  const ctx: BuildContext = { ...base, graph: new GraphBuilder(), inputs: inputRegistry(1), rate: 1, frames: totalFrames,
    renderFrames: totalFrames, sceneId: "post" };
  let canvas = ctx.graph.add(["0:v"], ["format=rgba", "setsar=1"]);
  for (const layer of t.overlays) {
    if (layer.type !== "overlay") continue;
    const shifted = { ...layer, startFrame: layer.absoluteStartFrame, endFrame: layer.absoluteEndFrame,
      startSeconds: layer.absoluteStartSeconds, endSeconds: layer.absoluteEndSeconds };
    canvas = composite(ctx, canvas, buildOverlayFor(shifted, ctx), shifted);
  }
  ctx.graph.add([canvas], [...effects.flatMap((e) => e.filters), "format=yuv420p", "setsar=1"], "vpost");
  return { overlays, effects, inputs: ctx.inputs.list(), graph: ctx.graph.toString() };
}


export function compileTimeline(t: ResolvedTimeline, opts: CompileOptions): RenderPlan {
  if (!t.scenes.length) throw new Vid2Error("E_INPUT", "timeline has no scenes");
  const textBackend = pickTextBackend(opts.ffmpeg, opts.textBackend);
  checkCapabilities(t, opts.ffmpeg, textBackend);
  const o = opts.output;
  const base: SegmentBase = { width: o.width, height: o.height, scale: o.scale, oversample: o.oversample, profile: opts.profile,
    fps: o.fps, background: o.background, sources: t.sources, fonts: t.fonts, workDir: opts.workDir,
    pngDir: opts.pngDir ?? cacheDir("png"), textBackend, ...(t.beat ? { beat: t.beat } : {}) };
  const segments: SegmentPlan[] = t.scenes.map((s, i) => compileSegment(s, base, i === t.scenes.length - 1));
  const join = planJoin(segments.map(({ id, frames, renderFrames }) => ({ id, frames, renderFrames })),
    t.scenes.map((s) => s.transitionOut), o.fps);
  if (join.totalFrames !== t.totalFrames) {
    throw new Vid2Error("E_INTERNAL", "join total differs from resolved timeline", { details: { join: join.totalFrames, timeline: t.totalFrames } });
  }
  const output: ResolvedOutput = { width: o.width, height: o.height, fps: o.fps, background: o.background, container: o.container,
    videoCodec: o.videoCodec, quality: o.quality };
  const info = opts.ffmpeg;
  return { planVersion: 1, timelineHash: opts.timelineHash, profile: opts.profile, output, totalFrames: t.totalFrames, segments, join,
    post: postPlan(t, base, t.totalFrames), audio: null, workDir: opts.workDir,
    tool: { ffmpeg: info.path, ffprobe: opts.ffprobe, version: info.version, major: info.major, minor: info.minor } };
}

/** Stable hash of the authored timeline plus the resolved frame layout. */
export function timelineHash(t: ResolvedTimeline): string {
  return hashJson(t);
}
