// Builds timeline.json for "Opus & Astra", a paper-cutout short about claude-opus-5-5 and gpt-6-astra getting along.
// Every shape is a vid2 stage node animated in JS; the sheet comes from make-paper.mjs. 100 BPM, 1 bar = 2.4 s. Usage: node build-timeline.mjs
import { writeFileSync } from "node:fs";

const INK = "#2B2118", CREAM = "#FFF8EC", CLAY = "#D97757", CLAY_DK = "#B85C3E", NAVY = "#23386A", NAVY_DK = "#18284D";
const GOLD = "#E9B44C", BLUSH = "#F2A08B", ROSE = "#E0675A", SAGE = "#8FB39A", SKY = "#7FA7D6";
const SH = { color: "#4A36244D", blur: 6, x: 3, y: 7 }, SH_SOFT = { color: "#4A362433", blur: 4, x: 2, y: 4 };
const BAR = 2.4, f = (v) => Math.max(0, v).toFixed(3) + "s";
const rect = (key, width, height, x, y, o = {}) => ({ kind: "rect", key, width, height, x, y, ...o });
const txt = (key, text, x, y, o = {}) => ({ kind: "text", key, text, x, y, ...o });
const grp = (key, x, y, o = {}) => ({ kind: "group", key, x, y, ...o });

let seed = 55;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** Collects keys per node/prop so helpers can add motion independently; one track per prop at the end. */
function stage() {
  const nodes = [], keys = new Map(), events = [];
  const k = (node, prop, at, value, ease, spring) => {
    const id = node + "|" + prop;
    if (!keys.has(id)) keys.set(id, new Map());
    keys.get(id).set(Math.round(at * 1000), { at: f(at), value, ...(ease ? { ease } : {}), ...(spring ? { spring } : {}) });
  };
  const ev = (at, kind) => events.push({ at: f(at), kind });
  const layer = () => ({ type: "stage", nodes, events, tracks: [...keys].map(([id, m]) => {
    const [node, prop] = id.split("|");
    return { node, prop, keys: [...m.keys()].sort((a, b) => a - b).map((t) => m.get(t)) };
  }) });
  return { nodes, k, ev, layer };
}
const POP = { stiffness: 260, damping: 13 }, SETTLE = { stiffness: 200, damping: 20 };

function face(S, p, eye, pupil, smile) {
  S.nodes.push(grp(p + ":eyes", 0, -14, { parent: p }));
  for (const sx of [-1, 1]) {
    S.nodes.push(rect(p + ":eye" + sx, 24, 32, sx * 38, 0, { parent: p + ":eyes", radius: 999, fill: eye }));
    if (pupil) S.nodes.push(rect(p + ":pup" + sx, 13, 17, sx * 38, 3, { parent: p + ":eyes", radius: 999, fill: pupil }));
    S.nodes.push(rect(p + ":cheek" + sx, 34, 18, sx * 64, 26, { parent: p, radius: 999, fill: BLUSH, opacity: 0.85 }));
  }
  S.nodes.push(grp(p + ":mouth", 0, 24, { parent: p, clip: { x: -24, y: 2, width: 48, height: 26 } }),
    rect(p + ":smile", 40, 36, 0, 0, { parent: p + ":mouth", radius: 999, fill: "#00000000", stroke: smile, strokeWidth: 6 }));
}

function opus(S, x, y) {
  const p = "opus";
  S.nodes.push(rect(p + ":ground", 190, 30, x, y + 122, { radius: 999, fill: "#3B2A1A", opacity: 0.13 }), grp(p, x, y), grp(p + ":rays", 0, 0, { parent: p, z: -2 }));
  for (let i = 0; i < 12; i++) S.nodes.push(rect(p + ":ray" + i, 22, i % 2 ? 250 : 300, 0, 0, { parent: p + ":rays", radius: 11, fill: CLAY_DK, rotation: i * 15 + 4 * Math.sin(i * 2.3), shadow: SH_SOFT }));
  for (const sx of [-1, 1]) S.nodes.push(rect(p + ":arm" + sx, 28, 86, sx * 96, 6, { parent: p, radius: 14, fill: CLAY, anchorY: 0.12, rotation: sx * -32, z: -1, shadow: SH_SOFT }));
  S.nodes.push(rect(p + ":body", 214, 214, 0, 0, { parent: p, radius: 999, fill: CLAY, shadow: SH }));
  face(S, p, INK, null, INK);
}

function astra(S, x, y) {
  const p = "astra";
  S.nodes.push(rect(p + ":ground", 190, 30, x, y + 122, { radius: 999, fill: "#3B2A1A", opacity: 0.13 }), grp(p, x, y), grp(p + ":star", 0, -122, { parent: p, z: -2 }));
  S.nodes.push(rect(p + ":st0", 78, 78, 0, 0, { parent: p + ":star", radius: 10, fill: GOLD, shadow: SH_SOFT }), rect(p + ":st1", 78, 78, 0, 0, { parent: p + ":star", radius: 10, fill: GOLD, rotation: 45, shadow: SH_SOFT }),
    rect(p + ":st2", 30, 30, 0, 0, { parent: p + ":star", radius: 999, fill: CREAM }));
  for (const sx of [-1, 1]) S.nodes.push(rect(p + ":arm" + sx, 28, 86, sx * 94, 6, { parent: p, radius: 14, fill: NAVY, anchorY: 0.12, rotation: sx * -32, z: -1, shadow: SH_SOFT }));
  S.nodes.push(rect(p + ":body", 204, 204, 0, 0, { parent: p, radius: 58, fill: NAVY, shadow: SH }), rect(p + ":band", 204, 18, 0, 70, { parent: p, fill: NAVY_DK, opacity: 0.6 }));
  face(S, p, CREAM, INK, CREAM);
}

/** Stop-motion boil: the whole puppet holds a slightly different pose every 1/8 s. */
function boil(S, p, from, to) {
  let i = 0;
  for (let t = from; t < to; t += 0.125, i++) S.k(p, "rotation", t, [0.8, -0.5, 0.3, -0.9, 0.6, -0.2][i % 6], "hold");
}
function blink(S, p, t) { S.k(p + ":eyes", "scaleY", t, 1); S.k(p + ":eyes", "scaleY", t + 0.06, 0.1, "in"); S.k(p + ":eyes", "scaleY", t + 0.15, 1, "out"); }
function hops(S, p, x0, x1, y, t0, n, dur = 0.34, h = 80) {
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dur, xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n;
    S.k(p, "x", t, xa); S.k(p, "x", t + dur, xb, "linear"); S.k(p + ":ground", "x", t, xa); S.k(p + ":ground", "x", t + dur, xb, "linear");
    S.k(p, "y", t, y); S.k(p, "y", t + dur * 0.5, y - h, "out"); S.k(p, "y", t + dur, y, "in");
    S.k(p + ":ground", "scaleX", t, 1); S.k(p + ":ground", "scaleX", t + dur * 0.5, 0.6, "out"); S.k(p + ":ground", "scaleX", t + dur, 1, "in");
    S.k(p, "scaleY", t + dur, 0.9, "in"); S.k(p, "scaleX", t + dur, 1.07, "in");
    S.k(p, "scaleY", t + dur + 0.02, 1, "spring", POP); S.k(p, "scaleX", t + dur + 0.02, 1, "spring", POP);
  }
}
/** Arm swing: side -1 is the puppet's left arm. Rest pose is 32° outward. */
function wave(S, p, side, t, times = 2) {
  const a = p + ":arm" + side, rest = side * -32, up = side * -150, mid = side * -118;
  S.k(a, "rotation", t, rest); S.k(a, "rotation", t + 0.18, up, "out");
  for (let i = 0; i < times; i++) { S.k(a, "rotation", t + 0.36 + i * 0.36, mid); S.k(a, "rotation", t + 0.54 + i * 0.36, up); }
  S.k(a, "rotation", t + 0.72 + times * 0.36, rest, "inout");
}
function heart(S, key, x, y, size, color, o = {}) {
  const r = size / (2 * Math.SQRT2);
  S.nodes.push(grp(key, x, y, { scale: 0.01, ...o }), rect(key + ":sq", size, size, 0, 0, { parent: key, rotation: 45, fill: color, shadow: SH_SOFT }),
    rect(key + ":l", size, size, -r, -r, { parent: key, radius: 999, fill: color }), rect(key + ":r", size, size, r, -r, { parent: key, radius: 999, fill: color }));
}
function floatHeart(S, key, x, y, size, color, t, rise = 220) {
  heart(S, key, x, y, size, color);
  S.k(key, "scale", t, 1, "spring", POP); S.k(key, "y", t, y); S.k(key, "y", t + 1.6, y - rise, "out");
  S.k(key, "opacity", t + 1.0, 1); S.k(key, "opacity", t + 1.6, 0, "in"); S.k(key, "rotation", t, -8); S.k(key, "rotation", t + 1.6, 8);
  S.ev(t, "icon");
}
function bubble(S, key, text, x, y, tail, t, out) {
  const w = 60 + text.length * 22;
  S.nodes.push(grp(key, x, y, { scale: 0.01 }), rect(key + ":tail", 36, 36, tail * (w / 2 - 70), 50, { parent: key, rotation: 45, fill: CREAM, shadow: SH_SOFT }),
    rect(key + ":bg", w, 116, 0, 0, { parent: key, radius: 44, fill: CREAM, shadow: SH }),
    txt(key + ":t", text, 0, 2, { parent: key, font: "serif", weight: "italic", size: 58, color: INK }));
  S.k(key, "scale", t, 1, "spring", POP); S.k(key, "rotation", t, tail * -3);
  S.k(key, "opacity", out, 1); S.k(key, "opacity", out + 0.3, 0); S.k(key, "y", out, y); S.k(key, "y", out + 0.3, y - 30, "out");
  S.ev(t, "icon");
}
function tag(S, key, text, x, y, rot, t) {
  S.nodes.push(grp(key, x, y + 40, { rotation: rot, opacity: 0 }), rect(key + ":bg", 30 + text.length * 17, 54, 0, 0, { parent: key, radius: 6, fill: CREAM, shadow: SH_SOFT }),
    txt(key + ":t", text, 0, 1, { parent: key, font: "mono", weight: "regular", size: 26, color: INK }));
  S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.2, 1); S.k(key, "y", t, y + 40); S.k(key, "y", t + 0.25, y, "spring", SETTLE);
}

// —— scene 1 · title: two paper strips taped together
function title() {
  const S = stage();
  const strip = (key, text, color, ink, x, y, w, rot, from, t) => {
    S.nodes.push(grp(key, from, y, { rotation: rot }), rect(key + ":bg", w, 196, 0, 0, { parent: key, radius: 4, fill: color, shadow: SH }),
      txt(key + ":t", text, 0, 4, { parent: key, font: "serif", weight: "italic", size: 132, color: ink }),
      rect(key + ":tape", 120, 40, -w / 2 + 30, -92, { parent: key, rotation: -18, fill: "#F3E2A9B3" }), rect(key + ":tape2", 120, 40, w / 2 - 30, 92, { parent: key, rotation: -18, fill: "#F3E2A9B3" }));
    S.k(key, "x", t, from); S.k(key, "x", t + 0.45, x, "out"); S.k(key, "rotation", t + 0.45, rot, "spring", SETTLE); S.ev(t + 0.4, "icon");
  };
  strip("sa", "Opus 5.5", CLAY, CREAM, 690, 450, 720, -3, -500, 0.25);
  strip("sb", "GPT-6 Astra", NAVY, CREAM, 1250, 640, 840, 2.5, 2450, 0.6);
  S.nodes.push(grp("amp", 975, 548, { scale: 0.01, z: 5 }), rect("amp:bg", 118, 118, 0, 0, { parent: "amp", radius: 999, fill: GOLD, shadow: SH }),
    txt("amp:t", "&", 0, 6, { parent: "amp", font: "serif", weight: "italic", size: 92, color: INK }));
  S.k("amp", "scale", 1.25, 1, "spring", POP); S.k("amp", "rotation", 1.25, -20); S.k("amp", "rotation", 1.8, 8, "out"); S.ev(1.25, "click");
  S.nodes.push(txt("sub", "a small paper story about getting along", 960, 880, { font: "serif", weight: "italic", size: 54, color: INK, opacity: 0 }));
  S.k("sub", "opacity", 1.8, 0); S.k("sub", "opacity", 2.3, 1); S.k("sub", "y", 1.8, 910); S.k("sub", "y", 2.3, 880, "out");
  tag(S, "ta", "claude-opus-5-5", 470, 300, -4, 1.0); tag(S, "tb", "gpt-6-astra", 1500, 790, 3, 1.15);
  confettiRain(S, 18, 0.2, 4.6);
  return S.layer();
}

function confettiRain(S, n, from, to) {
  const colors = [CLAY, NAVY, GOLD, SAGE, SKY, ROSE];
  for (let i = 0; i < n; i++) {
    const key = "rain" + i, x = 80 + rnd() * 1760, t = from + rnd() * (to - from - 2.2), size = 14 + rnd() * 16;
    S.nodes.push(rect(key, size, size * 0.6, x, -40, { fill: colors[i % colors.length], rotation: rnd() * 180, shadow: SH_SOFT, z: -3 }));
    S.k(key, "y", t, -40); S.k(key, "y", t + 2.4, 1120, "linear"); S.k(key, "x", t + 2.4, x + (rnd() - 0.5) * 240, "inout");
    S.k(key, "rotation", t + 2.4, rnd() * 720 - 360, "linear");
  }
}
function burst(S, cx, cy, n, t) {
  const colors = [CLAY, NAVY, GOLD, SAGE, SKY, ROSE, CREAM];
  for (let i = 0; i < n; i++) {
    const key = "cf" + i, a = (i / n) * Math.PI * 2 + rnd() * 0.3, d = 240 + rnd() * 360, size = 16 + rnd() * 18;
    const x1 = cx + Math.cos(a) * d, y1 = cy + Math.sin(a) * d * 0.75 - 120;
    S.nodes.push(rect(key, size, size * 0.62, cx, cy, { fill: colors[i % colors.length], opacity: 0, rotation: rnd() * 180, shadow: SH_SOFT, z: 8 }));
    S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.03, 1); S.k(key, "x", t, cx); S.k(key, "x", t + 0.7, x1, "out"); S.k(key, "x", t + 2.8, x1 + (rnd() - 0.5) * 120);
    S.k(key, "y", t, cy); S.k(key, "y", t + 0.7, y1, "out"); S.k(key, "y", t + 2.8, y1 + 520, "in");
    S.k(key, "rotation", t + 2.8, rnd() * 900 - 450, "linear"); S.k(key, "opacity", t + 2.4, 1); S.k(key, "opacity", t + 2.8, 0);
  }
}

// —— scene 2 · they hop in and say hello
function meet() {
  const S = stage(), Y = 600, end = 3 * BAR;
  opus(S, -220, Y); astra(S, 2140, Y);
  hops(S, "opus", -220, 600, Y, 0.2, 4); hops(S, "astra", 2140, 1320, Y, 0.45, 4);
  boil(S, "opus", 1.7, end); boil(S, "astra", 1.95, end);
  S.k("opus:rays", "rotation", 0, 0); S.k("opus:rays", "rotation", end, 40, "linear");
  S.k("astra:star", "rotation", 0, 0); S.k("astra:star", "rotation", end, 90, "linear");
  tag(S, "ta", "claude-opus-5-5", 600, 820, -2, 1.9); tag(S, "tb", "gpt-6-astra", 1320, 820, 2, 2.1);
  blink(S, "astra", 2.05); blink(S, "opus", 2.3); blink(S, "astra", 4.6); blink(S, "opus", 5.1);
  S.k("astra:pup-1", "x", 2.3, -38); S.k("astra:pup-1", "x", 2.5, -44, "out"); S.k("astra:pup1", "x", 2.3, 38); S.k("astra:pup1", "x", 2.5, 32, "out");
  bubble(S, "bo", "oh — hi there!", 760, 300, -1, 2.4, 5.2); wave(S, "opus", 1, 2.4);
  bubble(S, "ba", "hi! I'm Astra.", 1170, 330, 1, 3.7, 5.2); wave(S, "astra", -1, 3.7);
  hops(S, "opus", 600, 600, Y, 5.45, 2, 0.3, 60); hops(S, "astra", 1320, 1320, Y, 5.55, 2, 0.3, 60);
  floatHeart(S, "h1", 960, 520, 70, ROSE, 5.7); floatHeart(S, "h2", 900, 560, 40, CLAY, 5.95, 180); floatHeart(S, "h3", 1030, 560, 44, SKY, 6.1, 200);
  return S.layer();
}

// —— scene 3 · taking turns, they toss letter tiles into "FRIENDS"
function build() {
  const S = stage(), Y = 600, end = 3 * BAR, word = "FRIENDS";
  opus(S, 600, Y); astra(S, 1320, Y);
  S.k("opus", "x", 0.1, 600); S.k("opus", "x", 0.6, 330, "inout"); S.k("opus:ground", "x", 0.1, 600); S.k("opus:ground", "x", 0.6, 330, "inout");
  S.k("astra", "x", 0.1, 1320); S.k("astra", "x", 0.6, 1590, "inout"); S.k("astra:ground", "x", 0.1, 1320); S.k("astra:ground", "x", 0.6, 1590, "inout");
  boil(S, "opus", 0.7, end); boil(S, "astra", 0.7, end);
  S.k("opus:rays", "rotation", 0, 40); S.k("opus:rays", "rotation", end, 80, "linear");
  S.k("astra:star", "rotation", 0, 90); S.k("astra:star", "rotation", end, 180, "linear");
  [...word].forEach((ch, i) => toss(S, ch, i, 0.95 + i * 0.52));
  const done = 0.95 + 6 * 0.52 + 0.5;
  S.ev(done + 0.15, "state");
  [...word].forEach((_, i) => { const t = done + 0.2 + i * 0.07, y = 610 - 0; S.k("tile" + i, "y", t, y); S.k("tile" + i, "y", t + 0.15, y - 40, "out"); S.k("tile" + i, "y", t + 0.4, y, "spring", POP); });
  hops(S, "opus", 330, 330, Y, done + 0.3, 2, 0.3, 70); hops(S, "astra", 1590, 1590, Y, done + 0.35, 2, 0.3, 70);
  blink(S, "opus", 0.5); blink(S, "astra", 2.9); blink(S, "opus", done + 1.3);
  floatHeart(S, "h1", 700, 470, 54, ROSE, done + 0.8); floatHeart(S, "h2", 1230, 470, 54, ROSE, done + 0.95);
  return S.layer();
}
function toss(S, ch, i, t) {
  const fromOpus = i % 2 === 0, key = "tile" + i, x0 = fromOpus ? 440 : 1480, x1 = 960 + (i - 3) * 122, y1 = 610;
  const tilt = (rnd() - 0.5) * 9, fill = fromOpus ? CLAY : NAVY, ink = fromOpus ? CREAM : GOLD;
  S.nodes.push(grp(key, x0, 560, { opacity: 0, z: 4 }), rect(key + ":bg", 108, 118, 0, 0, { parent: key, radius: 10, fill, shadow: SH }),
    txt(key + ":t", ch, 0, 3, { parent: key, weight: "black", size: 74, color: ink }));
  const who = fromOpus ? "opus" : "astra", side = fromOpus ? 1 : -1, arm = who + ":arm" + side;
  S.k(arm, "rotation", t - 0.3, side * -32); S.k(arm, "rotation", t - 0.1, side * -160, "out"); S.k(arm, "rotation", t + 0.08, side * -70, "in"); S.k(arm, "rotation", t + 0.4, side * -32);
  S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.04, 1);
  S.k(key, "x", t, x0); S.k(key, "x", t + 0.5, x1, "linear");
  S.k(key, "y", t, 560); S.k(key, "y", t + 0.25, 250, "out"); S.k(key, "y", t + 0.5, y1, "in");
  S.k(key, "rotation", t, 0); S.k(key, "rotation", t + 0.5, side * 360 + tilt, "linear");
  S.k(key, "scaleY", t + 0.5, 0.86); S.k(key, "scaleY", t + 0.52, 1, "spring", POP);
  S.ev(t, "tick"); S.ev(t + 0.5, "icon");
}

// —— scene 4 · high five, confetti, end card
function finale() {
  const S = stage(), Y = 640, hit = 1.25;
  opus(S, 330, Y); astra(S, 1590, Y);
  hops(S, "opus", 330, 812, Y, 0.1, 3, 0.3, 70); hops(S, "astra", 1590, 1108, Y, 0.1, 3, 0.3, 70);
  boil(S, "opus", 1.1, 7.2); boil(S, "astra", 1.1, 7.2);
  S.k("opus:rays", "rotation", 0, 80); S.k("opus:rays", "rotation", 7.2, 130, "linear");
  S.k("astra:star", "rotation", 0, 180); S.k("astra:star", "rotation", 7.2, 290, "linear");
  S.k("opus:arm1", "rotation", 0.9, -32); S.k("opus:arm1", "rotation", hit, -148, "out"); S.k("opus:arm1", "rotation", hit + 0.08, -140, "spring", POP);
  S.k("astra:arm-1", "rotation", 0.9, 32); S.k("astra:arm-1", "rotation", hit, 148, "out"); S.k("astra:arm-1", "rotation", hit + 0.08, 140, "spring", POP);
  S.k("opus:arm1", "rotation", 2.6, -140); S.k("opus:arm1", "rotation", 3.0, -32, "inout");
  S.k("astra:arm-1", "rotation", 2.6, 140); S.k("astra:arm-1", "rotation", 3.0, 32, "inout");
  S.nodes.push(grp("pow", 960, 548, { scale: 0.01, z: 6 }));
  for (let i = 0; i < 8; i++) S.nodes.push(rect("pow:" + i, 14, 70, 0, -75, { parent: "pow", radius: 7, fill: GOLD, anchorY: 1.9, rotation: i * 45 }));
  S.k("pow", "scale", hit, 1, "spring", POP); S.k("pow", "opacity", hit + 0.5, 1); S.k("pow", "opacity", hit + 0.8, 0);
  burst(S, 960, 560, 44, hit); S.ev(hit, "click"); S.ev(hit + 0.02, "state");
  blink(S, "opus", 2.2); blink(S, "astra", 2.25); blink(S, "opus", 5.2); blink(S, "astra", 5.6);
  S.nodes.push(txt("end", "better together.", 960, 230, { font: "serif", weight: "italic", size: 132, color: INK, opacity: 0 }));
  S.k("end", "opacity", 2.6, 0); S.k("end", "opacity", 3.1, 1); S.k("end", "y", 2.6, 270); S.k("end", "y", 3.1, 230, "out");
  tag(S, "tn", "claude-opus-5-5  ×  gpt-6-astra", 960, 900, -1.5, 3.4);
  floatHeart(S, "h1", 960, 500, 64, ROSE, 3.8, 110);
  S.k("opus", "rotation", 6.3, 0); S.k("astra", "rotation", 6.3, 0);
  return S.layer();
}

const paper = { type: "media", source: "paper", fit: "cover" };
const scenes = [
  { id: "title", duration: f(2 * BAR), background: "#F1E8D6", layers: [paper, title()], transition: { type: "fade", duration: "0.4s" } },
  { id: "meet", duration: f(3 * BAR), background: "#F1E8D6", layers: [paper, meet()], transition: { type: "fade", duration: "0.35s" } },
  { id: "build", duration: f(3 * BAR), background: "#F1E8D6", layers: [paper, build()], transition: { type: "fade", duration: "0.35s" } },
  { id: "finale", duration: f(3 * BAR), background: "#F1E8D6", layers: [paper, finale()], effects: [{ type: "flash", at: "1.25s", strength: 0.12, decay: 14 }] },
];
const timeline = {
  version: 1, output: { width: 1920, height: 1080, fps: 30, background: "#F1E8D6" }, beat: { bpm: 100 },
  sources: { paper: { type: "image", path: "media/paper.png" }, music: { type: "audio", path: "media/music.wav" } },
  scenes, effects: [{ type: "grain", strength: 4 }, { type: "vignette", strength: 0.12 }],
  audio: { music: { source: "music", volume: 0.8, fadeOut: "1.5s" }, autoCues: true },
};
writeFileSync(new URL("./timeline.json", import.meta.url), JSON.stringify(timeline, null, 1) + "\n");
