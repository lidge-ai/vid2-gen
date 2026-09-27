/** Property evaluation at a stage frame: base node values overridden by keyed tracks with eases or springs. */
import { fpsValue } from "../shared/index.ts";
import type { Fps } from "../shared/index.ts";
import { springValue } from "./springs.ts";
import type { StageEase, StageKey, StageNode, StageProp, StageTrack } from "./types.ts";

export type TrackIndex = Map<string, Map<StageProp, StageKey[]>>;

export function indexTracks(tracks: StageTrack[]): TrackIndex {
  const index: TrackIndex = new Map();
  for (const track of tracks) {
    const byProp = index.get(track.node) ?? new Map<StageProp, StageKey[]>();
    const keys = [...(byProp.get(track.prop) ?? []), ...track.keys].sort((a, b) => a.frame - b.frame);
    byProp.set(track.prop, keys);
    index.set(track.node, byProp);
  }
  return index;
}

export function ease(name: StageEase | undefined, t: number): number {
  const v = Math.max(0, Math.min(1, t));
  switch (name ?? "inout") {
    case "linear": return v;
    case "in": return v * v;
    case "out": return 1 - (1 - v) * (1 - v);
    case "inout": return v * v * (3 - 2 * v);
    case "punch": return 1 - Math.exp(-6 * v);
    case "hold": return v < 1 ? 0 : 1;
    case "spring": return v;
  }
}

export function parseColor(value: string): [number, number, number, number] {
  const hex = value.replace("#", "");
  const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), hex.length >= 8 ? n(6) : 255];
}

export function colorString(c: readonly number[]): string {
  return "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

const toLinear = (v: number) => (v / 255) ** 2.2;
const fromLinear = (v: number) => 255 * Math.max(0, v) ** (1 / 2.2);

function mixColor(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const rgb = [0, 1, 2].map((i) => fromLinear(toLinear(ca[i]!) + (toLinear(cb[i]!) - toLinear(ca[i]!)) * t));
  return colorString([...rgb, ca[3] + (cb[3] - ca[3]) * t]);
}

/**
 * Keyframe semantics: an ordinary key is the value reached AT its frame, eased from the previous key (the key's own ease). A spring key
 * is a release: at its frame the value starts moving from wherever the track is toward the key's value and keeps settling afterwards.
 * An ordinary key that follows a spring key eases from the spring's current motion to its own value.
 */
export function interpolate(keys: StageKey[], frame: number, fps: Fps, base?: number | string): number | string {
  const first = keys[0]!;
  if (frame < first.frame) return first.ease === "spring" && base !== undefined ? base : first.value;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1]!.frame <= frame) i++;
  const k = keys[i]!;
  const next = keys[i + 1];
  const from = k.ease !== "spring" ? undefined : i > 0 ? interpolate(keys.slice(0, i), k.frame, fps, base) : base;
  const current = from === undefined ? k.value : blend(from, k.value, springValue((frame - k.frame) / fpsValue(fps), k.spring));
  if (!next || next.ease === "spring" || next.frame <= k.frame) return current;
  return blend(current, next.value, ease(next.ease, (frame - k.frame) / (next.frame - k.frame)));
}

function blend(a: number | string, b: number | string, t: number): number | string {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  if (typeof a === "string" && typeof b === "string") return mixColor(a, b, Math.max(0, Math.min(1, t)));
  return t < 1 ? a : b;
}

/** The node with every tracked property evaluated at frame. */
export function nodeAt<N extends StageNode>(node: N, index: TrackIndex, frame: number, fps: Fps): N {
  const props = index.get(node.key);
  if (!props) return node;
  const out: Record<string, unknown> = { ...node };
  for (const [prop, keys] of props) if (keys.length) out[prop] = interpolate(keys, frame, fps, out[prop] as number | string | undefined);
  return out as N;
}
