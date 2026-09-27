/** Resolve authored times to an integer-frame timeline before compilation. */
import { readFileSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { Vid2Error } from "../shared/errors.ts";
import { framesToSeconds, parseFps, parseSignedLiteral, parseTimeLiteral, toFrames } from "../shared/time.ts";
import type { BeatGrid, Fps } from "../shared/time.ts";
import type { Timeline } from "./schema.ts";
import type { Effect, Layer, ResolveOptions, ResolvedAudio, ResolvedEffect, ResolvedLayer, ResolvedScene, ResolvedSpan, ResolvedTime, ResolvedTimeline, ResolvedTransition } from "./types.ts";

type Time = NonNullable<Timeline["audio"]>["cues"][number]["at"];
type Context = { fps: Fps; beat?: BeatGrid; markers: Timeline["markers"]; events?: ResolveOptions["events"] };

function pathFrom(baseDir: string, path: string): string {
  return isAbsolute(path) ? path : resolvePath(baseDir, path);
}

function frame(value: number | string, ctx: Context, kind: "position" | "duration"): number {
  return toFrames(parseTimeLiteral(value), ctx, kind);
}

function offset(base: number, value: string | undefined, ctx: Context): number {
  if (!value) return base;
  const parsed = parseSignedLiteral(value);
  return Math.max(0, base + parsed.sign * toFrames(parsed.lit, ctx, "duration"));
}

function barFrame(bar: number, beat: number, ctx: Context): number {
  if (!ctx.beat) throw new Vid2Error("E_SCHEMA", "bar references need a beat grid");
  const count = (bar - 1) * ctx.beat.meter + (beat - 1);
  return ctx.beat.offsetFrames + Math.round(count * 60 * ctx.fps.num / (ctx.beat.bpm * ctx.fps.den));
}

function timeFrame(value: Time, ctx: Context): number {
  if (typeof value === "number" || typeof value === "string") return frame(value, ctx, "position");
  if ("bar" in value) return barFrame(value.bar, value.beat, ctx);
  if ("marker" in value) {
    const mark = ctx.markers[value.marker];
    if (mark === undefined) throw new Vid2Error("E_SCHEMA", `unknown marker: ${value.marker}`);
    const base = typeof mark === "object" ? barFrame(mark.bar, mark.beat, ctx) : frame(mark, ctx, "position");
    return offset(base, value.offset, ctx);
  }
  if (!ctx.events) throw new Vid2Error("E_INPUT", "event references need a capture session (030)");
  const ref = value.source === undefined ? { event: value.event } : { event: value.event, source: value.source };
  const result = ctx.events.resolve(ref);
  if (!Number.isInteger(result.frame) || result.frame < 0) throw new Vid2Error("E_INPUT", `invalid event frame: ${value.event}`);
  return offset(result.frame, value.offset, ctx);
}

function atTime(value: Time, ctx: Context): ResolvedTime {
  const at = timeFrame(value, ctx);
  return { frame: at, seconds: framesToSeconds(at, ctx.fps) };
}

function beatGrid(beat: Timeline["beat"], baseDir: string, fps: Fps): BeatGrid | undefined {
  if (!beat) return undefined;
  if ("bpm" in beat) return { bpm: beat.bpm, offsetFrames: toFrames(parseTimeLiteral(beat.offset), { fps }, "duration"), meter: beat.meter };
  const path = pathFrom(baseDir, beat.map);
  let data: unknown;
  try { data = JSON.parse(readFileSync(path, "utf8")); }
  catch (cause) { throw new Vid2Error("E_INPUT", `cannot read beat map: ${beat.map}`, { cause }); }
  if (!data || typeof data !== "object" || !("bpm" in data) || typeof data.bpm !== "number" || data.bpm <= 0) {
    throw new Vid2Error("E_SCHEMA", `beat map needs a positive bpm: ${beat.map}`);
  }
  // beats.json offset is seconds (040); a legacy offsetFrames key is still read.
  const raw = data as { bpm: number; offset?: number; offsetFrames?: number; meter?: number };
  const offsetFrames = typeof raw.offset === "number" ? Math.round(raw.offset * fps.num / fps.den) : raw.offsetFrames ?? 0;
  return { bpm: raw.bpm, offsetFrames, meter: raw.meter ?? 4 };
}

function span(start: number | string, end: number | string | undefined, sceneFrames: number, sceneStart: number, ctx: Context): ResolvedSpan {
  const startFrame = Math.min(sceneFrames, frame(start, ctx, "duration"));
  const endFrame = Math.min(sceneFrames, end === undefined ? sceneFrames : frame(end, ctx, "duration"));
  const absoluteStartFrame = sceneStart + startFrame;
  const absoluteEndFrame = sceneStart + endFrame;
  return { startFrame, endFrame, startSeconds: framesToSeconds(startFrame, ctx.fps), endSeconds: framesToSeconds(endFrame, ctx.fps),
    absoluteStartFrame, absoluteEndFrame, absoluteStartSeconds: framesToSeconds(absoluteStartFrame, ctx.fps),
    absoluteEndSeconds: framesToSeconds(absoluteEndFrame, ctx.fps) };
}

/** A capture layer's in/out live on the footage clock: EventRefs must name that layer's own source (030 clock rule). */
function footageSeconds(value: Time, sourceId: string, ctx: Context): number {
  if (typeof value === "number" || typeof value === "string") return framesToSeconds(frame(value, ctx, "position"), ctx.fps);
  if (!("event" in value)) throw new Vid2Error("E_INPUT", "a capture layer's in/out must be a time literal or an event reference");
  if (!ctx.events) throw new Vid2Error("E_INPUT", "event references need a capture session (030)");
  const ref = value.source === undefined ? { event: value.event, source: sourceId } : { event: value.event, source: value.source };
  if (ref.source !== sourceId) {
    throw new Vid2Error("E_INPUT", `in/out of a layer on capture source ${sourceId} cannot use an event of ${ref.source}`);
  }
  const base = ctx.events.footageSeconds(ref).seconds;
  if (!value.offset) return base;
  const parsed = parseSignedLiteral(value.offset);
  return Math.max(0, base + parsed.sign * framesToSeconds(toFrames(parsed.lit, ctx, "duration"), ctx.fps));
}

function captureLayer(layer: Extract<Layer, { type: "media" }>, timing: ResolvedSpan, ctx: Context): ResolvedLayer {
  const inSeconds = layer.in === undefined ? 0 : footageSeconds(layer.in, layer.source, ctx);
  const outSeconds = layer.out === undefined ? undefined : footageSeconds(layer.out, layer.source, ctx);
  const inFrame = Math.round(inSeconds * ctx.fps.num / ctx.fps.den);
  const outFrame = outSeconds === undefined ? undefined : Math.round(outSeconds * ctx.fps.num / ctx.fps.den);
  return { ...layer, ...timing, inFrame, inSeconds, ...(outFrame === undefined ? {} : { outFrame, outSeconds: outSeconds! }) };
}

function resolvedLayer(layer: Layer, frames: number, sceneStart: number, ctx: Context, sources?: Timeline["sources"]): ResolvedLayer {
  const timing = span(layer.start, layer.end, frames, sceneStart, ctx);
  if (layer.type !== "media") return { ...layer, ...timing };
  if (sources?.[layer.source]?.type === "capture") return captureLayer(layer, timing, ctx);
  const isEvent = (v: Time | undefined) => typeof v === "object" && "event" in v;
  if (isEvent(layer.in) || isEvent(layer.out)) {
    throw new Vid2Error("E_INPUT", `event references in in/out need a capture source; ${layer.source} is not one`);
  }
  const inFrame = layer.in === undefined ? 0 : timeFrame(layer.in, ctx);
  const outFrame = layer.out === undefined ? undefined : timeFrame(layer.out, ctx);
  return { ...layer, ...timing, inFrame, ...(outFrame === undefined ? {} : { outFrame }),
    inSeconds: framesToSeconds(inFrame, ctx.fps), ...(outFrame === undefined ? {} : { outSeconds: framesToSeconds(outFrame, ctx.fps) }) };
}

function resolvedEffect(effect: Effect, sceneStart: number, ctx: Context, baseDir: string): ResolvedEffect {
  if (effect.type === "grade" && effect.lut) return { ...effect, lut: pathFrom(baseDir, effect.lut) };
  if (effect.type !== "flash" && effect.type !== "rgbsplit") return effect;
  const atFrame = frame(effect.at, ctx, "duration");
  const absoluteAtFrame = sceneStart + atFrame;
  return { ...effect, atFrame, atSeconds: framesToSeconds(atFrame, ctx.fps), absoluteAtFrame,
    absoluteAtSeconds: framesToSeconds(absoluteAtFrame, ctx.fps) };
}

function transition(scene: Timeline["scenes"][number], ctx: Context): ResolvedTransition | null {
  if (!scene.transition) return null;
  return { type: scene.transition.type, frames: scene.transition.type === "cut" ? 0 : frame(scene.transition.duration, ctx, "duration") };
}

function resolvedAudio(audio: NonNullable<Timeline["audio"]>, ctx: Context): ResolvedAudio {
  const music = audio.music && "source" in audio.music
    ? { ...audio.music, source: audio.music.source }
    : audio.music;
  return { ...audio, ...(music === undefined ? {} : { music }),
    cues: audio.cues.map(cue => ({ ...cue, ...atTime(cue.at, ctx) })),
    voice: audio.voice.map(voice => "tts" in voice
      ? { kind: "tts" as const, tts: voice.tts, volume: voice.volume, ...atTime(voice.at, ctx) }
      : { kind: "file" as const, source: voice.source, volume: voice.volume, ...atTime(voice.at, ctx) }) };
}

/** Pass 2 of the clock rule: the first media layer per capture source fixes that source's timeline placement. */
function placeCaptures(scenes: ResolvedScene[], sources: Timeline["sources"], ctx: Context): void {
  if (!ctx.events) return;
  for (const scene of scenes) for (const layer of scene.layers) {
    if (layer.type !== "media" || sources[layer.source]?.type !== "capture") continue;
    ctx.events.place(layer.source, { startFrame: layer.absoluteStartFrame, inSeconds: layer.inSeconds ?? 0, speed: layer.speed, fps: ctx.fps });
  }
}

export function resolveTimeline(t: Timeline, opts: ResolveOptions): ResolvedTimeline {
  const fps = parseFps(t.output.fps);
  const beat = beatGrid(t.beat, opts.baseDir, fps);
  const ctx: Context = { fps, markers: t.markers, ...(beat === undefined ? {} : { beat }), ...(opts.events === undefined ? {} : { events: opts.events }) };
  const sources = Object.fromEntries(Object.entries(t.sources).map(([id, source]) => [id, "path" in source
    ? { ...source, path: pathFrom(opts.baseDir, source.path) }
    : "session" in source ? { ...source, session: pathFrom(opts.baseDir, source.session) } : source])) as Timeline["sources"];
  const fonts = Object.fromEntries(Object.entries(t.fonts).map(([id, font]) => [id, font.path
    ? { ...font, path: pathFrom(opts.baseDir, font.path) } : font])) as Timeline["fonts"];
  const markers = Object.fromEntries(Object.entries(t.markers).map(([id, value]) => {
    const n = typeof value === "object" ? barFrame(value.bar, value.beat, ctx) : frame(value, ctx, "position");
    return [id, { frame: n, seconds: framesToSeconds(n, fps) }];
  }));
  const scenes: ResolvedScene[] = [];
  for (const [index, scene] of t.scenes.entries()) {
    const frames = frame(scene.duration, ctx, "duration");
    const prior = scenes.at(-1);
    const transitionIn = prior?.transitionOut ?? null;
    const startFrame = prior ? prior.startFrame + prior.frames - (transitionIn?.frames ?? 0) : 0;
    const transitionOut = transition(scene, ctx);
    scenes.push({ id: scene.id, index, startFrame, startSeconds: framesToSeconds(startFrame, fps), frames,
      seconds: framesToSeconds(frames, fps), transitionIn, transitionOut,
      ...(scene.background === undefined ? {} : { background: scene.background }),
      layers: scene.layers.map(layer => resolvedLayer(layer, frames, startFrame, ctx, t.sources)),
      effects: scene.effects.map(effect => resolvedEffect(effect, startFrame, ctx, opts.baseDir)),
      ...(scene.notes === undefined ? {} : { notes: scene.notes }) });
  }
  placeCaptures(scenes, t.sources, ctx);
  const last = scenes.at(-1);
  const totalFrames = last ? last.startFrame + last.frames : 0;
  return { version: 1, fps, width: t.output.width, height: t.output.height, output: t.output,
    ...(beat === undefined ? {} : { beat }), sources, fonts, markers, scenes,
    overlays: t.overlays.map(layer => resolvedLayer(layer, totalFrames, 0, ctx)),
    effects: t.effects.map(effect => resolvedEffect(effect, 0, ctx, opts.baseDir)),
    ...(t.audio === undefined ? {} : { audio: resolvedAudio(t.audio, ctx) }),
    qa: { waivers: t.qa.waive.map((w) => { const a = frame(w.from, ctx, "position"), b = frame(w.to, ctx, "position");
      return { check: w.check, fromFrame: a, toFrame: b, fromS: framesToSeconds(a, fps), toS: framesToSeconds(b, fps), reason: w.reason }; }) },
    totalFrames, totalSeconds: framesToSeconds(totalFrames, fps) };
}
