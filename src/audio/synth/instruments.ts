import { num } from "../../compile/escape.ts";
import type { Chord } from "../chords.ts";
import { energyGate } from "./presets.ts";
import type { SynthPreset, SynthSection } from "./presets.ts";

export interface InstrumentContext { bpm: number; progression: Chord[]; sections: SynthSection[]; duration: number; seed: number; preset: SynthPreset }
export interface Instrument { id: string; expr: string; filters: string[]; weight: number }

function chordFrequency(ctx: InstrumentContext, tone: 0 | 1 | 2, octave: number): string {
  const bar = 240 / ctx.bpm; const cycle = bar * ctx.progression.length;
  const slot = `floor(mod(t,${num(cycle)})/${num(bar)})`;
  return `(${ctx.progression.map((chord, index) =>
    `${num(chord.frequencies[tone] * octave)}*eq(${slot},${num(index)})`).join("+")})`;
}

function gates(ctx: InstrumentContext): Record<string, string> {
  const section = ctx.sections; const duration = ctx.duration;
  return {
    drums: `(${energyGate(section, duration, { intro: 0.35, build: 0.7, drop: 1, break: 0.25, outro: 0.45 })})`,
    bass: `(${energyGate(section, duration, { intro: 0, build: 0.55, drop: 1, break: 0.2, outro: 0.4 })})`,
    pad: `(${energyGate(section, duration, { intro: 1, build: 0.9, drop: 0.65, break: 0.9, outro: 0.8 })})`,
    arp: `(${energyGate(section, duration, { intro: 0, build: 0.55, drop: 1, break: 0.1, outro: 0.3 })})`,
  };
}

function rhythm(ctx: InstrumentContext): Instrument[] {
  const beat = num(60 / ctx.bpm); const eighth = num(30 / ctx.bpm);
  const phase = `mod(t,${beat})`; const hatPhase = `mod(t,${eighth})`;
  const g = gates(ctx);
  const roll = `(${energyGate(ctx.sections, ctx.duration, { build: 1 })})`;
  const rollPhase = `mod(t,${num(15 / ctx.bpm)})`;
  return [
    { id: "kick", expr: `sin(2*PI*(48*${phase}+102*(1-exp(-35*${phase}))/35))*exp(-17*${phase})*${g.drums}`,
      filters: ["lowpass=f=220"], weight: 0.4 },
    { id: "snare", expr: `((0.35*(2*random(0)-1)+0.65*sin(2*PI*190*t))*exp(-30*mod(t-${beat},${num(2 * 60 / ctx.bpm)}))*gte(t,${beat})+0.15*(2*random(0)-1)*exp(-75*${rollPhase})*${roll})*${g.drums}`,
      filters: ["highpass=f=140", "lowpass=f=8500"], weight: 0.13 },
    { id: "hat", expr: `(2*random(0)-1)*exp(-95*${hatPhase})*${g.drums}`,
      filters: ["highpass=f=5000"], weight: 0.035 },
  ];
}

function melody(ctx: InstrumentContext): Instrument[] {
  const beat = num(60 / ctx.bpm); const eighth = num(30 / ctx.bpm); const sixteenth = num(15 / ctx.bpm);
  const g = gates(ctx);
  const root = chordFrequency(ctx, 0, 0.5);
  const tones = [0, 1, 2, 1].map((tone) => chordFrequency(ctx, tone as 0 | 1 | 2, 2));
  const arpFreq = `(${tones.map((tone, i) => `${tone}*eq(floor(mod(t,${beat})/${sixteenth}),${num(i)})`).join("+")})`;
  const pad = [0, 1, 2].map((tone) => `sin(2*PI*${chordFrequency(ctx, tone as 0 | 1 | 2, 2)}*t)`).join("+");
  return [
    { id: "bass", expr: `(0.55*(2*mod(${root}*t,1)-1)+0.45*sin(2*PI*${root}*t))*exp(-7*mod(t,${eighth}))*${g.bass}`,
      filters: ["lowpass=f=420"], weight: 0.16 },
    { id: "pad", expr: `(${pad})/3*min(1,t/0.8)*${g.pad}`,
      filters: ["highpass=f=120", "lowpass=f=1500"], weight: 0.13 },
    { id: "arp", expr: `sin(2*PI*${arpFreq}*t)*exp(-28*mod(t,${sixteenth}))*${g.arp}`,
      filters: ["highpass=f=500", `aecho=0.8:0.3:${num(45000 / ctx.bpm)}:0.2`], weight: 0.10 },
  ];
}

function transitions(ctx: InstrumentContext): Instrument[] {
  const drop = ctx.sections.find((section) => section.energy === "drop")?.at ?? ctx.duration * 0.3;
  const lead = Math.max(0, drop - Math.min(2, drop));
  const rise = `max(0,min(1,(t-${num(lead)})/${num(Math.max(0.1, drop - lead))}))`;
  return [
    { id: "riser", expr: `(0.5*(2*random(0)-1)+0.5*sin(2*PI*(300*t+100*t*t)))*${rise}*${rise}*between(t,${num(lead)},${num(drop)})`,
      filters: ["highpass=f=1500", "lowpass=f=10000"], weight: 0.055 },
    { id: "impact", expr: `(sin(2*PI*55*(t-${num(drop)}))+0.2*(2*random(0)-1))*exp(-10*(t-${num(drop)}))*gte(t,${num(drop)})`,
      filters: ["lowpass=f=300"], weight: 0.14 },
    { id: "crash", expr: `(2*random(0)-1)*exp(-3*(t-${num(drop)}))*gte(t,${num(drop)})`,
      filters: ["highpass=f=4500"], weight: 0.035 },
  ];
}

export function synthInstruments(ctx: InstrumentContext): Instrument[] {
  if (ctx.preset === "none") return [];
  const all = [...rhythm(ctx), ...melody(ctx), ...transitions(ctx)];
  if (ctx.preset === "minimal") return all.filter((instrument) => ["kick", "hat", "pad", "bass"].includes(instrument.id))
    .map((instrument) => ({ ...instrument, weight: instrument.weight * 0.6 }));
  if (ctx.preset === "tech") return all.map((instrument) => ({ ...instrument, weight: instrument.weight * (instrument.id === "arp" ? 1.7 : 0.8) }));
  return all;
}
