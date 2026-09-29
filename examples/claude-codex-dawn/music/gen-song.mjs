// Generates the 100 BPM cue for "Claude & Codex, at dawn": night → rivalry → work → threshold → sunrise. 1 bar = 2.4 s. Usage: node gen-song.mjs out.song.json
import { writeFileSync } from "node:fs";
const PAD = { C: "c4,e4,g4,b4", F: "f3,a3,c4,e4", Am: "a3,c4,e4,g4", G: "g3,b3,d4,a4", Dm: "d4,f4,a4,c5", Em: "e3,g3,b3,d4", E: "e3,g#3,b3,d4" };
const KEYS = { C: "c4,e4,g4", F: "f3,a3,c4", Am: "a3,c4,e4", G: "g3,b3,d4", Dm: "d3,f3,a3", Em: "e3,g3,b3" };
const ROOT = { C: "c2", F: "f2", Am: "a1", G: "g1", Dm: "d2", Em: "e2", E: "e2" };
const alt = (xs) => xs.length === 1 ? "[" + xs[0] + "]" : "<" + xs.map((x) => "[" + x + "]").join(" ") + ">";
const pad = (cs) => alt(cs.map((c) => PAD[c]));
const bass = (cs) => alt(cs.map((c) => ROOT[c] + " ~ ~ ~ ~ ~ " + ROOT[c] + " ~ ~ ~ " + ROOT[c] + " ~ ~ ~ ~ ~"));
const pulse = (cs) => alt(cs.map((c) => Array(8).fill(ROOT[c].replace(/\d/, (d) => String(+d + 1)) + " ~").join(" ")));
const arp = (cs, up = 1) => alt(cs.map((c) => { const n = PAD[c].split(",").map((x) => x.replace(/\d/, (d) => String(+d + up))); return [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 3].map((i) => n[i]).join(" "); }));
const stabs = (cs) => alt(cs.map((c) => "[" + KEYS[c] + "] ~ ~ ~ ~ ~ [" + KEYS[c] + "] ~ ~ ~ ~ ~ ~ ~ ~ ~"));
const NIGHT = "<[e6 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~] [~ ~ ~ ~ g5 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~]>";
const LIGHTS = "<[e6 ~ ~ ~ g6 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~] [~ ~ ~ ~ ~ ~ ~ ~ c7 ~ ~ ~ ~ ~ ~ ~] [a6 ~ ~ ~ g6 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~]>";
const HUMAN = "<[e5 ~ g5 ~ c6 ~ ~ ~ b5 ~ ~ ~ g5 ~ ~ ~] [a5 ~ c6 ~ e6 ~ ~ ~ d6 ~ ~ ~ c6 ~ ~ ~] [f5 ~ a5 ~ c6 ~ ~ ~ a5 ~ g5 ~ ~ ~ ~ ~] [g5 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~]>";
const SUN = "<[e6 ~ g6 ~ c7 ~ ~ ~ b6 ~ g6 ~ ~ ~ e6 ~] [f6 ~ a6 ~ c7 ~ ~ ~ a6 ~ g6 ~ f6 ~ e6 ~] [d6 ~ f6 ~ a6 ~ ~ ~ g6 ~ f6 ~ e6 ~ d6 ~] [e6 ~ ~ ~ g6 ~ ~ ~ c7 ~ ~ ~ ~ ~ ~ ~]>";
const K2 = "bd ~ ~ ~ ~ ~ ~ ~ bd ~ bd ~ ~ ~ ~ ~", K4 = "bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~", SNAP = "~ ~ ~ ~ cp ~ ~ ~ ~ ~ ~ ~ cp ~ ~ ~";
const T = (id, instrument, extra) => ({ id, kind: instrument === "drums" ? "drums" : "notes", instrument, pattern: "~", ...extra });
const tracks = [
  T("kick", "drums", { gain: -12, params: { tone: 0.3, decayMs: 260, noise: 0.04 }, fx: [{ type: "filter", mode: "lowpass", cutoffHz: 900 }] }),
  T("snap", "drums", { gain: -13, params: { noise: 0.8, decayMs: 120 }, sends: { reverb: 0.35, delay: 0 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 900 }] }),
  T("shaker", "drums", { gain: -14, pan: 0.2, swing: true, velocity: "0.3 0.15 0.5 0.15 0.3 0.15 0.6 0.2 0.3 0.15 0.5 0.15 0.3 0.15 0.6 0.25", params: { noise: 0.9, decayMs: 35 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 7000 }] }),
  T("bass", "808", { gain: -12, gate: 0.7, duck: { by: "kick", amount: 0.3, releaseMs: 120 } }),
  T("pulse", "pluck", { gain: -15, gate: 0.4, sends: { reverb: 0.2, delay: 0.3 } }),
  T("pad", "pad", { gain: -15, params: { detuneCents: 10, cutoffHz: 2400, attackMs: 800, releaseMs: 1800, unison: 5 }, sends: { reverb: 0.5, delay: 0 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 200 }, { type: "width", amount: 1.4, monoBelowHz: 150 }] }),
  T("keys", "epiano", { gain: -13, gate: 0.9, sends: { reverb: 0.3, delay: 0.1 } }),
  T("kalimba", "kalimba", { gain: -13, pan: -0.15, sends: { reverb: 0.3, delay: 0.25 } }),
  T("box", "glockenspiel", { gain: -11, pan: 0.1, sends: { reverb: 0.45, delay: 0.3 } }),
  T("marimba", "marimba", { gain: -12, pan: -0.1, sends: { reverb: 0.25, delay: 0.1 } }),
  T("strings", "lib:strings", { gain: -17, sends: { reverb: 0.5, delay: 0 } }),
];
const s = (id, bars, role, p) => ({ id, bars, role, patterns: Object.fromEntries(tracks.map((t) => [t.id, p[t.id] ?? null])) });
const sections = [
  s("night", 2, "intro", { pad: pad(["Am", "F"]), box: NIGHT }),
  s("lights", 3, "intro", { pad: pad(["C", "Am", "F"]), box: LIGHTS, kalimba: arp(["C", "Am", "F"]) }),
  s("rivals", 3, "build", { pad: pad(["Am", "Em", "E"]), pulse: pulse(["Am", "Em", "E"]), kick: "bd ~ ~ ~ ~ ~ ~ ~ bd ~ ~ ~ ~ ~ ~ ~", shaker: "hh*16", bass: bass(["Am", "Em", "E"]) }),
  s("workbench", 4, "verse", { pad: pad(["C", "Am", "F", "G"]), kalimba: arp(["C", "Am", "F", "G"]), keys: stabs(["C", "Am", "F", "G"]), kick: K2, snap: SNAP, shaker: "hh*16", bass: bass(["C", "Am", "F", "G"]) }),
  s("threshold", 4, "breakdown", { pad: pad(["F", "G", "Am", "G"]), strings: pad(["F", "G", "Am", "G"]), box: NIGHT, pulse: "<~ ~ [" + Array(8).fill("a2 ~").join(" ") + "] [" + Array(8).fill("g2 ~").join(" ") + "]>" }),
  s("checks", 4, "groove", { pad: pad(["Dm", "G", "C", "Am"]), marimba: arp(["Dm", "G", "C", "Am"], 1), keys: stabs(["Dm", "G", "C", "Am"]), kick: K4, snap: SNAP, shaker: "hh*16", bass: bass(["Dm", "G", "C", "Am"]) }),
  s("person", 4, "verse", { pad: pad(["F", "C", "F", "G"]), keys: stabs(["F", "C", "F", "G"]), box: HUMAN, kick: K2, shaker: "hh*16", bass: bass(["F", "C", "F", "G"]), strings: pad(["F", "C", "F", "G"]) }),
  s("sunrise", 4, "hook", { pad: pad(["C", "F", "Dm", "C"]), strings: pad(["C", "F", "Dm", "C"]), box: SUN, kalimba: arp(["C", "F", "Dm", "C"]), marimba: "<[c3 ~ ~ e3 ~ ~ g3 ~ c3 ~ ~ e3 ~ ~ g3 ~] [f3 ~ ~ a3 ~ ~ c4 ~ f3 ~ ~ a3 ~ ~ c4 ~] [d3 ~ ~ f3 ~ ~ a3 ~ d3 ~ ~ f3 ~ ~ a3 ~] [c3 ~ ~ e3 ~ ~ g3 ~ c3 ~ ~ e3 ~ ~ g3 ~]>", kick: K4, snap: SNAP, shaker: "hh*16", bass: bass(["C", "F", "Dm", "C"]) }),
  s("ending", 3, "outro", { pad: pad(["F", "G", "C"]), strings: pad(["F", "G", "C"]), box: "<[e6 ~ ~ ~ g6 ~ ~ ~ c7 ~ ~ ~ ~ ~ ~ ~] [d6 ~ ~ ~ ~ ~ ~ ~ b5 ~ ~ ~ ~ ~ ~ ~] [c6 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~]>", kalimba: "<[" + "f4 a4 c5 e5 c5 a4 f4 a4 f4 a4 c5 e5 c5 a4 c5 e5" + "] ~ ~>", kick: "<[" + K2 + "] ~ ~>" }),
];
const song = {
  version: 1, title: "Claude & Codex, at dawn", genre: "lofi_hiphop", bpm: 100, meter: { numerator: 4, denominator: 4 }, key: "C major", seed: 2926,
  swing: 0.56, sampleRate: 44100, tailSeconds: 3,
  fx: { reverb: { type: "plate", decaySeconds: 2.4, preDelayMs: 25, lowCutHz: 200, highCutHz: 9000, width: 1.3 }, delay: { time: "1/8d", feedback: 0.35, pingPong: true, lowCutHz: 300, highCutHz: 6500 } },
  master: { targetLufs: -14, ceilingDb: -2, fx: [{ type: "eq", lowGainDb: 0.5, midGainDb: -1, midHz: 400, highGainDb: -0.5, highHz: 9000 }, { type: "compressor", ratio: 2, thresholdDb: -16, attackMs: 25, releaseMs: 180 }] },
  tracks, sections, arrangement: sections.map((x) => ({ section: x.id })),
};
writeFileSync(process.argv[2], JSON.stringify(song, null, 2) + "\n");
