import type { BeatGrid, Fps } from "../shared/time.ts";
import type { Timeline } from "./schema.ts";

/** Where the first media layer using a capture source sits: absolute timeline start frame, footage in-point, speed, timeline fps. */
export interface CapturePlacement { startFrame: number; inSeconds: number; speed: number; fps: Fps }

/**
 * Capture adapter boundary (030). footageSeconds: event time on the footage clock (used by a capture layer's own in/out).
 * place: records the first placement per source (later calls ignored). resolve: event time on the timeline clock after placement.
 */
export interface EventResolver {
  footageSeconds(ref: { event: string; source?: string }): { seconds: number; sourceId: string };
  place(sourceId: string, placement: CapturePlacement): void;
  resolve(ref: { event: string; source?: string }): { frame: number; sourceId: string };
}

export interface ResolveOptions {
  baseDir: string;
  events?: EventResolver;
}

export interface ResolvedTime {
  frame: number;
  seconds: number;
}

export interface ResolvedSpan {
  startFrame: number;
  endFrame: number;
  startSeconds: number;
  endSeconds: number;
  absoluteStartFrame: number;
  absoluteEndFrame: number;
  absoluteStartSeconds: number;
  absoluteEndSeconds: number;
}

export type Layer = Timeline["scenes"][number]["layers"][number];
export type Effect = Timeline["effects"][number];
export type ResolvedLayer = Layer & ResolvedSpan & { inFrame?: number; outFrame?: number; inSeconds?: number; outSeconds?: number };
export type ResolvedEffect = Effect & { atFrame?: number; atSeconds?: number; absoluteAtFrame?: number; absoluteAtSeconds?: number };

export interface ResolvedTransition { type: string; frames: number }
export interface ResolvedScene {
  id: string;
  index: number;
  startFrame: number;
  startSeconds: number;
  frames: number;
  seconds: number;
  transitionIn: ResolvedTransition | null;
  transitionOut: ResolvedTransition | null;
  background?: string;
  layers: ResolvedLayer[];
  effects: ResolvedEffect[];
  notes?: string;
}

export interface ResolvedCue extends ResolvedTime { sfx: string; volume: number }
export interface ResolvedVoice extends ResolvedTime { source: string; volume: number }
export type ResolvedAudio = Omit<NonNullable<Timeline["audio"]>, "cues" | "voice"> & {
  cues: ResolvedCue[];
  voice: ResolvedVoice[];
};

export interface ResolvedTimeline {
  version: 1;
  fps: Fps;
  width: number;
  height: number;
  output: Timeline["output"];
  beat?: BeatGrid;
  sources: Timeline["sources"];
  fonts: Timeline["fonts"];
  markers: Record<string, ResolvedTime>;
  scenes: ResolvedScene[];
  overlays: ResolvedLayer[];
  effects: ResolvedEffect[];
  audio?: ResolvedAudio;
  totalFrames: number;
  totalSeconds: number;
}

export interface ValidationIssue { path: string; code: string; message: string }
