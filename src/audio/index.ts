/** Audio public API (040). */
export type * from "./providers/port.ts";
export { detectBeats } from "./beats.ts";
export type { BeatsFile } from "./beats.ts";
export { beatTime, snapToBeat } from "./grid.ts";
export { synthArgs, SYNTH_PRESETS } from "./synth/engine.ts";
export { SFX_PRESETS } from "./sfx/presets.ts";
export type { SfxName } from "./sfx/presets.ts";
export { sfxArgs } from "./sfx/render.ts";
export { anchorStart, autoCues } from "./cues.ts";
export { mixGraph, premaster, materializeRenders } from "./mix.ts";
export { measureLoudness, twoPassLoudnorm, parseLoudnormJson } from "./loudness.ts";
export { muxAudio } from "./mux.ts";
export { createElevenLabs } from "./providers/elevenlabs.ts";
export { createAceStep } from "./providers/acestep.ts";
export { importAudioFile } from "./providers/file.ts";
export { generateAsset, lookupAsset, requestHash } from "./providers/manifest.ts";
import type { AudioProvider } from "./providers/port.ts";
import { createAceStep } from "./providers/acestep.ts";
import { createElevenLabs } from "./providers/elevenlabs.ts";

/** Provider registry: ids used in timelines ("elevenlabs", "acestep"). */
export function providerById(id: string): AudioProvider | undefined {
  if (id === "elevenlabs") return createElevenLabs();
  if (id === "acestep") return createAceStep();
  return undefined;
}
