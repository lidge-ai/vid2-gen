// Builds timeline.json for "vid2-gen, quietly": a 36 s product film in a keynote grammar. Black canvas, one sentence per scene,
// two greys and white, slow ease-out motion, no glows, cards or springs. The cue is music/vid2-intro.song.json (80 BPM, 1 bar = 3 s).
// Usage: node build-timeline.mjs
import { writeFileSync } from "node:fs";

const BLACK = "#000000", TEXT = "#F5F5F7", DIM = "#86868B", FAINT = "#505054", PANEL = "#1C1C1E", HAIR = "#2C2C2E", BLUE = "#2997FF";
const f = (v) => Math.max(0, v).toFixed(3) + "s";
const rect = (key, width, height, x, y, o = {}) => ({ kind: "rect", key, width, height, x, y, ...o });
const txt = (key, text, x, y, o = {}) => ({ kind: "text", key, text, x, y, ...o });
const grp = (key, x, y, o = {}) => ({ kind: "group", key, x, y, ...o });
const lerpHex = (a, b, t) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");

/** Key collector: helpers add motion per node and property; layer() turns the maps into sorted tracks. */
function stage() {
  const nodes = [], keys = new Map();
  const k = (node, prop, at, value, ease) => {
    const id = node + "|" + prop;
    if (!keys.has(id)) keys.set(id, new Map());
    keys.get(id).set(Math.round(at * 1000), { at: f(at), value, ...(ease ? { ease } : {}) });
  };
  const layer = () => ({ type: "stage", nodes, events: [], tracks: [...keys].map(([id, m]) => {
    const [node, prop] = id.split("|");
    return { node, prop, keys: [...m.keys()].sort((a, b) => a - b).map((t) => m.get(t)) };
  }) });
  return { nodes, k, layer };
}

const head = (key, text, y, o = {}) => txt(key, text, 960, y, { size: 176, weight: "semibold", color: TEXT, letterSpacing: -5, opacity: 0, ...o });
const sub = (key, text, y, o = {}) => txt(key, text, 960, y, { size: 50, weight: "regular", color: DIM, letterSpacing: -0.6, opacity: 0, ...o });

/** Text arrives the way Apple's titles do: a short rise, a soft focus pull and a long ease-out. */
function arrive(S, key, t, y, d = 1.1) {
  S.k(key, "opacity", t, 0); S.k(key, "opacity", t + d * 0.7, 1, "out");
  S.k(key, "y", t, y + 26); S.k(key, "y", t + d, y, "out");
  S.k(key, "blur", t, 10); S.k(key, "blur", t + d, 0, "out");
}
function leave(S, key, t, d = 0.7) { S.k(key, "opacity", t, 1); S.k(key, "opacity", t + d, 0, "in"); }
function drift(S, key, t0, t1, from, to) { S.k(key, "scale", t0, from); S.k(key, "scale", t1, to, "linear"); }
function typed(S, key, t0, cps, len) { S.k(key, "reveal", t0, 0, "linear"); S.k(key, "reveal", t0 + len / cps, len, "linear"); }

/** 1 — the premise, two lines. */
function premise(dur) {
  const S = stage();
  S.nodes.push(head("a", "Describe a video.", 450, { color: DIM }), head("b", "Render it.", 650));
  arrive(S, "a", 0.15, 450, 1.3); arrive(S, "b", 2.1, 650, 1.3);
  S.k("a", "opacity", 2.3, 1); S.k("a", "opacity", 3.2, 1);
  leave(S, "a", dur - 0.8); leave(S, "b", dur - 0.8);
  return S.layer();
}

/** 2 — the name. */
function brand(dur) {
  const S = stage();
  S.nodes.push(head("name", "vid2-gen", 500, { size: 260, letterSpacing: -9 }), sub("tag", "The video CLI for coding agents.", 700, { size: 58 }));
  arrive(S, "name", 0.3, 500, 1.6); arrive(S, "tag", 1.5, 700, 1.2);
  drift(S, "name", 0.3, dur, 1.05, 1); leave(S, "name", dur - 0.8); leave(S, "tag", dur - 0.8);
  return S.layer();
}

/** 3 — the one product object: a real command, typed. */
function terminal(dur) {
  const S = stage(), CMD = "vid2 render film.json --hw-accel required";
  S.nodes.push(head("h", "One file. One command.", 170, { size: 92, letterSpacing: -2.6 }));
  arrive(S, "h", 0.2, 170, 1.0);
  S.nodes.push(grp("win", 960, 610, { opacity: 0 }), rect("win:bg", 1420, 640, 0, 0, { parent: "win", radius: 26, fill: PANEL, stroke: HAIR, strokeWidth: 2 }));
  ["#FF5F57", "#FEBC2E", "#28C840"].forEach((c, i) => S.nodes.push(rect("win:d" + i, 18, 18, -670 + i * 30, -278, { parent: "win", radius: 999, fill: c, opacity: 0.85 })));
  const line = (key, text, y, color, o = {}) => S.nodes.push(txt(key, text, -640, y, { parent: "win", font: "mono", weight: "regular", size: 48, color, anchorX: 0, ...o }));
  line("prompt", "$", -150, DIM); line("cmd", CMD, -150, TEXT, { x: -580, reveal: 0 });
  const rows = [["encoder", "h264_videotoolbox", -20], ["frames", "1080 of 1080", 70], ["time", "34 s", 160]];
  rows.forEach(([label, value, y], i) => {
    line("r" + i + "a", label, y, DIM, { opacity: 0 });
    line("r" + i + "b", value, y, i === 2 ? BLUE : TEXT, { x: -330, opacity: 0 });
  });
  line("done", "vid2-intro.mp4", 250, DIM, { opacity: 0 });
  S.k("win", "opacity", 0.6, 0); S.k("win", "opacity", 1.4, 1, "out"); S.k("win", "y", 0.6, 650); S.k("win", "y", 1.8, 610, "out");
  drift(S, "win", 0.6, dur, 0.985, 1.03);
  S.k("prompt", "opacity", 1.7, 0); S.k("prompt", "opacity", 2.0, 1, "out");
  typed(S, "cmd", 2.0, 30, CMD.length);
  const t0 = 2.0 + CMD.length / 30 + 0.4;
  rows.forEach((_, i) => { for (const s of ["a", "b"]) { S.k("r" + i + s, "opacity", t0 + i * 0.45, 0); S.k("r" + i + s, "opacity", t0 + i * 0.45 + 0.45, 1, "out"); } });
  S.k("done", "opacity", t0 + 1.6, 0); S.k("done", "opacity", t0 + 2.0, 1, "out");
  leave(S, "h", dur - 0.8); leave(S, "win", dur - 0.8);
  return S.layer();
}

/** 4 — four verbs, one lit at a time; a single grey line explains the lit one. */
function verbs(dur) {
  const S = stage();
  const items = [["Capture.", "Record your real app, with the cursor and every click."], ["Generate.", "Images and video clips through ima2-gen."],
    ["Cut to the beat.", "Cuts land on bars and beats, sound follows."], ["Verify.", "Contact sheets, seams, loudness and freezes."]];
  items.forEach(([word, cap], i) => {
    S.nodes.push(head("v" + i, word, 250 + i * 175, { size: 150, letterSpacing: -4.5, color: FAINT }), sub("c" + i, cap, 960, { size: 46 }));
    arrive(S, "v" + i, 0.05 + i * 0.1, 250 + i * 175, 0.9);
    const on = 0.9 + i * 1.15, off = on + 1.15;
    S.k("v" + i, "color", 0, FAINT); S.k("v" + i, "color", on, FAINT); S.k("v" + i, "color", on + 0.5, TEXT, "out");
    if (i < 3) S.k("v" + i, "color", off, TEXT), S.k("v" + i, "color", off + 0.5, FAINT, "in");
    S.k("c" + i, "opacity", on, 0); S.k("c" + i, "opacity", on + 0.5, 1, "out"); S.k("c" + i, "y", on, 990); S.k("c" + i, "y", on + 0.6, 960, "out");
    if (i < 3) { S.k("c" + i, "opacity", off - 0.05, 1); S.k("c" + i, "opacity", off + 0.3, 0, "in"); }
  });
  for (let i = 0; i < 4; i++) leave(S, "v" + i, dur - 0.7, 0.6);
  leave(S, "c3", dur - 0.7, 0.6);
  return S.layer();
}

/** 5 — one number, rolled: the same film, rendered in half the time. */
function speed(dur) {
  const S = stage(), vals = [70, 67, 63, 59, 55, 51, 47, 43, 40, 37, 35, 34];
  S.nodes.push(sub("top", "The same 26-second film.", 210, { size: 56 }), txt("unit", "seconds", 960, 810, { size: 64, weight: "regular", color: DIM, letterSpacing: -1, opacity: 0 }),
    sub("note", "Hardware encoding, tested on your Mac before it runs.", 940, { size: 46 }));
  arrive(S, "top", 0, 210, 0.7); arrive(S, "unit", 0, 810, 0.7);
  let t = 0.3;
  vals.forEach((v, i) => {
    const key = "n" + v, last = i === vals.length - 1, gap = 0.12 + i * 0.03;
    S.nodes.push(txt(key, String(v), 960, 520, { size: 470, weight: "semibold", letterSpacing: -14, color: lerpHex(DIM, TEXT, i / (vals.length - 1)), opacity: 0 }));
    S.k(key, "opacity", t - 0.034, 0, "linear"); S.k(key, "opacity", t, 1, "linear");
    if (!last) { S.k(key, "opacity", t + gap - 0.034, 1, "linear"); S.k(key, "opacity", t + gap, 0, "linear"); }
    else { leave(S, key, dur - 0.8); S.k(key, "scale", t, 1.04); S.k(key, "scale", t + 1.6, 1, "out"); }
    t += gap;
  });
  arrive(S, "note", t + 0.5, 940, 1.0);
  leave(S, "top", dur - 0.8); leave(S, "unit", dur - 0.8); leave(S, "note", dur - 0.8);
  return S.layer();
}

/** 6 — who it is for. */
function agents(dur) {
  const S = stage();
  S.nodes.push(head("a", "Made for coding agents.", 480, { size: 138, letterSpacing: -4 }), sub("b", "Every command returns JSON.", 660), sub("c", "Every error says how to fix it.", 730));
  arrive(S, "a", 0.3, 480, 1.3); arrive(S, "b", 1.5, 660, 1.0); arrive(S, "c", 2.0, 730, 1.0);
  for (const key of ["a", "b", "c"]) leave(S, key, dur - 0.8);
  return S.layer();
}

/** 7 — install, then black. */
function outro(dur) {
  const S = stage(), CMD = "npm install -g vid2-gen";
  S.nodes.push(head("name", "vid2-gen", 400, { size: 200, letterSpacing: -7 }),
    rect("pill", 900, 118, 960, 610, { radius: 59, fill: PANEL, opacity: 0 }),
    txt("cmd", CMD, 545, 610, { font: "mono", weight: "regular", size: 46, color: TEXT, anchorX: 0, reveal: 0 }),
    sub("url", "github.com/lidge-ai/vid2-gen", 790, { size: 42 }), sub("credit", "This film was made with vid2.", 960, { size: 30, color: FAINT }),
    rect("black", 1920, 1080, 960, 540, { fill: BLACK, opacity: 0, z: 50 }));
  arrive(S, "name", 0.2, 400, 1.3);
  S.k("pill", "opacity", 1.0, 0); S.k("pill", "opacity", 1.7, 1, "out"); typed(S, "cmd", 1.8, 18, CMD.length);
  arrive(S, "url", 3.2, 790, 1.0); arrive(S, "credit", 3.6, 960, 1.0);
  S.k("black", "opacity", dur - 1.3, 0); S.k("black", "opacity", dur - 0.05, 1, "inout");
  return S.layer();
}

const plan = [["premise", 4.5, premise], ["brand", 4.5, brand], ["terminal", 6, terminal], ["verbs", 6, verbs], ["speed", 6, speed], ["agents", 4.5, agents], ["outro", 4.5, outro]];
const scenes = plan.map(([id, dur, build]) => ({ id, duration: f(dur), background: BLACK, layers: [build(dur)] }));
const timeline = {
  version: 1, output: { width: 1920, height: 1080, fps: 30, background: BLACK }, sources: { music: { type: "audio", path: "media/music.wav" } }, scenes,
  audio: { music: { source: "music", volume: 0.9, fadeOut: "3s" }, autoCues: false },
};
writeFileSync(new URL("./timeline.json", import.meta.url), JSON.stringify(timeline, null, 1) + "\n");
console.log("timeline.json:", scenes.length, "scenes,", plan.reduce((s, p) => s + p[1], 0), "s");
