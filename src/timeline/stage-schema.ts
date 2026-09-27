/** Authored stage layer (010): nodes with base properties, keyed tracks and SFX events, all times relative to the layer start. */
import { z } from "zod";
import { Color, Span, TimeLiteral } from "./primitives.ts";

const Key = z.string().regex(/^[A-Za-z0-9_.:#-]+$/);
const Base = {
  key: Key, parent: Key.optional(), x: z.number().default(0), y: z.number().default(0),
  anchorX: z.number().default(0.5), anchorY: z.number().default(0.5), scale: z.number().default(1), scaleX: z.number().default(1),
  scaleY: z.number().default(1), rotation: z.number().default(0), opacity: z.number().min(0).max(1).default(1),
  blur: z.number().min(0).max(32).default(0), z: z.number().default(0),
};
export const TextWeight = z.enum(["regular", "semibold", "bold", "black", "italic"]);
export const StageText = z.strictObject({ kind: z.literal("text"), text: z.string().min(1), font: z.string().default("sans"),
  weight: TextWeight.default("semibold"), size: z.number().positive().default(72), color: Color.default("#F5F5F2"),
  letterSpacing: z.number().default(0), reveal: z.number().min(0).optional(), ...Base });
export const StageImage = z.strictObject({ kind: z.literal("image"), source: z.string(), width: z.number().positive(),
  height: z.number().positive(), radius: z.number().min(0).default(0), fit: z.enum(["cover", "contain"]).default("cover"), ...Base });
export const StageShadow = z.strictObject({ color: Color.default("#00000066"), blur: z.number().min(0).max(32).default(16),
  x: z.number().default(0), y: z.number().default(8) });
export const StageRect = z.strictObject({ kind: z.literal("rect"), width: z.number().min(0), height: z.number().min(0),
  radius: z.number().min(0).default(0), fill: Color.default("#FFFFFF"), stroke: Color.optional(), strokeWidth: z.number().min(0).default(0),
  shadow: StageShadow.optional(), glow: z.strictObject({ color: Color, blur: z.number().min(0).max(32).default(16) }).optional(), ...Base });
export const StageGroup = z.strictObject({ kind: z.literal("group"), clip: z.strictObject({ x: z.number().default(0), y: z.number().default(0),
  width: z.number().positive(), height: z.number().positive(), radius: z.number().min(0).default(0) }).optional(), ...Base });
export const StageNodeSchema = z.discriminatedUnion("kind", [StageText, StageImage, StageRect, StageGroup]);

export const STAGE_PROPS = ["x", "y", "scale", "scaleX", "scaleY", "rotation", "opacity", "blur", "width", "height", "radius",
  "strokeWidth", "progress", "reveal", "color", "fill", "stroke"] as const;
export const COLOR_PROPS: readonly string[] = ["color", "fill", "stroke"];
/** Props measured in authored pixels (scaled by the render profile). */
export const SPATIAL_PROPS: readonly string[] = ["x", "y", "width", "height", "radius", "blur", "strokeWidth"];
export const Spring = z.strictObject({ stiffness: z.number().positive().default(170), damping: z.number().positive().default(22),
  mass: z.number().positive().default(1) });
export const StageKeySchema = z.strictObject({ at: TimeLiteral, value: z.union([z.number(), Color]),
  ease: z.enum(["linear", "in", "out", "inout", "punch", "spring", "hold"]).default("inout"), spring: Spring.optional() });
export const StageTrackSchema = z.strictObject({ node: Key, prop: z.enum(STAGE_PROPS), keys: z.array(StageKeySchema).min(1) });
export const StageEventSchema = z.strictObject({ at: TimeLiteral, kind: z.enum(["glyph", "token", "icon", "click", "grow", "state", "tick"]),
  sfx: z.string().optional() });
export const StageLayer = z.strictObject({ type: z.literal("stage"), nodes: z.array(StageNodeSchema).min(1),
  tracks: z.array(StageTrackSchema).default([]), events: z.array(StageEventSchema).default([]), ...Span });
