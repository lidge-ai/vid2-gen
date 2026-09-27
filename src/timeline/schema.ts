/** Authored timeline v1. Keep strict objects so misspelled fields fail at ingress. */
import { z } from "zod";

export const TimeLiteral = z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?(s|ms|f|b)$/)]);
const SignedOffset = z.string().regex(/^-?\d+(\.\d+)?(s|ms|f|b)$/);
export const EventRef = z.strictObject({ event: z.string().min(1), source: z.string().optional(), offset: SignedOffset.optional() });
export const MarkerRef = z.strictObject({ marker: z.string().min(1), offset: SignedOffset.optional() });
export const BarRef = z.strictObject({ bar: z.number().int().min(1), beat: z.number().min(1).default(1) });
export const Time = z.union([TimeLiteral, EventRef, MarkerRef, BarRef]);
export const Color = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
export const Output = z.strictObject({
  width: z.number().int().min(16).max(7680).default(1920), height: z.number().int().min(16).max(4320).default(1080),
  fps: z.union([z.number().positive(), z.string()]).default(30), background: Color.default("#000000"),
  container: z.enum(["mp4", "mov", "webm"]).default("mp4"), videoCodec: z.enum(["h264", "hevc", "prores", "vp9"]).default("h264"),
  quality: z.enum(["proxy", "standard", "high"]).default("high"),
});
export const Beat = z.union([
  z.strictObject({ bpm: z.number().min(20).max(300), offset: TimeLiteral.default(0), meter: z.number().int().min(1).max(12).default(4) }),
  z.strictObject({ map: z.string() }),
]);
export const Source = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("image"), path: z.string() }),
  z.strictObject({ type: z.literal("video"), path: z.string(), muted: z.boolean().default(false) }),
  z.strictObject({ type: z.literal("audio"), path: z.string() }),
  z.strictObject({ type: z.literal("capture"), session: z.string() }),
  z.strictObject({ type: z.literal("generate"), provider: z.string(), kind: z.enum(["image", "video", "audio"]), prompt: z.string(), options: z.record(z.string(), z.unknown()).default({}) }),
  z.strictObject({ type: z.literal("color"), color: Color }),
]);
export const Font = z.strictObject({ path: z.string().optional(), family: z.string().optional() }).refine(f => f.path || f.family);
export const TRANSITIONS = ["cut", "fade", "fadeblack", "fadewhite", "dissolve", "slideleft", "slideright", "slideup", "slidedown", "wipeleft", "wiperight",
  "wipeup", "wipedown", "circleopen", "circleclose", "radial", "smoothleft", "smoothright", "smoothup", "smoothdown", "pixelize", "zoomin", "diagtl", "diagtr",
  "diagbl", "diagbr", "hlslice", "hrslice", "vuslice", "vdslice", "squeezeh", "squeezev", "distance", "hblur"] as const;
export const Transition = z.strictObject({ type: z.enum(TRANSITIONS), duration: TimeLiteral.default("0.3s") });
export const Ease = z.enum(["linear", "in", "out", "inout", "punch"]);
export const CameraKey = z.strictObject({ at: TimeLiteral, zoom: z.number().min(0.2).max(8).default(1), x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5), ease: Ease.default("inout") });
export const Camera = z.union([z.array(CameraKey).min(1), z.strictObject({ auto: z.literal("events"), zoom: z.number().default(1.6), hold: TimeLiteral.default("0.8s") })]);
export const Window = z.strictObject({ x: z.number().int(), y: z.number().int(), width: z.number().int().positive(), height: z.number().int().positive(),
  radius: z.number().int().min(0).default(18), shadow: z.boolean().default(true), border: z.boolean().default(true),
  perspective: z.strictObject({ rx: z.number().min(-45).max(45).default(0), ry: z.number().min(-45).max(45).default(0) }).optional() });
const Span = { start: TimeLiteral.default(0), end: TimeLiteral.optional() };
export const MediaLayer = z.strictObject({ type: z.literal("media"), source: z.string(), fit: z.enum(["cover", "contain", "blurfill"]).default("cover"),
  in: Time.optional(), out: Time.optional(), speed: z.number().positive().default(1), camera: Camera.optional(), window: Window.optional(),
  motion: z.enum(["none", "kenburns", "punch", "drift"]).default("none"), opacity: z.number().min(0).max(1).default(1),
  chroma: z.strictObject({ color: Color, similarity: z.number().default(0.2), blend: z.number().default(0.05) }).optional(),
  volume: z.number().min(0).max(4).default(0),
  cursor: z.strictObject({ style: z.enum(["arrow", "dot", "none"]).default("arrow"), ripple: z.boolean().default(true), scale: z.number().positive().default(1) }).optional(),
  ...Span });
export const TextLayer = z.strictObject({ type: z.literal("text"), text: z.string().min(1), font: z.string().default("sans"),
  weight: z.enum(["regular", "semibold", "bold", "black", "italic"]).default("bold"), size: z.number().positive().default(72), color: Color.default("#F5F5F2"),
  x: z.union([z.number(), z.literal("center")]).default("center"), y: z.union([z.number(), z.literal("center")]).default("center"),
  align: z.enum(["left", "center", "right"]).default("center"), maxWidth: z.number().positive().optional(),
  animation: z.enum(["none", "fade", "rise", "slam", "pop", "type", "wipe", "blur"]).default("rise"), animationDuration: TimeLiteral.default("0.35s"),
  box: z.strictObject({ color: Color, padding: z.number().default(24) }).optional(),
  shadow: z.strictObject({ color: Color.default("#00000099"), blur: z.number().default(8), y: z.number().default(3) }).optional(), ...Span });
export const ShapeLayer = z.strictObject({ type: z.literal("shape"), shape: z.literal("rect"), x: z.number(), y: z.number(), width: z.number(), height: z.number(),
  color: Color, radius: z.number().default(0), ...Span });
export const OverlayLayer = z.strictObject({ type: z.literal("overlay"), source: z.string(), blend: z.enum(["screen", "add", "normal"]).default("screen"),
  opacity: z.number().min(0).max(1).default(0.9), motion: z.enum(["none", "sweep"]).default("none"), ...Span });
export const Layer = z.discriminatedUnion("type", [MediaLayer, TextLayer, ShapeLayer, OverlayLayer]);
export const Effect = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("grade"), lut: z.string().optional(), brightness: z.number().default(0), contrast: z.number().default(1),
    saturation: z.number().default(1), temperature: z.number().int().min(1000).max(40000).optional() }),
  z.strictObject({ type: z.literal("motionblur"), frames: z.number().int().min(2).max(8).default(3) }),
  z.strictObject({ type: z.literal("vignette"), strength: z.number().min(0).max(1).default(0.3) }),
  z.strictObject({ type: z.literal("grain"), strength: z.number().min(0).max(30).default(3) }),
  z.strictObject({ type: z.literal("flash"), at: TimeLiteral, strength: z.number().default(0.5), decay: z.number().default(12) }),
  z.strictObject({ type: z.literal("rgbsplit"), at: TimeLiteral, frames: z.number().int().default(3), px: z.number().int().default(12) }),
]);
export const Scene = z.strictObject({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/), duration: TimeLiteral, background: z.union([Color, z.string()]).optional(),
  layers: z.array(Layer).default([]), effects: z.array(Effect).default([]), transition: Transition.optional(), notes: z.string().optional() });
export const SynthSpec = z.strictObject({ preset: z.string().default("launch"), key: z.string().default("Am"), progression: z.array(z.string()).optional(),
  sections: z.array(z.strictObject({ at: TimeLiteral, energy: z.enum(["intro", "build", "drop", "break", "outro"]) })).optional() });
export const Cue = z.strictObject({ at: Time, sfx: z.string(), volume: z.number().min(0).max(4).default(1) });
export const Audio = z.strictObject({ music: z.union([z.strictObject({ source: z.string(), volume: z.number().default(1), fadeOut: TimeLiteral.default("1s") }),
  z.strictObject({ synth: SynthSpec, volume: z.number().default(1) })]).optional(), cues: z.array(Cue).default([]),
  voice: z.array(z.strictObject({ source: z.string(), at: Time, volume: z.number().default(1) })).default([]),
  duckMusicUnderVoice: z.boolean().default(true), loudness: z.strictObject({ target: z.number().default(-14), truePeak: z.number().default(-1) }).default({ target: -14, truePeak: -1 }) });
export const TimelineSchema = z.strictObject({ $schema: z.string().optional(), version: z.literal(1), output: Output.prefault({}),
  beat: Beat.optional(), sources: z.record(z.string(), Source).default({}), fonts: z.record(z.string(), Font).default({}),
  markers: z.record(z.string(), z.union([TimeLiteral, BarRef])).default({}),
  scenes: z.array(Scene).min(1), overlays: z.array(OverlayLayer).default([]), effects: z.array(Effect).default([]), audio: Audio.optional() });
export type Timeline = z.infer<typeof TimelineSchema>;
export type AuthoredTimeline = z.input<typeof TimelineSchema>;
