/**
 * Render IR: the typed contract between the compiler (src/compile) and the runner (src/render).
 * Owned by main (020 lane 0). Lanes build against these names; changes go through main.
 */
import type { Fps } from "../shared/index.ts";
import type { ResolvedEffect, ResolvedLayer, ResolvedTimeline } from "../timeline/index.ts";
import type { GraphBuilder } from "./graph.ts";

export type ProfileName = "proxy" | "final";

/** Output settings after the profile is applied (proxy halves width/height to even numbers). */
export interface ResolvedOutput {
  width: number;
  height: number;
  fps: Fps;
  background: string;
  container: "mp4" | "mov" | "webm";
  videoCodec: "h264" | "hevc" | "prores" | "vp9";
  quality: "proxy" | "standard" | "high";
}

export type InputKind = "image" | "video" | "audio" | "lavfi" | "png";
/** One ffmpeg input; args are everything before and including "-i <path|lavfi>". */
export interface InputSpec { id: string; args: string[]; path?: string; lavfi?: string; kind: InputKind }

/** Registers a command-line input for the current segment and returns its video stream label ("3:v"). */
export interface InputRegistry {
  add(spec: Omit<InputSpec, "id">): string;
  list(): InputSpec[];
}

export type SourceMap = ResolvedTimeline["sources"];
export type FontMap = ResolvedTimeline["fonts"];
export type LayerOf<T extends ResolvedLayer["type"]> = Extract<ResolvedLayer, { type: T }>;

/** Everything a layer/text builder needs for one scene segment. */
export interface BuildContext {
  graph: GraphBuilder;
  inputs: InputRegistry;
  /** Canvas size of the segment (profile applied). */
  width: number;
  height: number;
  /** Authored-to-canvas scale (proxy 0.5): multiply authored pixel values (x, y, size, window) by this. */
  scale: number;
  fps: Fps;
  /** Internal rate multiplier (motion blur renders at fps*rate, then tmix+fps back). */
  rate: number;
  /** Visible scene frames at fps (without spare tail frames). */
  frames: number;
  /** Frames the segment actually renders at fps (visible + spare tail frames for the next transition). */
  renderFrames: number;
  background: string;
  /** Oversample factor for sub-pixel camera motion: final 2, proxy 1. */
  oversample: 1 | 2;
  profile: ProfileName;
  sceneId: string;
  sources: SourceMap;
  fonts: FontMap;
  /** Per-plan scratch directory (ASS files, fonts copies). */
  workDir: string;
  /** Cache directory for generated PNGs (masks, shadows). */
  pngDir: string;
}

/**
 * A built layer. "overlay": an rgba stream placed at x/y (expressions allowed, evaluated per frame) during the
 * layer span; "blend": a full-canvas stream blended onto the canvas (it must be neutral outside its span).
 */
export type LayerOutput =
  | { mode: "overlay"; label: string; x: string; y: string }
  | { mode: "blend"; label: string; blend: "screen" | "add" | "normal"; opacity: number };

export type LayerBuilder<L extends ResolvedLayer = ResolvedLayer> = (layer: L, ctx: BuildContext) => LayerOutput;

/**
 * One run of consecutive text layers compiled to one ASS file; filter is the escaped "ass=filename=...:fontsdir=..."
 * string, applied to the canvas at the run's position in the layer order.
 */
export interface SceneText { ass: { path: string; content: string; fontsDir: string }; filter: string; fontFiles: string[] }

/** Effect timing clock: segment builders may use n/t relative to the segment; post builders use absolute t only. */
export type EffectClock = "segment" | "absolute-t";
export interface EffectContext { fps: Fps; rate: number; frames: number; width: number; height: number; clock: EffectClock }
export interface EffectDef<E extends ResolvedEffect = ResolvedEffect> {
  type: E["type"];
  requires: { filters: string[] };
  internalRate?(effect: E): number;
  build(effect: E, ctx: EffectContext): string[];
}

export interface SegmentPlan {
  id: string;
  sceneId: string;
  index: number;
  /** Visible frames at fps. */
  frames: number;
  /** Frames rendered (visible + spare tail, see joins). */
  renderFrames: number;
  width: number;
  height: number;
  fps: Fps;
  inputs: InputSpec[];
  graph: string;
  outLabel: string;
  /** Ordered ASS files, one per text run; the runner writes each before running the segment. */
  assFiles: { path: string; content: string; fontsDir: string }[];
  fontFiles: string[];
  internalRate: number;
  hash: string;
}

export interface JoinStep { kind: "xfade" | "concat"; transition?: string; frames: number; offsetFrames: number }
/** Join graph: inputs are the segment files in order ("0:v".."k:v"); output label is "vjoin". null graph = single segment (copy). */
export interface JoinPlan { segments: { id: string; frames: number; renderFrames: number }[]; steps: JoinStep[]; totalFrames: number; graph: string | null }

export interface OverlayOp { source: string; kind: "image" | "video"; blend: "screen" | "add" | "normal"; opacity: number; motion: "none" | "sweep"; startFrame: number; endFrame: number }
export interface EffectOp { type: string; filters: string[] }
/** Timeline-level overlays/effects after the join; graph input "0:v" = joined video, output label "vpost". */
export interface PostPlan { overlays: OverlayOp[]; effects: EffectOp[]; inputs: InputSpec[]; graph: string | null }

/** Opaque until 040 (audio); 020 always sets RenderPlan.audio to null. */
export interface AudioPlan { kind: string }

export interface RenderPlan {
  planVersion: 1;
  timelineHash: string;
  profile: ProfileName;
  output: ResolvedOutput;
  totalFrames: number;
  segments: SegmentPlan[];
  join: JoinPlan;
  post: PostPlan;
  audio: AudioPlan | null;
  workDir: string;
  tool: { ffmpeg: string; ffprobe: string; version: string; major: number; minor: number };
}

/** Spare frames rendered after each non-final segment so xfade never reads past the end of A (020 joins). */
export const SPARE_TAIL_FRAMES = 2;
