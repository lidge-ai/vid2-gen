/** Authored UI component layers (030): field, bars, ticker, chips. Positions in authored px, times relative to the layer start. */
import { z } from "zod";
import { Color, Span, TimeLiteral } from "./primitives.ts";
import { Spring, TextWeight } from "./stage-schema.ts";

const Point = z.strictObject({ x: z.number(), y: z.number() });
const Theme = z.enum(["dark", "light"]).default("dark");
export const ComponentStyleSchema = z.strictObject({ fill: Color.optional(), stroke: Color.optional(), strokeWidth: z.number().min(0).optional(),
  radius: z.number().min(0).optional(), glow: Color.optional(), text: Color.optional(), muted: Color.optional(), accent: Color.optional(),
  track: Color.optional(), shadow: Color.optional() });
const Common = { font: z.string().default("sans"), weight: TextWeight.default("regular"), theme: Theme, style: ComponentStyleSchema.optional(), ...Span };
const Icon = z.string().min(1);

export const FieldLayer = z.strictObject({ type: z.literal("field"), x: z.number().default(960), y: z.number().default(540),
  width: z.number().positive().default(720), height: z.number().positive().default(76), radius: z.number().min(0).default(999),
  grow: z.strictObject({ maxWidth: z.number().positive().default(1400), padX: z.number().min(0).default(32) }).optional(),
  placeholder: z.string().optional(), size: z.number().positive().default(32),
  typing: z.array(z.strictObject({ at: TimeLiteral, text: z.string().min(1), glyph: TimeLiteral.default("0.045s") })).default([]),
  clear: TimeLiteral.optional(), mask: z.strictObject({ at: TimeLiteral, char: z.string().min(1).max(2).default("•") }).optional(),
  accent: z.strictObject({ color: Color.optional(), decay: TimeLiteral.default("0.3s") }).optional(), caret: z.boolean().default(true),
  cursor: z.strictObject({ style: z.enum(["ibeam", "arrow", "hand"]).default("ibeam"), from: Point, at: TimeLiteral, click: TimeLiteral.optional() }).optional(),
  move: Spring.prefault({}), ...Common });

export const BarsLayer = z.strictObject({ type: z.literal("bars"), x: z.number().default(360), y: z.number().default(360),
  width: z.number().positive().default(1000), rowHeight: z.number().positive().default(44), gap: z.number().min(0).default(16),
  items: z.array(z.strictObject({ label: z.string().min(1), note: z.string().optional(), value: z.number(), highlight: z.boolean().optional() })).min(1),
  max: z.number().positive().default(100), unit: z.string().default("%"), decimals: z.number().int().min(0).max(3).default(0),
  delay: TimeLiteral.default(0), grow: TimeLiteral.default("0.8s"), stagger: TimeLiteral.default("0.12s"), countUp: z.boolean().default(true),
  size: z.number().positive().default(22), ...Common });

export const TickerLayer = z.strictObject({ type: z.literal("ticker"), x: z.number().default(560), y: z.number().default(540),
  prefix: z.string().optional(), items: z.array(z.strictObject({ text: z.string().min(1), icon: Icon.optional() })).min(2),
  delay: TimeLiteral.default(0), interval: TimeLiteral.default("0.55s"), visible: z.number().int().min(1).max(6).default(4),
  size: z.number().positive().default(64), move: Spring.prefault({}), ...Common });

export const ChipsLayer = z.strictObject({ type: z.literal("chips"), x: z.number().default(760), y: z.number().default(360),
  direction: z.enum(["column", "row"]).default("column"), gap: z.number().min(0).default(18),
  items: z.array(z.strictObject({ at: TimeLiteral, text: z.string().min(1), icon: Icon.optional(), note: z.string().optional() })).min(1),
  connector: z.strictObject({ from: Point, dot: z.boolean().default(true) }).optional(), size: z.number().positive().default(26), ...Common });
