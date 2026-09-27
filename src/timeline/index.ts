export { TimelineSchema, TimeLiteral, Time, EventRef, MarkerRef, BarRef, Color, Output, Beat, Source, Font, Transition, TRANSITIONS,
  Camera, CameraKey, Window, Layer, MediaLayer, TextLayer, ShapeLayer, OverlayLayer, Effect, Scene, Audio, Cue, SynthSpec } from "./schema.ts";
export type { Timeline, AuthoredTimeline } from "./schema.ts";
export { resolveTimeline } from "./resolve.ts";
export { validateTimeline } from "./validate.ts";
export type { CapturePlacement, CaptureEvent, CursorTrackSample, EventResolver, ResolveOptions, ResolvedTimeline, ResolvedScene, ResolvedLayer, ResolvedEffect, ResolvedAudio,
  ResolvedSpan, ResolvedTime, ResolvedCue, ResolvedVoice, ResolvedTransition, ValidationIssue } from "./types.ts";
