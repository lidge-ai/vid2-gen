/** Look and HUD contracts (devlog 260928_film_grammar/030 + reflection 031). Edited by main only; imports primitives to avoid a cycle. */
import { z } from "zod";
import { Color, Span, TimeLiteral } from "./primitives.ts";
import type { ResolvedSpan } from "./types.ts";

export const Look = z.strictObject({
  preset: z.enum(["film", "riso", "paper"]),
  /** Only valid for riso (validate issue `look.palette` otherwise); default RISO_DEFAULT. */
  palette: z.array(Color).min(2).max(6).optional(),
  strength: z.number().min(0).max(1).default(1),
  seed: z.number().int().min(0).max(2147483647).default(0),
});
export const RISO_DEFAULT = ["#1B1B1B", "#FF48B0", "#0078BF", "#F2EDE4"] as const;

const HudKey = z.strictObject({ at: TimeLiteral, value: z.number() });
const HudItem = z.strictObject({ at: TimeLiteral, text: z.string().min(1).max(120) });

export const HudOverlay = z.strictObject({
  type: z.literal("hud"), ...Span,
  font: z.string().default("mono"),
  size: z.number().positive().default(28),
  color: Color.default("#F5F5F2"),
  accent: Color.optional(),
  margin: z.number().min(0).default(48),
  corners: z.boolean().default(true),
  label: z.string().min(1).max(60).optional(),
  counter: z.strictObject({
    keys: z.array(HudKey).min(1), mode: z.enum(["hold", "linear"]).default("linear"),
    decimals: z.number().int().min(0).max(4).default(0), pad: z.number().int().min(0).max(9).default(0),
    prefix: z.string().default(""), suffix: z.string().default(""),
  }).optional(),
  timecode: z.strictObject({ mode: z.enum(["elapsed", "frames"]).default("elapsed"), prefix: z.string().default("") }).optional(),
  ticker: z.strictObject({
    items: z.array(HudItem).min(1), height: z.number().positive().default(44), background: Color.default("#000000B3"),
  }).optional(),
});

export type LookSpec = z.infer<typeof Look>;
export type Hud = z.infer<typeof HudOverlay>;
/** Key and item frames are absolute output frames (beat offset added once), sorted, unique, inside [startFrame, endFrame). */
export type ResolvedHud = Hud & ResolvedSpan & {
  counterKeys: { frame: number; value: number }[];
  tickerItems: { frame: number; text: string }[];
};
