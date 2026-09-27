/** Shared kinetic preset types and helpers (020). */
import type { SpringParams } from "../types.ts";
import type { Key } from "./builder.ts";
import type { LayoutOptions, Placed } from "./layout.ts";
import type { Token } from "./tokens.ts";

export interface KineticConfig {
  layout: Omit<LayoutOptions, "fontPath"> & { fontPath: string };
  color: string; letterSpacing: number;
  accent?: { color: string; decay: number } | undefined;
  enter: { style: string; duration: number; stagger: number; glyphStagger: number; distance: number; blur: number };
  exit: { style: string; duration: number };
  move: { stiffness: number; damping: number; mass: number };
  highlight?: { dim: string; sweep: number; delay: number } | undefined;
  pill?: { fill: string; stroke?: string | undefined; strokeWidth: number; radius: number; padX: number; padY: number; glow?: string | undefined } | undefined;
  camera?: { mode: "fixed" | "follow"; width: number; margin: number } | undefined;
  iconStroke: number;
  /** Icon token name → stroke paths (built-in set) or an image file path. */
  icons: (name: string) => { paths: string[] } | { image: string };
  states: { at: number; tokens: Token[]; expand?: { token: string; to: { x: number; y: number; width: number; height: number }; radius: number; fill?: string | undefined } | undefined }[];
  /** Layer duration in seconds (for the final state's end). */
  duration: number;
  canvas: { width: number; height: number };
}

export interface Actor { token: Token; appear: number; gone?: number; placements: { t: number; p: Placed }[] }
export const GROUP = "kin:group";
/** The camera starts moving this long before the token that needs it appears. */
export const CAMERA_LEAD = 0.15;
/** Same stiffness, damping raised to critical: geometry that must not overshoot (pill, camera, plate). */
export const critical = (s: SpringParams): SpringParams => ({ ...s, damping: Math.max(s.damping, 2 * Math.sqrt(s.stiffness * s.mass)) });

/** Position keys of an actor: its first layout box, then a spring to each later state's box. */
export function moveKeys(a: Actor, pick: (p: Placed) => number, spring: KineticConfig["move"]): Key[] {
  return a.placements.map((pl, i) => (i === 0 ? { t: 0, v: pick(pl.p) } : { t: pl.t, v: pick(pl.p), ease: "spring" as const, spring }));
}
