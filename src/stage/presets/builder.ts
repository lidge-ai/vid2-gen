/** Builds a StageSpec from preset code written in seconds and authored pixels (scaled by the render profile here, once). */
import type { SpringParams, StageEase, StageEvent, StageEventKind, StageNode, StageProp, StageSpec, StageTrack } from "../types.ts";
import { STAGE_VERSION } from "../types.ts";

export interface Key { t: number; v: number | string; ease?: StageEase; spring?: SpringParams }
const SPATIAL = new Set(["x", "y", "width", "height", "radius", "blur", "strokeWidth", "size", "letterSpacing"]);

export const NODE_BASE = { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, z: 0 };

export class SpecBuilder {
  readonly nodes: StageNode[] = [];
  readonly tracks: StageTrack[] = [];
  readonly events: StageEvent[] = [];
  /** Stage frames per second (output fps × internal rate). */
  readonly rate: number;
  /** Authored px → canvas px. */
  readonly scale: number;
  constructor(rate: number, scale: number) { this.rate = rate; this.scale = scale; }
  frame(seconds: number): number { return Math.max(0, Math.round(seconds * this.rate)); }
  add<N extends StageNode>(node: N): N {
    const out: Record<string, unknown> = { ...node };
    for (const [k, v] of Object.entries(out)) if (SPATIAL.has(k) && typeof v === "number") out[k] = v * this.scale;
    if (node.kind === "rect" && node.shadow) out["shadow"] = { ...node.shadow, blur: node.shadow.blur * this.scale,
      x: node.shadow.x * this.scale, y: node.shadow.y * this.scale };
    if (node.kind === "rect" && node.glow) out["glow"] = { ...node.glow, blur: node.glow.blur * this.scale };
    if (node.kind === "group" && node.clip) out["clip"] = Object.fromEntries(Object.entries(node.clip).map(([k, v]) => [k, v * this.scale]));
    this.nodes.push(out as unknown as N);
    return node;
  }
  /** Append keys (seconds, authored px) to a node property; keys are merged and sorted by the renderer's track index. */
  key(node: string, prop: StageProp, keys: Key[]): void {
    if (!keys.length) return;
    const spatial = SPATIAL.has(prop);
    this.tracks.push({ node, prop, keys: keys.map((k) => ({ frame: this.frame(k.t), ease: k.ease, ...(k.spring ? { spring: k.spring } : {}),
      value: spatial && typeof k.v === "number" ? k.v * this.scale : k.v })) });
  }
  event(t: number, kind: StageEventKind): void { this.events.push({ frame: this.frame(t), kind }); }
  spec(width: number, height: number, fps: { num: number; den: number }, frames: number, holdFrame?: number): StageSpec {
    return { version: STAGE_VERSION, width, height, fps, frames, ...(holdFrame === undefined ? {} : { holdFrame }),
      nodes: this.nodes, tracks: this.tracks, events: this.events.sort((a, b) => a.frame - b.frame) };
  }
}
