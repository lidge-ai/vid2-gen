import { Vid2Error } from "../../shared/index.ts";
import { num } from "../../compile/escape.ts";

export const SYNTH_PRESETS = ["launch", "minimal", "tech", "none"] as const;
export type SynthPreset = (typeof SYNTH_PRESETS)[number];
export type Energy = "intro" | "build" | "drop" | "break" | "outro";
export interface SynthSection { at: number; energy: Energy }
export interface SynthSpec {
  preset: SynthPreset; key: string; progression?: string[]; sections?: SynthSection[];
  bpm: number; durationS: number; seed?: number;
}

export function resolveSections(spec: SynthSpec): SynthSection[] {
  const defaults: SynthSection[] = [
    { at: 0, energy: "intro" }, { at: spec.durationS * 0.12, energy: "build" },
    { at: spec.durationS * 0.3, energy: "drop" }, { at: spec.durationS * 0.85, energy: "outro" },
  ];
  const sections = [...(spec.sections?.length ? spec.sections : defaults)].sort((a, b) => a.at - b.at);
  if (sections[0]?.at !== 0 || sections.some((section) => !Number.isFinite(section.at) || section.at < 0 || section.at >= spec.durationS)) {
    throw new Vid2Error("E_INPUT", "synth sections must start at 0 and remain inside duration");
  }
  return sections;
}

export function energyGate(sections: SynthSection[], durationS: number, weights: Partial<Record<Energy, number>>): string {
  return sections.map((section, index) => {
    const weight = weights[section.energy] ?? 0;
    if (weight === 0) return "0";
    const end = sections[index + 1]?.at ?? durationS;
    return `${num(weight)}*between(t,${num(section.at)},${num(end)})`;
  }).join("+");
}
