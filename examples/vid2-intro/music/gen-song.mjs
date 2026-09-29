// Generates ima2-launch.song.json for music2-gen. Usage: node gen-song.mjs out.song.json
import { writeFileSync } from "node:fs";
const C = {
  Dm: { pad: "d4,f4,a4,c5,e5", stab: "d4,f4,a4,c5", bass: "d2", arp: "d5 ~ a5 ~ f5 e5 ~ c6 ~ a5 ~ f5 ~ e5 d5 ~", bell: "a5 ~ ~ ~ ~ ~ e6 ~ ~ ~ d6 ~ ~ ~ ~ ~" },
  Bb: { pad: "bb3,d4,f4,a4,c5", stab: "bb3,d4,f4,a4", bass: "bb1", arp: "bb4 ~ f5 ~ d5 c5 ~ a5 ~ f5 ~ d5 ~ c5 bb4 ~", bell: "f5 ~ ~ ~ ~ ~ d6 ~ ~ ~ c6 ~ ~ ~ ~ ~" },
  Gm: { pad: "g3,bb3,d4,f4,a4", stab: "g3,bb3,d4,f4", bass: "g1", arp: "g4 ~ d5 ~ bb4 a4 ~ f5 ~ d5 ~ bb4 ~ a4 g4 ~", bell: "d6 ~ ~ ~ ~ ~ bb5 ~ ~ ~ a5 ~ ~ ~ ~ ~" },
  Am: { pad: "a3,c4,e4,g4,c5", stab: "a3,c4,e4,g4", bass: "a1", arp: "a4 ~ e5 ~ c5 g4 ~ e5 ~ c5 ~ g4 ~ e5 a4 ~", bell: "e6 ~ ~ ~ ~ ~ c6 ~ ~ ~ g5 ~ ~ ~ e5 ~" },
};
const PROG = ["Dm", "Bb", "Gm", "Am"];
const alt = (chords, fn) => chords.length === 1 ? fn(C[chords[0]], chords[0]) : "<" + chords.map((c) => "[" + fn(C[c], c) + "]").join(" ") + ">";
const P = {
  pad: (ch) => alt(ch, (c) => c.pad),
  arp: (ch) => alt(ch, (c) => c.arp),
  bell: (ch) => alt(ch, (c) => c.bell),
  bass: (ch) => alt(ch, (c) => { const r = c.bass, o = r.replace(/\d$/, (d) => String(+d + 1)); return "~ " + r + " ~ " + r + " ~ " + r + " " + r + " " + o; }),
  stab: (ch) => alt(ch, (c) => "~ [" + c.stab + "] ~ [" + c.stab + "] ~ [" + c.stab + "] ~ [" + c.stab + "]"),
  swell: (ch) => alt(ch, (c) => c.stab),
  hit: (ch) => alt(ch, (c) => c.pad + ",d3"),
};
const HOLE = (steps) => steps.slice(0, 14).join(" ") + " ~ ~";
const T = (id, kind, instrument, extra) => ({ id, kind, instrument, pattern: "~", ...extra });
const tracks = [
  T("kick", "drums", "drums", { gain: -3, params: { tone: 0.42, decayMs: 260, noise: 0.15 }, fx: [{ type: "eq", lowGainDb: 0, midGainDb: -3, midHz: 400, highGainDb: 0 }] }),
  T("kick_soft", "drums", "drums", { gain: -10, params: { tone: 0.3, decayMs: 320, noise: 0.05 }, fx: [{ type: "filter", mode: "lowpass", cutoffHz: 260 }] }),
  T("impact", "drums", "drums", { gain: -8, params: { tone: 0.2, decayMs: 1000, noise: 0.15 }, sends: { reverb: 0.45, delay: 0 }, fx: [{ type: "filter", mode: "lowpass", cutoffHz: 12000 }] }),
  T("clap", "drums", "drums", { gain: -3, params: { noise: 0.7, decayMs: 200 }, sends: { reverb: 0.2, delay: 0 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 300 }, { type: "filter", mode: "lowpass", cutoffHz: 12000 }] }),
  T("hats", "drums", "drums", { gain: -2, pan: 0.15, velocity: "0.5 0.25 0.8 0.3 0.5 0.25 0.9 0.3 0.5 0.25 0.8 0.3 0.5 0.3 0.9 0.4", params: { noise: 0.8, decayMs: 45 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 6000 }, { type: "filter", mode: "lowpass", cutoffHz: 12000 }] }),
  T("open", "drums", "drums", { gain: -6, pan: -0.15, params: { noise: 0.7, decayMs: 160 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 5000 }, { type: "filter", mode: "lowpass", cutoffHz: 12000 }] }),
  T("rim", "drums", "drums", { gain: -8, pan: 0.3, params: { tone: 0.7, decayMs: 60 }, sends: { reverb: 0.1, delay: 0.3 }, fx: [{ type: "filter", mode: "lowpass", cutoffHz: 12000 }] }),
  T("roll", "drums", "drums", { gain: -6, velocity: "0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 1", params: { noise: 0.75, decayMs: 110 }, sends: { reverb: 0.25, delay: 0 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 400 }, { type: "filter", mode: "lowpass", cutoffHz: 12000 }] }),
  T("bass", "notes", "bass", { gain: -10, mono: true, gate: 0.7, params: { wave: 1, cutoffHz: 650, resonance: 0.25, releaseMs: 60, filterEnvAmount: 0.35, filterEnvDecayMs: 120 }, duck: { by: "kick", amount: 0.6, releaseMs: 140 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 30 }, { type: "drive", amount: 2.5, mix: 0.25 }] }),
  T("pad", "notes", "pad", { gain: -5, params: { detuneCents: 16, cutoffHz: 4200, attackMs: 600, releaseMs: 1400, unison: 5 }, sends: { reverb: 0.35, delay: 0 }, duck: { by: "kick", amount: 0.45, releaseMs: 220 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 180 }, { type: "chorus", mix: 0.25 }, { type: "width", amount: 1.5, monoBelowHz: 150 }] }),
  T("pad_dark", "notes", "pad", { gain: -10, params: { detuneCents: 14, cutoffHz: 1600, attackMs: 900, releaseMs: 1600, unison: 5 }, sends: { reverb: 0.45, delay: 0 }, fx: [{ type: "filter", mode: "lowpass", cutoffHz: 2200, lfoRateHz: 0.13, lfoDepthOct: 1.2 }, { type: "width", amount: 1.6, monoBelowHz: 150 }] }),
  T("arp", "notes", "pluck", { gain: -3, pan: 0.1, params: { damping: 0.994, decayMs: 700, brightness: 0.75 }, sends: { reverb: 0.2, delay: 0.35 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 250 }] }),
  T("arp_dark", "notes", "pluck", { gain: -10, pan: -0.1, params: { damping: 0.99, decayMs: 600, brightness: 0.55 }, sends: { reverb: 0.3, delay: 0.45 }, fx: [{ type: "filter", mode: "lowpass", cutoffHz: 2600 }] }),
  T("bell", "notes", "bell", { gain: -12, pan: -0.2, params: { ratio: 3.5, index: 1.1, decayMs: 1400 }, sends: { reverb: 0.4, delay: 0.3 } }),
  T("stab", "notes", "supersaw", { gain: -6, gate: 0.45, params: { unison: 7, detuneCents: 22, mix: 0.8, cutoffHz: 5000, resonance: 0.2, filterEnvAmount: 0.5, filterEnvDecayMs: 180, attackMs: 4, releaseMs: 120 }, sends: { reverb: 0.2, delay: 0.15 }, duck: { by: "kick", amount: 0.5, releaseMs: 160 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 220 }, { type: "filter", mode: "lowpass", cutoffHz: 13000 }, { type: "width", amount: 1.6, monoBelowHz: 200 }] }),
  T("swell", "notes", "supersaw", { gain: -9, gate: 1, params: { unison: 7, detuneCents: 25, mix: 0.8, cutoffHz: 4000, attackMs: 1700, releaseMs: 60, filterEnvAmount: 0 }, sends: { reverb: 0.3, delay: 0 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 300 }, { type: "filter", mode: "lowpass", cutoffHz: 13000 }, { type: "width", amount: 1.8, monoBelowHz: 200 }] }),
  T("hit", "notes", "supersaw", { gain: -6, gate: 1, params: { unison: 9, detuneCents: 24, mix: 0.85, cutoffHz: 4200, attackMs: 30, releaseMs: 2600, filterEnvAmount: 0.6, filterEnvDecayMs: 900 }, sends: { reverb: 0.5, delay: 0.2 }, fx: [{ type: "filter", mode: "highpass", cutoffHz: 120 }, { type: "filter", mode: "lowpass", cutoffHz: 13000 }, { type: "width", amount: 1.7, monoBelowHz: 180 }] }),
];
const K4 = "bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~";
const CLAP = "~ ~ ~ ~ cp ~ ~ ~ ~ ~ ~ ~ cp ~ ~ ~";
const HH = "hh*16", OH = "~ ~ oh ~ ~ ~ oh ~ ~ ~ oh ~ ~ ~ oh ~";
const RIM = "~ ~ rim ~ ~ rim ~ ~ ~ ~ rim ~ ~ ~ rim ~";
const s = (id, bars, role, chords, p) => ({ id, bars, role, patterns: Object.fromEntries(tracks.map((t) => [t.id, p[t.id] === undefined ? null : p[t.id]])), _ch: chords });
const sections = [
  s("intro", 2, "intro", ["Bb"], { impact: "<[bd] ~>", pad_dark: "<~ [" + C.Bb.pad + "]>" }),
  s("rise", 2, "intro", ["Gm", "Am"], { pad_dark: P.pad(["Gm", "Am"]), bell: "<~ [" + C.Am.bell + "]>", arp_dark: "<~ [" + C.Am.arp + "]>", kick_soft: "bd ~ ~ ~ ~ ~ ~ ~ bd ~ ~ ~ ~ ~ ~ ~" }),
  s("build", 1, "build", ["Gm"], { pad_dark: P.pad(["Gm"]), arp_dark: P.arp(["Gm"]), kick_soft: "bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~", roll: "sd ~ ~ ~ sd ~ ~ ~ sd ~ ~ ~ sd ~ sd ~", swell: P.swell(["Gm"]), open: OH }),
  s("lift", 1, "build", ["Am"], { pad_dark: P.pad(["Am"]), arp: P.arp(["Am"]), kick: "bd ~ bd ~ bd ~ bd ~ bd ~ bd ~ bd ~ ~ ~", roll: HOLE(Array(16).fill("sd")), hats: HOLE(Array(16).fill("hh")), swell: P.swell(["Am"]) }),
  s("drop", 2, "hook", ["Dm", "Bb"], { impact: "bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~", kick: K4, clap: CLAP, hats: HH, open: OH, bass: P.bass(["Dm", "Bb"]), pad: P.pad(["Dm", "Bb"]), stab: P.stab(["Dm", "Bb"]), arp: P.arp(["Dm", "Bb"]), bell: P.bell(["Dm", "Bb"]), hit: "<[" + C.Dm.pad + ",d3] ~>" }),
  s("glide", 2, "breakdown", ["Gm", "Am"], { pad: P.pad(["Gm", "Am"]), arp: P.arp(["Gm", "Am"]), rim: RIM, hats: HH, clap: CLAP, bell: P.bell(["Gm", "Am"]) }),
  s("reload", 1, "build", ["Am"], { pad: P.pad(["Am"]), arp: P.arp(["Am"]), roll: HOLE(["sd","~","sd","~","sd","~","sd","~","sd","sd","sd","sd","sd","sd","sd","sd"]), kick: "bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~", swell: P.swell(["Am"]) }),
  s("groove", 3, "verse", ["Dm", "Bb", "Gm"], { impact: "<[bd] ~ ~>", kick: K4, clap: CLAP, hats: HH, open: OH, rim: RIM, bass: P.bass(["Dm", "Bb", "Gm"]), pad_dark: P.pad(["Dm", "Bb", "Gm"]), arp: P.arp(["Dm", "Bb", "Gm"]) }),
  s("fill", 1, "build", ["Am"], { kick: K4, clap: CLAP, hats: HOLE(Array(16).fill("hh")), rim: RIM, bass: P.bass(["Am"]), pad: P.pad(["Am"]), arp: P.arp(["Am"]), roll: "~ ~ ~ ~ ~ ~ ~ ~ sd sd sd sd sd sd ~ ~", swell: P.swell(["Am"]) }),
  s("peak", 4, "hook", PROG, { impact: "<bd ~ ~ ~>", kick: K4, clap: CLAP, hats: HH, open: OH, rim: RIM, bass: P.bass(PROG), pad: P.pad(PROG), stab: P.stab(PROG), arp: P.arp(PROG), bell: P.bell(PROG), hit: "<[" + C.Dm.pad + ",d3] ~ ~ ~>" }),
  s("peak2", 2, "hook", ["Dm", "Bb"], { kick: K4, clap: CLAP, hats: HH, open: OH, rim: RIM, bass: P.bass(["Dm", "Bb"]), pad: P.pad(["Dm", "Bb"]), stab: P.stab(["Dm", "Bb"]), arp: P.arp(["Dm", "Bb"]), bell: P.bell(["Dm", "Bb"]) }),
  s("turn", 1, "build", ["Am"], { kick: K4, clap: CLAP, hats: HOLE(Array(16).fill("hh")), bass: HOLE(P.bass(["Am"]).split(" ").concat(Array(8).fill("~"))), pad: P.pad(["Am"]), stab: P.stab(["Am"]), roll: "~ ~ ~ ~ ~ ~ ~ ~ sd sd sd sd sd sd ~ ~", swell: P.swell(["Am"]) }),
  s("local", 2, "breakdown", ["Gm", "Bb"], { impact: "<bd ~>", kick_soft: "bd ~ ~ ~ ~ ~ ~ ~ bd ~ ~ ~ ~ ~ ~ ~", hats: HH, rim: RIM, pad: P.pad(["Gm", "Bb"]), arp: P.arp(["Gm", "Bb"]), bell: P.bell(["Gm", "Bb"]) }),
  s("end", 3, "outro", ["Dm", "Dm", "Dm"], { impact: "<bd ~ ~>", hit: "<[" + C.Dm.pad + ",d3] ~ ~>", pad_dark: "<[" + C.Dm.pad + "] [" + C.Dm.pad + "] ~>", bell: "<[a5 ~ ~ ~ ~ ~ e6 ~ ~ ~ d6 ~ ~ ~ ~ ~] [~ ~ ~ ~ a5 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~] ~>" }),
];
for (const x of sections) delete x._ch;
const song = {
  version: 1, title: "ima2 — Launch", genre: "house", bpm: 128, meter: { numerator: 4, denominator: 4 }, key: "D minor", seed: 2802,
  swing: 0.5, sampleRate: 44100, tailSeconds: 3,
  fx: { reverb: { type: "plate", decaySeconds: 2.2, preDelayMs: 20, lowCutHz: 200, highCutHz: 11000, width: 1.4 }, delay: { time: "1/8d", feedback: 0.38, pingPong: true, lowCutHz: 300, highCutHz: 7000 } },
  master: { targetLufs: -12, ceilingDb: -2, fx: [{ type: "eq", lowGainDb: 1, midGainDb: -1, midHz: 500, highGainDb: 0.5, highHz: 9000 }, { type: "compressor", ratio: 2, thresholdDb: -14, attackMs: 20, releaseMs: 150 }, { type: "width", amount: 1.15, monoBelowHz: 150 }] },
  tracks, sections, arrangement: sections.map((x) => ({ section: x.id })),
};
writeFileSync(process.argv[2], JSON.stringify(song, null, 2) + "\n");

