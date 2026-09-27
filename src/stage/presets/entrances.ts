/** Entrance, exit and colour choreography for kinetic tokens, written as keys on a SpecBuilder (seconds, authored px). */
import type { SpringParams } from "../types.ts";
import type { SpecBuilder } from "./builder.ts";

export interface MotionConfig { duration: number; distance: number; blur: number; exit: { style: string; duration: number } }
export interface ColorConfig { color: string; accent?: { color: string; decay: number } | undefined;
  highlight?: { dim: string; at: number } | undefined }
const POP: SpringParams = { stiffness: 260, damping: 15, mass: 1 };

/** Whole-node entrance at t. base = the node's resting y and scale. */
export function enterNode(b: SpecBuilder, key: string, style: string, t: number, c: MotionConfig, baseY: number): void {
  const end = t + c.duration;
  if (style === "none") { b.key(key, "opacity", [{ t, v: 0 }, { t, v: 1, ease: "hold" }]); return; }
  if (style === "pop") {
    b.key(key, "opacity", [{ t, v: 0 }, { t: t + Math.min(0.12, c.duration), v: 1, ease: "out" }]);
    b.key(key, "scale", [{ t, v: 0.55 }, { t, v: 1, ease: "spring", spring: POP }]);
    return;
  }
  b.key(key, "opacity", [{ t, v: 0 }, { t: end, v: 1, ease: "out" }]);
  if (style === "rise") b.key(key, "y", [{ t, v: baseY + c.distance }, { t: end, v: baseY, ease: "out" }]);
  if (style === "rise" || style === "blur") b.key(key, "blur", [{ t, v: c.blur }, { t: end, v: 0, ease: "out" }]);
  if (style === "blur") b.key(key, "scale", [{ t, v: 1.06 }, { t: end, v: 1, ease: "out" }]);
}

/** Per-glyph entrances for drop/type styles; glyph i starts at times[i]. */
export function enterGlyph(b: SpecBuilder, key: string, style: string, t: number, c: MotionConfig): void {
  if (style === "type") { b.key(key, "opacity", [{ t, v: 0 }, { t, v: 1, ease: "hold" }]); return; }
  const end = t + c.duration * 0.8;
  b.key(key, "opacity", [{ t, v: 0 }, { t: end, v: 1, ease: "out" }]);
  b.key(key, "y", [{ t, v: -c.distance * 1.2 }, { t: end, v: 0, ease: "out" }]);
  b.key(key, "blur", [{ t, v: c.blur * 0.6 }, { t: end, v: 0, ease: "out" }]);
}

/** Exit at t (the next state's time): holds the resting value until t. */
export function exitNode(b: SpecBuilder, key: string, t: number, c: MotionConfig, baseY: number, blurChildren: string[] = []): void {
  const { style, duration } = c.exit;
  if (style === "none") { b.key(key, "opacity", [{ t, v: 1 }, { t, v: 0, ease: "hold" }]); return; }
  b.key(key, "opacity", [{ t, v: 1 }, { t: t + duration, v: 0, ease: "in" }]);
  if (style === "fall") b.key(key, "y", [{ t, v: baseY }, { t: t + duration, v: baseY + c.distance * 1.5, ease: "in" }]);
  if (style === "blur") for (const k of blurChildren.length ? blurChildren : [key]) b.key(k, "blur", [{ t, v: 0 }, { t: t + duration, v: 8, ease: "in" }]);
}

/** Accent decay or reading highlight on a text or icon colour, starting when the node appears at t. */
export function colorKeys(b: SpecBuilder, key: string, t: number, c: ColorConfig): void {
  if (c.highlight) {
    b.key(key, "color", [{ t: 0, v: c.highlight.dim }, { t: c.highlight.at, v: c.highlight.dim }, { t: c.highlight.at + 0.14, v: c.color, ease: "linear" }]);
    return;
  }
  if (c.accent) b.key(key, "color", [{ t, v: c.accent.color }, { t: t + c.accent.decay, v: c.color, ease: "linear" }]);
}

/** Deterministic pseudo-random sequence (mulberry32) seeded from a string. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let r = Math.imul(h ^ (h >>> 15), 1 | h);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
