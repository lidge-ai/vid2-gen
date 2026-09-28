/** Resolved timeline → AudioPlan (040). Pure: every stem is a local file or an ffmpeg render; provider audio comes from the cache. */
import { join } from "node:path";
import { anchorStart, autoCues } from "../audio/cues.ts";
import type { AutoCueInput } from "../audio/cues.ts";
import { lookupAsset, requestHash } from "../audio/providers/manifest.ts";
import type { ProviderKind } from "../audio/providers/port.ts";
import { SFX_PRESETS } from "../audio/sfx/presets.ts";
import type { SfxName } from "../audio/sfx/presets.ts";
import { sfxArgs } from "../audio/sfx/render.ts";
import { synthArgs } from "../audio/synth/engine.ts";
import { hashJson, parseTimeLiteral, toFrames, Vid2Error } from "../shared/index.ts";
import type { ResolvedTimeline } from "../timeline/index.ts";
import type { AbsoluteStageEvent, AudioPlan, AudioRender, AudioStem, ProvenanceEntry } from "./ir.ts";

const RATE = 48000;
type Audio = NonNullable<ResolvedTimeline["audio"]>;
export interface ProviderRequest { key: string; provider: string; kind: ProviderKind; params: Record<string, unknown> }

/** Every provider request a timeline makes; 'vid2 audio generate' and the compiler use the same list and hashes. */
export function providerRequests(t: ResolvedTimeline): ProviderRequest[] {
  const a = t.audio;
  if (!a) return [];
  const out: ProviderRequest[] = [];
  const music = a.music;
  if (music && "provider" in music) out.push({ key: "music", provider: music.provider, kind: "music",
    params: { prompt: music.prompt ?? null, plan: music.plan ?? null, durationMs: Math.round(t.totalSeconds * 1000) } });
  a.voice.forEach((v, i) => { if (v.kind === "tts") out.push({ key: `voice-${i}`, provider: v.tts.provider, kind: "tts",
    params: { text: v.tts.text, voiceId: v.tts.voice ?? null, language: v.tts.language ?? null } }); });
  a.cues.forEach((c, i) => {
    const m = /^([a-z0-9-]+):(.+)$/.exec(c.sfx);
    if (m && m[1] !== "preset") out.push({ key: `cue-${i}`, provider: m[1]!, kind: "sfx", params: { text: m[2]!, durationS: 2 } });
  });
  return out;
}

class Builder {
  renders = new Map<string, AudioRender>();
  stems: AudioStem[] = [];
  provenance: ProvenanceEntry[] = [];
  readonly t: ResolvedTimeline;
  readonly dir: string;
  readonly timelinePath: string;
  constructor(t: ResolvedTimeline, dir: string, timelinePath: string) { this.t = t; this.dir = dir; this.timelinePath = timelinePath; }
  sample = (frame: number) => Math.round((frame * this.t.fps.den / this.t.fps.num) * RATE);
  cached(req: ProviderRequest): string {
    const hash = requestHash({ provider: req.provider, kind: req.kind, params: req.params });
    const hit = lookupAsset(hash);
    if (!hit) throw new Vid2Error("E_INPUT", `${req.kind} audio from ${req.provider} is not generated yet`,
      { fix: `vid2 audio generate ${this.timelinePath}`, details: { request: req } });
    this.provenance.push({ stemId: req.key, provider: req.provider, kind: req.kind, requestHash: hash, createdAt: hit.provenance.createdAt,
      path: hit.path, ...(hit.provenance.requestId ? { requestId: hit.provenance.requestId } : {}), ...(hit.provenance.model ? { model: hit.provenance.model } : {}) });
    return hit.path;
  }
  sfx(name: SfxName): string {
    const out = join(this.dir, `sfx-${name}.wav`);
    const args = sfxArgs(name, out).slice(0, -1);
    this.renders.set(out, { id: `sfx-${name}`, kind: "sfx", args, out, hash: hashJson({ args }) });
    return out;
  }
  place(stem: Omit<AudioStem, "atSample"> & { atSample: number }): void {
    const skip = stem.atSample < 0 ? -stem.atSample : 0;
    this.stems.push({ ...stem, atSample: Math.max(0, stem.atSample), ...(skip ? { skipSamples: (stem.skipSamples ?? 0) + skip } : {}) });
  }
}

function sourcePath(t: ResolvedTimeline, id: string): string {
  const s = t.sources[id];
  if (!s || !("path" in s)) throw new Vid2Error("E_INPUT", `audio source ${id} must be an audio or video file source`);
  return s.path;
}

function seconds(v: number | string, t: ResolvedTimeline): number {
  return toFrames(parseTimeLiteral(v), { fps: t.fps }, "duration") * t.fps.den / t.fps.num;
}

function music(b: Builder, a: Audio): boolean {
  const m = a.music;
  if (!m) return false;
  const fade = Math.round(seconds(m.fadeOut, b.t) * RATE);
  const base = { id: "music", role: "music" as const, atSample: 0, gain: m.volume, ...(fade ? { fadeOutSamples: fade } : {}) };
  if ("source" in m) { b.place({ ...base, path: sourcePath(b.t, m.source) }); return false; }
  if ("provider" in m) { b.place({ ...base, path: b.cached(providerRequests(b.t).find((r) => r.key === "music")!) }); return false; }
  const out = join(b.dir, "music-synth.wav");
  const sections = m.synth.sections?.map((s) => ({ at: seconds(s.at, b.t), energy: s.energy }));
  const args = synthArgs({ preset: m.synth.preset as "launch", key: m.synth.key, bpm: b.t.beat?.bpm ?? 120, durationS: b.t.totalSeconds,
    ...(m.synth.progression ? { progression: m.synth.progression } : {}), ...(sections ? { sections } : {}) }, out).slice(0, -1);
  b.renders.set(out, { id: "music-synth", kind: "synth", args, out, hash: hashJson({ args }) });
  b.place({ ...base, path: out });
  return true;
}

function cues(b: Builder, a: Audio): void {
  const requests = providerRequests(b.t);
  a.cues.forEach((c, i) => {
    const cut = b.sample(c.frame);
    const m = /^([a-z0-9-]+):(.+)$/.exec(c.sfx);
    if (m?.[1] === "preset") {
      const name = m[2] as SfxName;
      const preset = SFX_PRESETS[name];
      if (!preset) throw new Vid2Error("E_INPUT", `unknown SFX preset: ${m[2]}`, { details: { presets: Object.keys(SFX_PRESETS) } });
      const at = anchorStart(cut, { ...preset, ...(c.anchor ? { anchor: c.anchor } : {}) });
      b.place({ id: `cue-${i}`, role: "sfx", path: b.sfx(name), atSample: at, gain: c.volume * 10 ** (preset.gainDb / 20) });
      return;
    }
    const path = m ? b.cached(requests.find((r) => r.key === `cue-${i}`)!) : sourcePath(b.t, c.sfx);
    // File and provider SFX start at the cue ("start" anchor); presets carry peak/end anchors.
    b.place({ id: `cue-${i}`, role: "sfx", path, atSample: cut, gain: c.volume });
  });
}

function voices(b: Builder, a: Audio): void {
  const requests = providerRequests(b.t);
  a.voice.forEach((v, i) => {
    const path = v.kind === "file" ? sourcePath(b.t, v.source) : b.cached(requests.find((r) => r.key === `voice-${i}`)!);
    b.place({ id: `voice-${i}`, role: "voice", path, atSample: b.sample(v.frame), gain: v.volume });
  });
}

/** Authored cues win: an auto cue anchored within 80 ms of an authored cue is dropped (040). */
const AUTHORED_WINDOW = Math.round(0.08 * RATE);

function automatic(b: Builder, a: Audio, synth: boolean, stageEvents: AbsoluteStageEvent[]): NonNullable<AudioPlan["autoCues"]> {
  if (!(a.autoCues ?? synth)) return [];
  const t = b.t;
  const transitions = t.scenes.slice(0, -1).flatMap((s, i) => {
    const tr = s.transitionOut;
    const next = t.scenes[i + 1]!;
    return tr && tr.frames > 0 ? [{ atSample: b.sample(next.startFrame + tr.frames / 2), type: tr.type }] : [];
  });
  const m = a.music;
  const drops = m && "synth" in m ? (m.synth.sections ?? []).filter((s) => s.energy === "drop").map((s) => Math.round(seconds(s.at, t) * RATE)) : [];
  const captureEvents: AutoCueInput["captureEvents"] = (t.captureEvents ?? []).flatMap((e) => e.kind === "click" || e.kind === "type"
    ? [{ atSample: b.sample(e.frame), kind: e.kind === "click" ? "click" : "type", ...(e.chars === undefined ? {} : { chars: e.chars }),
      ...(e.endFrame === undefined ? {} : { durationSamples: b.sample(e.endFrame) - b.sample(e.frame) }) }] : []);
  const stage = stageEvents.map((e) => ({ atSample: b.sample(e.absoluteFrame), kind: e.kind, source: e.source }));
  const authored = a.cues.map((c) => b.sample(c.frame));
  const ledger: NonNullable<AudioPlan["autoCues"]> = [];
  autoCues({ transitions, drops, captureEvents, synthMusic: synth, stageEvents: stage })
    .filter((c) => !authored.some((s) => Math.abs(s - c.anchorSample) <= AUTHORED_WINDOW))
    .forEach((c, i) => {
      b.place({ id: `auto-${i}`, role: "sfx", path: b.sfx(c.sfx), atSample: c.atSample, gain: c.gain });
      ledger.push({ stem: `auto-${i}`, sfx: c.sfx, kind: c.kind ?? "timeline", source: c.source ?? "timeline", anchorSample: c.anchorSample });
    });
  return ledger;
}

function mediaAudio(b: Builder): void {
  for (const scene of b.t.scenes) for (const l of scene.layers) {
    if (l.type !== "media" || l.volume <= 0) continue;
    const s = b.t.sources[l.source];
    if (!s || s.type !== "video") continue;
    b.place({ id: `media-${scene.id}-${l.source}`, role: "media", path: s.path, atSample: b.sample(l.absoluteStartFrame), gain: l.volume,
      skipSamples: Math.round((l.inSeconds ?? 0) * RATE), trimSamples: b.sample(l.absoluteEndFrame) - b.sample(l.absoluteStartFrame) });
  }
}

/** null when the timeline has no audio section and no audible media layers (video-only render). */
export function buildAudioPlan(t: ResolvedTimeline, opts: { workDir: string; container: string; timelinePath: string;
  mix: (stems: AudioStem[], o: { durationSamples: number; duck: boolean }) => string; stageEvents?: AbsoluteStageEvent[] }): AudioPlan | null {
  const dir = join(opts.workDir, "audio");
  const b = new Builder(t, dir, opts.timelinePath);
  const a = t.audio;
  const synth = a ? music(b, a) : false;
  let ledger: NonNullable<AudioPlan["autoCues"]> = [];
  if (a) { voices(b, a); cues(b, a); ledger = automatic(b, a, synth, opts.stageEvents ?? []); }
  mediaAudio(b);
  if (!b.stems.length) return null;
  const durationSamples = b.sample(t.totalFrames);
  const duck = (a?.duckMusicUnderVoice ?? true) && b.stems.some((s) => s.role === "voice") && b.stems.some((s) => s.role === "music");
  return { version: 1, sampleRate: RATE, durationSamples, renders: [...b.renders.values()], stems: b.stems,
    graph: opts.mix(b.stems, { durationSamples, duck }), duck,
    target: { I: a?.loudness.target ?? -14, TP: a?.loudness.truePeak ?? -1, LRA: 11 }, codec: opts.container === "webm" ? "opus" : "aac",
    premaster: join(dir, "premaster.wav"), master: join(dir, "master.wav"), provenance: b.provenance, ...(ledger.length ? { autoCues: ledger } : {}) };
}
