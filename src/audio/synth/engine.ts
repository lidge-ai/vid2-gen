import { Vid2Error } from "../../shared/index.ts";
import { num, quoteExpr } from "../../compile/escape.ts";
import { progressionFor } from "../chords.ts";
import { synthInstruments } from "./instruments.ts";
import type { Instrument } from "./instruments.ts";
import { resolveSections } from "./presets.ts";
import type { SynthSpec } from "./presets.ts";

export type { SynthSpec } from "./presets.ts";
export { SYNTH_PRESETS } from "./presets.ts";

const RATE = 48000;

function source(expr: string, duration: number): string {
  return `aevalsrc=exprs=${quoteExpr(expr)}:s=${num(RATE)}:d=${num(duration)}`;
}
function weightedMix(inputs: string[], weights: number[], output: string): string {
  const labels = inputs.map((id) => `[${id}]`).join("");
  return `${labels}amix=inputs=${num(inputs.length)}:normalize=0:duration=longest:weights=${quoteExpr(weights.map(num).join(" "))}[${output}]`;
}

function graph(instruments: Instrument[], samples: number, duration: number): string {
  const chains = instruments.map((instrument, index) =>
    `[${index}:a]${["aformat=sample_rates=48000:channel_layouts=mono", ...instrument.filters].join(",")}[${instrument.id}]`);
  const byId = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  const music = ["bass", "pad", "arp", "riser"].filter((id) => byId.has(id));
  const drums = ["kick", "snare", "hat", "impact", "crash"].filter((id) => byId.has(id));
  chains.push(weightedMix(music, music.map((id) => byId.get(id)!.weight), "music"));
  chains.push("[kick]asplit=2[kickKey][kickMix]");
  chains.push("[music][kickKey]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=120[pumped]");
  chains.push(weightedMix(["pumped", ...drums.map((id) => id === "kick" ? "kickMix" : id)],
    [1, ...drums.map((id) => byId.get(id)!.weight)], "bus"));
  const irIndex = instruments.length;
  chains.push(`[${irIndex}:a]lowpass=f=7000,aformat=sample_rates=48000:channel_layouts=stereo[ir]`);
  chains.push("[bus]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[dry][send]");
  chains.push("[send][ir]afir=gtype=peak[wet]");
  chains.push(`[dry][wet]amix=inputs=2:normalize=0:duration=longest:weights=${quoteExpr("1 0.27")},` +
    `acompressor=threshold=0.1:ratio=3:attack=10:release=150:makeup=1.2,` +
    `alimiter=limit=0.95:level=false,afade=t=out:st=${num(Math.max(0, duration - 0.8))}:d=${num(Math.min(0.8, duration))},` +
    `apad=whole_len=${num(samples)},atrim=end_sample=${num(samples)},` +
    "aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[out]");
  return chains.join(";");
}

/** Complete ffmpeg argv after the executable; outputs exact-length 48 kHz stereo WAV. */
export function synthArgs(spec: SynthSpec, out: string): string[] {
  if (!Number.isFinite(spec.bpm) || spec.bpm < 20 || spec.bpm > 300 ||
    !Number.isFinite(spec.durationS) || spec.durationS <= 0) {
    throw new Vid2Error("E_INPUT", "synth needs bpm 20–300 and a positive duration");
  }
  const samples = Math.round(spec.durationS * RATE);
  if (samples < 1) throw new Vid2Error("E_INPUT", "synth duration is shorter than one sample");
  if (spec.preset === "none") return ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-af", `atrim=end_sample=${num(samples)},asetpts=PTS-STARTPTS`, "-c:a", "pcm_s24le", "-ar", "48000", "-y", out];
  const sections = resolveSections(spec);
  const progression = progressionFor(spec.key, spec.progression);
  const instruments = synthInstruments({ bpm: spec.bpm, progression, sections, duration: spec.durationS, seed: spec.seed ?? 0, preset: spec.preset });
  const inputs = instruments.flatMap((instrument) => ["-f", "lavfi", "-i", source(instrument.expr, spec.durationS)]);
  const irGain = num(0.015 + ((spec.seed ?? 0) % 7) * 0.001);
  const ir = `(2*random(0)-1)*exp(-3.2*t)*${irGain}|(2*random(1)-1)*exp(-3.1*t)*${irGain}`;
  inputs.push("-f", "lavfi", "-i", `${source(ir, 2.2)}:c=stereo`);
  return ["-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", graph(instruments, samples, spec.durationS),
    "-map", "[out]", "-c:a", "pcm_s24le", "-ar", "48000", "-y", out];
}
