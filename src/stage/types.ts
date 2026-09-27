/**
 * Stage IR: the JSON-only description of a stage clip. The compiler builds it from a timeline layer (authored px already scaled by the
 * profile, times converted to stage frames); the renderer draws it frame by frame. Every value here must survive JSON round trips.
 */
import type { Fps } from "../shared/index.ts";

export const STAGE_VERSION = 1;

export type StageEase = "linear" | "in" | "out" | "inout" | "punch" | "spring" | "hold";
export interface SpringParams { stiffness: number; damping: number; mass: number }

/** Animatable node properties. Colours are "#RRGGBB" or "#RRGGBBAA" strings; everything else is a number. */
export type NumericProp = "x" | "y" | "scale" | "scaleX" | "scaleY" | "rotation" | "opacity" | "blur" | "width" | "height" | "radius" |
  "strokeWidth" | "progress" | "reveal";
export type ColorProp = "color" | "fill" | "stroke";
export type StageProp = NumericProp | ColorProp;

export interface StageKey { frame: number; value: number | string; ease?: StageEase | undefined; spring?: SpringParams | undefined }
export interface StageTrack { node: string; prop: StageProp; keys: StageKey[] }

export interface Shadow { color: string; blur: number; x: number; y: number }

interface NodeBase {
  key: string;
  parent?: string | undefined;
  x: number; y: number;
  /** Anchor inside the node's own box: 0 = left/top, 0.5 = centre, 1 = right/bottom. */
  anchorX: number; anchorY: number;
  scale: number; scaleX: number; scaleY: number;
  /** Degrees, clockwise. */
  rotation: number;
  opacity: number;
  /** Gaussian-like blur radius in px. */
  blur: number;
  z: number;
}

export interface TextNode extends NodeBase {
  kind: "text"; text: string;
  /** Absolute font file path. */
  font: string;
  /** Font size in px, normalized like libass (ascent + descent = size). */
  size: number;
  color: string;
  letterSpacing: number;
  /** Number of visible glyphs (typing); omitted = all. Animatable through the "reveal" prop. */
  reveal?: number | undefined;
}

export interface ImageNode extends NodeBase { kind: "image"; image: string; width: number; height: number; radius: number; fit: "cover" | "contain" }

export interface RectNode extends NodeBase {
  kind: "rect"; width: number; height: number; radius: number;
  fill: string; stroke?: string | undefined; strokeWidth: number;
  shadow?: Shadow | undefined; glow?: { color: string; blur: number } | undefined;
}

/** Stroke icon drawn from SVG path data in a 24x24 view box (built-in set, 020). */
export interface IconNode extends NodeBase { kind: "icon"; paths: string[]; size: number; color: string; strokeWidth: number;
  /** 0..1 portion of each path's length drawn (line-draw animation). */
  progress: number }

export interface GroupNode extends NodeBase { kind: "group"; clip?: { x: number; y: number; width: number; height: number; radius: number } | undefined }

export type StageNode = TextNode | ImageNode | RectNode | IconNode | GroupNode;

export type StageEventKind = "glyph" | "token" | "icon" | "click" | "grow" | "state" | "tick";
export interface StageEvent { frame: number; kind: StageEventKind; sfx?: string | undefined }

export interface StageSpec {
  version: typeof STAGE_VERSION;
  width: number;
  height: number;
  /** Stage frame rate: output fps × the segment's internal rate. */
  fps: Fps;
  frames: number;
  /** Frames after this one repeat it (the segment's spare tail frames past the layer end). */
  holdFrame?: number | undefined;
  nodes: StageNode[];
  tracks: StageTrack[];
  events: StageEvent[];
}
