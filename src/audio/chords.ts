import { Vid2Error } from "../shared/index.ts";

export interface Chord { name: string; root: string; quality: "maj" | "min" | "7" | "sus2" | "sus4"; frequencies: [number, number, number] }
const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PROGRESSIONS: Record<string, string[]> = {
  Am: ["Am", "F", "C", "G"], C: ["C", "G", "Am", "F"],
  Dm: ["Dm", "Bb", "F", "C"], Em: ["Em", "C", "G", "D"],
};

export function parseChord(name: string): Chord {
  const match = /^([A-G])([#b]?)(maj|min|m|7|sus2|sus4)?$/.exec(name);
  if (!match) throw new Vid2Error("E_INPUT", `invalid chord: ${name}`);
  const root = `${match[1]}${match[2]}`;
  const base = (SEMITONES[match[1]!]! + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0) + 12) % 12;
  const suffix = match[3];
  const quality: Chord["quality"] = suffix === "m" || suffix === "min" ? "min" : suffix === "7" ? "7" :
    suffix === "sus2" ? "sus2" : suffix === "sus4" ? "sus4" : "maj";
  const offsets = quality === "min" ? [0, 3, 7] : quality === "sus2" ? [0, 2, 7] : quality === "sus4" ? [0, 5, 7] : quality === "7" ? [0, 4, 10] : [0, 4, 7];
  const hz = (semitones: number) => 440 * 2 ** ((48 + base + semitones - 69) / 12);
  return { name, root, quality, frequencies: offsets.map(hz) as [number, number, number] };
}

export function progressionFor(key: string, custom?: string[]): Chord[] {
  const names = custom?.length ? custom : PROGRESSIONS[key];
  if (!names) throw new Vid2Error("E_INPUT", `unsupported key: ${key}`, { fix: "Use Am, C, Dm, Em or supply a chord progression." });
  return names.map(parseChord);
}
