/**
 * Transition filters shared by joins and preview (040). Built-in xfade names pass through; `zoomfrom` and `iris` are custom xfade
 * expressions on gbrp input. In ffmpeg's custom xfade, P runs 1 → 0, so progress is q = 1 − P (eased with smoothstep); gbrp keeps every
 * plane full size and b0/b1/b2 must be chosen by PLANE when B is resampled.
 */
import { num, quoteExpr } from "./escape.ts";

export interface TransitionSpec {
  type: string;
  rect?: { x: number; y: number; width: number; height: number; radius: number } | undefined;
  center?: { x: number; y: number } | undefined;
  width: number; height: number;
}
export const CUSTOM_TRANSITIONS = ["zoomfrom", "iris"] as const;

/** Smoothstep of q = 1 − P. Written inline: st()/ld() registers are shared by xfade's slice threads and race (noisy frames). */
const E = "((1-P)*(1-P)*(3-2*(1-P)))";
const B_AT = (x: string, y: string) => `if(eq(PLANE,0),b0(${x},${y}),if(eq(PLANE,1),b1(${x},${y}),b2(${x},${y})))`;

/** Rounded rect from the source rect to the full frame; B is rescaled into it. Pure expression (no registers). */
function zoomfromExpr(s: TransitionSpec): string {
  const r = s.rect!;
  const W = num(s.width);
  const H = num(s.height);
  const rx = `(${num(r.x)}*(1-${E}))`;
  const ry = `(${num(r.y)}*(1-${E}))`;
  const rw = `(${num(r.width)}+(${W}-${num(r.width)})*${E})`;
  const rh = `(${num(r.height)}+(${H}-${num(r.height)})*${E})`;
  const rad = `min(${num(r.radius)}*(1-${E}),min(${rw},${rh})/2)`;
  const qx = `(abs(X-${rx}-${rw}/2)-${rw}/2+${rad})`;
  const qy = `(abs(Y-${ry}-${rh}/2)-${rh}/2+${rad})`;
  const dist = `(hypot(max(${qx},0),max(${qy},0))+min(max(${qx},${qy}),0)-${rad})`;
  return `if(lte(${dist},0),${B_AT(`(X-${rx})/${rw}*${W}`, `(Y-${ry})/${rh}*${H}`)},A)`;
}

/** Circle opening from the centre point until it covers the farthest corner. */
function irisExpr(s: TransitionSpec): string {
  const c = s.center ?? { x: s.width / 2, y: s.height / 2 };
  const far = Math.max(...[[0, 0], [s.width, 0], [0, s.height], [s.width, s.height]].map(([x, y]) => Math.hypot(x! - c.x, y! - c.y)));
  return `if(lte(hypot(X-${num(c.x)},Y-${num(c.y)}),${E}*${num(far + 2)}),B,A)`;
}

export function isCustom(type: string): boolean { return (CUSTOM_TRANSITIONS as readonly string[]).includes(type); }

/** The xfade filter (with gbrp conversion around custom expressions) as filter lists for the two inputs and the joined output. */
export function transitionFilters(spec: TransitionSpec, duration: number, offset: number): { input: string[]; xfade: string[] } {
  const timing = `duration=${num(duration)}:offset=${num(offset)}`;
  if (!isCustom(spec.type)) return { input: [], xfade: [`xfade=transition=${spec.type}:${timing}`] };
  const expr = spec.type === "zoomfrom" ? zoomfromExpr(spec) : irisExpr(spec);
  return { input: ["format=gbrp"], xfade: [`xfade=transition=custom:${timing}:expr=${quoteExpr(expr)}`, "format=yuv420p"] };
}

/** Labelled statements for string-built graphs (preview): [a]…[b]… → [out]. */
export function transitionChain(spec: TransitionSpec, duration: number, offset: number, labels: { a: string; b: string; out: string }): string[] {
  const f = transitionFilters(spec, duration, offset);
  if (!f.input.length) return [`[${labels.a}][${labels.b}]${f.xfade.join(",")}[${labels.out}]`];
  return [`[${labels.a}]${f.input.join(",")}[${labels.a}g]`, `[${labels.b}]${f.input.join(",")}[${labels.b}g]`,
    `[${labels.a}g][${labels.b}g]${f.xfade.join(",")}[${labels.out}]`];
}
