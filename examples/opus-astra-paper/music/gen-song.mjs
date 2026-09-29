// Generates the 100 BPM C-major music-box cue for "Opus & Astra". 1 bar = 2.4 s; sections follow the four scenes. Usage: node gen-song.mjs out.song.json
import { writeFileSync } from "node:fs";
const CH = { C: "c4,e4,g4,b4", F: "f3,a3,c4,e4", Am: "a3,c4,e4,g4", G: "g3,b3,d4,f4", Dm: "d3,f3,a3,c4" };
const PAD = { C: "c4,e4,g4,b4", F: "f3,a3,c4,e4", Am: "a3,c4,e4,g4", G: "g3,b3,d4,a4", Dm: "d4,f4,a4,c5" };
const ROOT = { C: "c2", F: "f2", Am: "a1", G: "g1", Dm: "d2" };
const alt = (xs) => xs.length === 1 ? xs[0] : "<" + xs.map((x) => "[" + x + "]").join(" ") + ">";
const pad = (cs) => alt(cs.map((c) => PAD[c]));
const bass = (cs) => alt(cs.map((c) => ROOT[c] + " ~ ~ ~ ~ ~ " + ROOT[c] + " ~ ~ ~ " + ROOT[c] + " ~ ~ ~ ~ ~"));
const ARP = (cs) => alt(cs.map((c) => { const n = PAD[c].split(","); return [n[0], n[1], n[2], n[3], n[2], n[1], n[0], n[1], n[0], n[1], n[2], n[3], n[2], n[1], n[2], n[3]].map((x) => x.replace(/\d/, (d) => String(+d + 1))).join(" "); }));
const TUNE_A = "<[e6 ~ g6 ~ c7 ~ ~ ~ b6 ~ g6 ~ ~ ~ e6 ~] [f6 ~ a6 ~ c7 ~ ~ ~ a6 ~ g6 ~ f6 ~ e6 ~]>";
const TUNE_B = "<[g6 ~ e6 ~ c6 ~ e6 ~ g6 ~ a6 ~ g6 ~ ~ ~] [e6 ~ f6 ~ g6 ~ ~ ~ d6 ~ ~ ~ c6 ~ ~ ~]>";
const K = "bd ~ ~ ~ ~ ~ ~ ~ bd ~ bd ~ ~ ~ ~ ~", K4 = "bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~";
const SNAP = "~ ~ ~ ~ cp ~ ~ ~ ~ ~ ~ ~ cp ~ ~ ~", SHAKE = "hh*16";
const T = (id, instrument, extra) => ({ id, kind: instrument === "drums" ? "drums" : "notes", instrument, pattern: "~", ...extra });
const tracks = [
  T("kick", "drums", { gain: -10, params: { tone: 0.3, decayMs: 260, noise: 0.04 }, fx: [{ type: "filter", mode: "lowpass", cutoffHz: 900 }] }),
  T("snap", "drums", { gain: -12, params: { noise: 0.8, decayMs: 120 }, sends: { reverb: 0.35, delay: 0 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 900 }] }),
  T("shaker", "drums", { gain: -13, pan: 0.2, velocity: "0.3 0.15 0.5 0.15 0.3 0.15 0.6 0.2 0.3 0.15 0.5 0.15 0.3 0.15 0.6 0.25", params: { noise: 0.9, decayMs: 35 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 7000 }] }),
  T("bass", "808", { gain: -11, gate: 0.7, duck: { by: "kick", amount: 0.3, releaseMs: 120 } }),
  T("pad", "pad", { gain: -14, params: { detuneCents: 10, cutoffHz: 2400, attackMs: 700, releaseMs: 1600, unison: 5 }, sends: { reverb: 0.5, delay: 0 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 200 }, { type: "width", amount: 1.4, monoBelowHz: 150 }] }),
  T("keys", "epiano", { gain: -13, gate: 0.9, sends: { reverb: 0.3, delay: 0.1 } }),
  T("kalimba", "kalimba", { gain: -12, pan: -0.15, sends: { reverb: 0.3, delay: 0.25 } }),
  T("box", "glockenspiel", { gain: -10, pan: 0.1, sends: { reverb: 0.45, delay: 0.3 } }),
  T("marimba", "marimba", { gain: -12, pan: -0.1, sends: { reverb: 0.25, delay: 0.1 } }),
];
const s = (id, bars, role, p) => ({ id, bars, role, patterns: Object.fromEntries(tracks.map((t) => [t.id, p[t.id] ?? null])) });
const sections = [
  s("title", 2, "intro", { pad: pad(["C", "F"]), box: TUNE_A }),
  s("meet", 3, "verse", { pad: pad(["C", "Am", "F"]), kalimba: ARP(["C", "Am", "F"]), box: "<[e6 ~ ~ ~ ~ ~ ~ ~ c7 ~ ~ ~ ~ ~ ~ ~] ~ [a6 ~ ~ ~ ~ ~ ~ ~ g6 ~ ~ ~ ~ ~ ~ ~]>", kick: K, bass: bass(["C", "Am", "F"]), shaker: SHAKE }),
  s("build", 3, "build", { pad: pad(["Dm", "G", "C"]), marimba: ARP(["Dm", "G", "C"]), keys: alt(["[" + CH.Dm + "] ~ ~ ~ ~ ~ [" + CH.Dm + "] ~ ~ ~ ~ ~ ~ ~ ~ ~", "[" + CH.G + "] ~ ~ ~ ~ ~ [" + CH.G + "] ~ ~ ~ ~ ~ ~ ~ ~ ~", "[" + CH.C + "] ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~"]), kick: K4, snap: SNAP, shaker: SHAKE, bass: bass(["Dm", "G", "C"]) }),
  s("finale", 3, "hook", { pad: pad(["F", "G", "C"]), box: TUNE_B, kalimba: ARP(["F", "G", "C"]), marimba: "<[f3 ~ ~ a3 ~ ~ c4 ~ f3 ~ ~ a3 ~ ~ c4 ~] [g3 ~ ~ b3 ~ ~ d4 ~ g3 ~ ~ b3 ~ ~ d4 ~] [c4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~]>", kick: "<[" + K4 + "] [" + K4 + "] [bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~]>", snap: "<[" + SNAP + "] [" + SNAP + "] ~>", shaker: "<[" + SHAKE + "] [" + SHAKE + "] ~>", bass: bass(["F", "G", "C"]) }),
];
const song = {
  version: 1, title: "Opus & Astra", genre: "lofi_hiphop", bpm: 100, meter: { numerator: 4, denominator: 4 }, key: "C major", seed: 6055,
  swing: 0.56, sampleRate: 44100, tailSeconds: 3,
  fx: { reverb: { type: "plate", decaySeconds: 2.2, preDelayMs: 25, lowCutHz: 200, highCutHz: 9000, width: 1.3 }, delay: { time: "1/8d", feedback: 0.35, pingPong: true, lowCutHz: 300, highCutHz: 6500 } },
  master: { targetLufs: -14, ceilingDb: -2, fx: [{ type: "eq", lowGainDb: 0.5, midGainDb: -1, midHz: 400, highGainDb: -0.5, highHz: 9000 }, { type: "compressor", ratio: 2, thresholdDb: -16, attackMs: 25, releaseMs: 180 }] },
  tracks, sections, arrangement: sections.map((x) => ({ section: x.id })),
};
writeFileSync(process.argv[2], JSON.stringify(song, null, 2) + "\n");
