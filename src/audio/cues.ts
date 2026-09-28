import { SFX_PRESETS } from "./sfx/presets.ts";
import type { SfxAnchor, SfxName } from "./sfx/presets.ts";

export const AUDIO_RATE = 48000;
export interface CueAnchor { durationS: number; peakS: number; anchor: SfxAnchor }
export interface AutoCueInput {
  transitions: { atSample: number; type: string }[];
  drops: number[];
  captureEvents: { atSample: number; kind: "click" | "type"; chars?: number; durationSamples?: number }[];
  synthMusic: boolean;
  /** Stage animation events (040) on the sample clock, with the stage render that produced them. */
  stageEvents?: { atSample: number; kind: string; source: string }[];
}
/** kind/source identify where an automatic cue came from (transition, drop, capture, or a stage event of one stage render). */
export interface PlannedCue { sfx: SfxName; atSample: number; gain: number; anchorSample: number; kind?: string; source?: string }

/** Returns the SFX start on the 48 kHz sample clock; negative starts are left for the mixer to trim. */
export function anchorStart(cutSample: number, preset: CueAnchor): number {
  if (!Number.isInteger(cutSample)) throw new RangeError("cue anchor needs an integer sample");
  if (preset.anchor === "start") return cutSample;
  const seconds = preset.anchor === "peak" ? preset.peakS : preset.durationS;
  return cutSample - Math.round(seconds * AUDIO_RATE);
}

function planned(sfx: SfxName, anchorSample: number): PlannedCue {
  const preset = SFX_PRESETS[sfx];
  return { sfx, atSample: anchorStart(anchorSample, preset), gain: 10 ** (preset.gainDb / 20), anchorSample };
}

/** Stage event → SFX preset and extra gain (040 mapping). Tokens stay silent: word builds are carried by the music. */
const STAGE_SFX: Record<string, { sfx: SfxName; gain: number } | undefined> = {
  glyph: { sfx: "type", gain: 1 }, icon: { sfx: "pop", gain: 1 }, click: { sfx: "click", gain: 1 }, grow: { sfx: "riser", gain: 1 },
  state: { sfx: "swoosh-up", gain: 0.8 }, tick: { sfx: "click", gain: 0.5 }, token: undefined,
};
const MIN_GAP = Math.round(0.055 * AUDIO_RATE);
const PER_SECOND = 10;

/** Stage cues with per-source limits: at least 55 ms between cues of one preset, at most 10 cues in any rolling second. */
export function stageCues(events: NonNullable<AutoCueInput["stageEvents"]>): PlannedCue[] {
  const out: PlannedCue[] = [];
  const bySource = new Map<string, typeof events>();
  for (const e of events) bySource.set(e.source, [...(bySource.get(e.source) ?? []), e]);
  for (const list of bySource.values()) {
    const kept: PlannedCue[] = [];
    for (const e of [...list].sort((a, b) => a.atSample - b.atSample)) {
      const map = STAGE_SFX[e.kind];
      if (!map) continue;
      const last = [...kept].reverse().find((c) => c.sfx === map.sfx);
      if (last && e.atSample - last.anchorSample < MIN_GAP) continue;
      if (kept.filter((c) => e.atSample - c.anchorSample < AUDIO_RATE).length >= PER_SECOND) continue;
      const cue = planned(map.sfx, e.atSample);
      kept.push({ ...cue, gain: cue.gain * map.gain, kind: e.kind, source: e.source });
    }
    out.push(...kept);
  }
  return out;
}

/** Suggested cues on the absolute timeline sample clock; the caller decides whether auto cues are enabled. */
export function autoCues(input: AutoCueInput): PlannedCue[] {
  const cues: PlannedCue[] = [];
  for (const transition of input.transitions) {
    if (transition.type === "cut") continue;
    cues.push(planned("whoosh", transition.atSample));
    if (transition.type === "fadewhite") cues.push(planned("impact", transition.atSample));
  }
  if (input.synthMusic) for (const drop of input.drops) cues.push(planned("impact", drop));
  for (const event of input.captureEvents) {
    if (event.kind === "click") { cues.push(planned("click", event.atSample)); continue; }
    const count = Math.min(64, Math.max(0, Math.floor(event.chars ?? 1)));
    const duration = event.durationSamples ?? Math.max(0, count - 1) * Math.round(0.06 * AUDIO_RATE);
    for (let i = 0; i < count; i++) cues.push(planned("type", event.atSample +
      (count <= 1 ? 0 : Math.round(i * duration / (count - 1)))));
  }
  const unique = new Map<string, PlannedCue>();
  for (const cue of [...cues, ...stageCues(input.stageEvents ?? [])]) unique.set(`${cue.sfx}:${cue.anchorSample}`, cue);
  return [...unique.values()].sort((a, b) => a.anchorSample - b.anchorSample || a.sfx.localeCompare(b.sfx));
}
