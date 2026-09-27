/** Authored kinetic typography layer (020): token states with entrances, magic-move reflow, accent decay, pill and camera follow. */
import { z } from "zod";
import { Color, Span, TimeLiteral } from "./primitives.ts";
import { Spring, TextWeight } from "./stage-schema.ts";

export const ENTER_STYLES = ["rise", "blur", "fade", "pop", "drop", "type", "scramble", "none"] as const;
export const EXIT_STYLES = ["blur", "fade", "fall", "none"] as const;
export const KineticToken = z.strictObject({ text: z.string().min(1).optional(), icon: z.string().min(1).optional(), key: z.string().optional(),
  color: Color.optional(), accent: z.boolean().optional(), enter: z.enum(ENTER_STYLES).optional(), newline: z.boolean().optional() })
  .refine((t) => Boolean(t.text) !== Boolean(t.icon), { message: "a token has exactly one of text or icon" });
export const KineticExpand = z.strictObject({ token: z.string().min(1),
  to: z.union([z.literal("frame"), z.strictObject({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() })]).default("frame"),
  radius: z.number().min(0).default(0), fill: Color.optional() });
export const KineticState = z.strictObject({ at: TimeLiteral, text: z.string().optional(), tokens: z.array(KineticToken).optional(),
  expand: KineticExpand.optional() }).refine((s) => (s.text === undefined) !== (s.tokens === undefined), { message: "a state has text or tokens" });
export const KineticLayer = z.strictObject({ type: z.literal("kinetic"),
  x: z.number().default(960), y: z.number().default(540), align: z.enum(["left", "center", "right"]).default("center"),
  maxWidth: z.number().positive().optional(), lineHeight: z.number().positive().default(1.18), gap: z.number().min(0).default(0.28),
  size: z.number().positive().default(84), font: z.string().default("sans"), weight: TextWeight.default("semibold"),
  color: Color.default("#F5F5F2"), letterSpacing: z.number().default(-1),
  accent: z.strictObject({ color: Color.default("#5AC8FA"), decay: TimeLiteral.default("0.3s") }).optional(),
  enter: z.strictObject({ style: z.enum(ENTER_STYLES).default("rise"), duration: TimeLiteral.default("0.38s"), stagger: TimeLiteral.default("0.11s"),
    glyphStagger: TimeLiteral.default("0.035s"), distance: z.number().default(14), blur: z.number().min(0).max(32).default(10) }).prefault({}),
  exit: z.strictObject({ style: z.enum(EXIT_STYLES).default("blur"), duration: TimeLiteral.default("0.25s") }).prefault({}),
  move: Spring.prefault({}),
  highlight: z.strictObject({ dim: Color.default("#8E8E93"), sweep: TimeLiteral.default("0.12s"), delay: TimeLiteral.default("0.2s") }).optional(),
  pill: z.strictObject({ fill: Color.default("#1C1C1ECC"), stroke: Color.optional(), strokeWidth: z.number().min(0).default(1.5),
    radius: z.number().min(0).default(999), padX: z.number().min(0).default(36), padY: z.number().min(0).default(18),
    glow: Color.optional() }).optional(),
  camera: z.strictObject({ mode: z.enum(["fixed", "follow"]).default("follow"), width: z.number().positive().default(1500),
    margin: z.number().min(0).default(120) }).optional(),
  iconScale: z.number().positive().default(1.05), iconStroke: z.number().positive().default(2),
  states: z.array(KineticState).min(1), ...Span });
