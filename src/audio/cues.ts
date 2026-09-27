import { SFX_PRESETS } from "./sfx/presets.ts";
import type { SfxAnchor, SfxName } from "./sfx/presets.ts";

export const AUDIO_RATE = 48000;
export interface CueAnchor { durationS: number; peakS: number; anchor: SfxAnchor }
export interface AutoCueInput {
  transitions: { atSample: number; type: string }[];
  drops: number[];
  captureEvents: { atSample: number; kind: "click" | "type"; chars?: number; durationSamples?: number }[];
  synthMusic: boolean;
}
export interface PlannedCue { sfx: SfxName; atSample: number; gain: number; anchorSample: number }

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
  for (const cue of cues) unique.set(`${cue.sfx}:${cue.anchorSample}`, cue);
  return [...unique.values()].sort((a, b) => a.anchorSample - b.anchorSample || a.sfx.localeCompare(b.sfx));
}
