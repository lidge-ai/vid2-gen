// Builds timeline.json for "vid2-gen in 38 seconds": a launch film made only from vid2 stage nodes and a music2 cue (128 BPM, 1 bar = 1.875 s).
// The drop of music/vid2-intro.song.json lands on bar 7 (11.25 s) with the brand reveal. Usage: node build-timeline.mjs
import { writeFileSync } from "node:fs";

const BAR = 60 / 128 * 4, BEAT = BAR / 4, FADE = 0.4;
const INK = "#0B0D12", PANEL = "#12151D", LINE = "#242A3A", TEXT = "#F5F5F2", DIM = "#8B93A7", BLUE = "#3355FF", SKY = "#6F8BFF", MINT = "#5CF2B0", AMBER = "#FFB35C", ROSE = "#FF6F91";
const f = (v) => Math.max(0, v).toFixed(3) + "s";
const POP = { stiffness: 300, damping: 15 }, SETTLE = { stiffness: 190, damping: 21 };
const SH = { color: "#00000099", blur: 28, x: 0, y: 14 };
const rect = (key, width, height, x, y, o = {}) => ({ kind: "rect", key, width, height, x, y, ...o });
const txt = (key, text, x, y, o = {}) => ({ kind: "text", key, text, x, y, ...o });
const grp = (key, x, y, o = {}) => ({ kind: "group", key, x, y, ...o });

/** Key collector: helpers add motion per node and property; layer() turns the maps into sorted tracks. */
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

/** Soft coloured light that drifts behind everything: a group of stacked, shrinking circles fakes a radial falloff. */
function glow(S, key, color, x, y, size, dx, dy, dur) {
  const rgb = color.slice(0, 7), alpha = parseInt(color.slice(7, 9), 16);
  S.nodes.push(grp(key, x, y, { z: -5 }));
  for (let i = 0; i < 7; i++) {
    const a = Math.round(alpha * 0.22).toString(16).padStart(2, "0");
    S.nodes.push(rect(key + ":" + i, size * (1 - i * 0.13), size * (1 - i * 0.13), 0, 0, { parent: key, radius: 999, fill: rgb + a, blur: 32 }));
  }
  S.k(key, "x", 0, x); S.k(key, "x", dur, x + dx, "linear"); S.k(key, "y", 0, y); S.k(key, "y", dur, y + dy, "linear");
}
function pop(S, key, t, from = 0.01) { S.k(key, "scale", t, from); S.k(key, "scale", t + 0.02, 1, "spring", POP); S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.12, 1, "out"); S.ev(t, "click"); }
function typed(S, key, t0, cps, len, every = 3) {
  S.k(key, "reveal", t0, 0, "linear"); S.k(key, "reveal", t0 + len / cps, len, "linear");
  for (let i = 0; i < len; i += every) S.ev(t0 + i / cps, "tick");
}
function fadeOut(S, keys, t, d = 0.35) { for (const key of keys) { S.k(key, "opacity", t, 1); S.k(key, "opacity", t + d, 0, "in"); S.k(key, "blur", t, 0); S.k(key, "blur", t + d, 14, "in"); } }
function terminalFrame(S, key, w, h, x, y, t) {
  S.nodes.push(grp(key, x, y), rect(key + ":bg", w, h, 0, 0, { parent: key, radius: 28, fill: PANEL, stroke: LINE, strokeWidth: 2, shadow: SH }));
  [ROSE, AMBER, MINT].forEach((c, i) => S.nodes.push(rect(key + ":dot" + i, 20, 20, -w / 2 + 44 + i * 34, -h / 2 + 40, { parent: key, radius: 999, fill: c })));
  pop(S, key, t, 0.9);
}

/** 1 — a command types itself and the render bar fills. */
function coldOpen(dur) {
  const S = stage(), CMD = "vid2 render timeline.json --hw-accel required";
  glow(S, "g1", "#3355FF44", 600, 400, 900, 200, 60, dur);
  terminalFrame(S, "term", 1400, 440, 960, 540, 0.05);
  S.nodes.push(txt("prompt", "$", 300, 470, { parent: undefined, font: "mono", size: 44, color: MINT, anchorX: 0, opacity: 0 }),
    txt("cmd", CMD, 356, 470, { font: "mono", size: 44, color: TEXT, anchorX: 0, reveal: 0, weight: "regular" }),
    txt("out1", "compile   4 scenes, 759 frames", 300, 570, { font: "mono", size: 34, color: DIM, anchorX: 0, opacity: 0, weight: "regular" }),
    txt("out2", "encoder   h264_videotoolbox  (probed)", 300, 626, { font: "mono", size: 34, color: SKY, anchorX: 0, opacity: 0, weight: "regular" }),
    rect("track", 1320, 14, 300, 700, { anchorX: 0, radius: 7, fill: LINE, opacity: 0 }),
    rect("fill", 1, 14, 300, 700, { anchorX: 0, radius: 7, fill: BLUE, opacity: 0 }));
  S.k("prompt", "opacity", 0.4, 1); S.ev(0.4, "tick");
  typed(S, "cmd", 0.55, 26, CMD.length);
  for (const [key, t] of [["out1", 2.45], ["out2", 2.75]]) { S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.15, 1, "out"); S.ev(t, "token"); }
  S.k("track", "opacity", 3.0, 1); S.k("fill", "opacity", 3.0, 1);
  S.k("fill", "width", 3.0, 1); S.k("fill", "width", dur - 0.05, 1320, "in"); S.ev(3.0, "grow");
  return S.layer();
}

/** 2 — the pitch, four bars ending on the drop. */
function pitch(dur) {
  const S = stage();
  glow(S, "g1", "#3355FF33", 1500, 300, 800, -300, 200, dur); glow(S, "g2", "#FF6F9122", 400, 800, 700, 200, -100, dur);
  S.nodes.push(txt("a", "Describe the video.", 960, 400, { size: 150, weight: "bold", color: TEXT, reveal: 0 }),
    txt("b", "Render it.", 960, 590, { size: 150, weight: "black", color: SKY, scale: 0.01, opacity: 0 }),
    txt("sub", "timeline.json  →  ffmpeg  →  film", 960, 760, { font: "mono", weight: "regular", size: 40, color: DIM, opacity: 0 }));
  typed(S, "a", 0.1, 30, "Describe the video.".length, 2);
  S.k("a", "y", 0, 400); S.k("a", "y", 3.75, 400); S.k("a", "y", 4.2, 300, "inout"); S.k("a", "opacity", 3.75, 1); S.k("a", "opacity", 4.2, 0.35, "inout");
  pop(S, "b", BAR * 2); S.k("b", "y", 0, 590); S.k("b", "y", BAR * 2, 590);
  S.k("sub", "opacity", BAR * 2 + 0.6, 0); S.k("sub", "opacity", BAR * 2 + 0.9, 1, "out"); S.ev(BAR * 2 + 0.6, "token");
  S.k("sub", "y", BAR * 2 + 0.6, 790); S.k("sub", "y", BAR * 2 + 1.0, 760, "spring", SETTLE);
  const out = dur - FADE - 0.7;
  fadeOut(S, ["a", "b", "sub"], out, 0.6);
  S.k("a", "opacity", out, 0.35); S.k("a", "opacity", out + 0.6, 0, "in");
  return S.layer();
}

/** 3 — the drop: brand reveal. */
function brand(dur) {
  const S = stage();
  glow(S, "g1", "#3355FF88", 960, 500, 1300, 0, 0, dur);
  S.k("g1", "scale", 0, 0.4); S.k("g1", "scale", 0.5, 1.15, "out"); S.k("g1", "scale", dur, 1, "linear");
  S.nodes.push(txt("name", "vid2-gen", 960, 470, { size: 300, weight: "black", color: TEXT, scale: 0.01, opacity: 0 }),
    txt("tag", "The video CLI for coding agents.", 960, 690, { size: 62, weight: "semibold", color: TEXT, opacity: 0 }),
    txt("chips", "capture  ·  generate  ·  cut to the beat  ·  QA", 960, 800, { font: "mono", weight: "regular", size: 36, color: SKY, opacity: 0 }));
  pop(S, "name", 0, 0.5); S.k("name", "rotation", 0, -3); S.k("name", "rotation", 0.5, 0, "spring", SETTLE);
  for (const [key, t, y] of [["tag", BEAT * 2, 690], ["chips", BEAT * 4, 800]]) {
    S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.2, 1, "out"); S.k(key, "y", t, y + 40); S.k(key, "y", t + 0.35, y, "spring", SETTLE); S.ev(t, "token");
  }
  return S.layer();
}

/** 4 — four capabilities, one per two beats. */
function cards(dur) {
  const S = stage();
  glow(S, "g1", "#3355FF30", 300, 900, 800, 300, -300, dur);
  S.nodes.push(txt("head", "Everything in one timeline file", 960, 100, { font: "mono", weight: "regular", size: 38, color: DIM, opacity: 0 }));
  S.k("head", "opacity", 0.05, 0); S.k("head", "opacity", 0.35, 1, "out");
  const items = [["Capture", "your real app, with cursor and clicks", SKY], ["Generate", "images and Grok clips through ima2-gen", MINT],
    ["Cut to the beat", "beat grids, bar units, matched sound", AMBER], ["Verify", "QA sheets, seams, loudness, freezes", ROSE]];
  items.forEach(([title, cap, color], i) => {
    const key = "c" + i, x = 500 + (i % 2) * 920, y = 340 + Math.floor(i / 2) * 340, t = 0.25 + i * BEAT * 2;
    S.nodes.push(grp(key, x, y), rect(key + ":bg", 840, 290, 0, 0, { parent: key, radius: 36, fill: PANEL, stroke: LINE, strokeWidth: 2, shadow: SH }),
      rect(key + ":bar", 12, 150, -370, 0, { parent: key, radius: 6, fill: color, glow: { color: color + "99", blur: 24 } }),
      txt(key + ":t", title, -330, -40, { parent: key, size: 84, weight: "black", color: TEXT, anchorX: 0 }),
      txt(key + ":d", cap, -330, 62, { parent: key, font: "mono", weight: "regular", size: 31, color: DIM, anchorX: 0 }));
    pop(S, key, t, 0.6); S.k(key, "rotation", t, i % 2 ? 2 : -2); S.k(key, "rotation", t + 0.4, 0, "spring", SETTLE);
  });
  return S.layer();
}

/** 5 — the file itself, typed line by line. */
function code(dur) {
  const S = stage();
  glow(S, "g1", "#6F8BFF30", 1500, 250, 900, -200, 300, dur);
  terminalFrame(S, "term", 1380, 700, 960, 520, 0.05);
  const lines = [["{ \"version\": 1, \"beat\": { \"bpm\": 128 },", DIM], ["  \"scenes\": [{", DIM], ["    \"duration\": \"4bar\",", TEXT], ["    \"layers\": [", DIM],
    ["      { \"type\": \"stage\", \"nodes\": [ ... ] },", SKY], ["      { \"type\": \"text\", \"text\": \"vid2\", \"animation\": \"slam\" }", MINT],
    ["    ],", DIM], ["    \"transition\": { \"type\": \"fade\" }", TEXT], ["  }],", DIM], ["  \"audio\": { \"autoCues\": true } }", AMBER]];
  lines.forEach(([text, color], i) => {
    const key = "l" + i, t = 0.45 + i * 0.32;
    S.nodes.push(txt(key, text, 305, 330 + i * 52, { font: "mono", weight: "regular", size: 36, color, anchorX: 0, reveal: 0 }));
    typed(S, key, t, 70, text.length, 6);
  });
  S.nodes.push(rect("hl", 1280, 50, 305, 330 + 9 * 52, { anchorX: 0, radius: 10, fill: "#FFB35C22", opacity: 0, stroke: AMBER, strokeWidth: 2 }),
    txt("cap", "one file  →  one render", 960, 930, { size: 56, weight: "bold", color: TEXT, opacity: 0 }));
  S.k("hl", "opacity", 3.6, 0); S.k("hl", "opacity", 3.8, 1, "out"); S.ev(3.8, "state");
  S.k("cap", "opacity", 4.1, 0); S.k("cap", "opacity", 4.4, 1, "out"); S.k("cap", "y", 4.1, 970); S.k("cap", "y", 4.5, 930, "spring", SETTLE); S.ev(4.1, "token");
  return S.layer();
}

/** 6 — measured hardware speed-up. */
function speed(dur) {
  const S = stage();
  glow(S, "g1", "#5CF2B028", 1400, 800, 900, -300, -200, dur);
  S.nodes.push(txt("head", "Hardware encoding, probed first", 960, 130, { size: 84, weight: "bold", color: TEXT, opacity: 0 }),
    txt("sub", "VideoToolbox  ·  NVENC  ·  QSV  ·  AMF  ·  VAAPI", 960, 225, { font: "mono", weight: "regular", size: 34, color: DIM, opacity: 0 }),
    txt("l1", "software  x264 slow", 200, 440, { font: "mono", weight: "regular", size: 38, color: DIM, anchorX: 0, opacity: 0 }),
    rect("b1", 1, 92, 200, 530, { anchorX: 0, radius: 22, fill: "#5B6379", opacity: 0 }),
    txt("v1", "70 s", 1300, 530, { size: 84, weight: "black", color: DIM, anchorX: 0, opacity: 0 }),
    txt("l2", "--hw-accel required", 200, 690, { font: "mono", weight: "regular", size: 38, color: SKY, anchorX: 0, opacity: 0 }),
    rect("b2", 1, 92, 200, 780, { anchorX: 0, radius: 22, fill: BLUE, opacity: 0, glow: { color: "#3355FFAA", blur: 26 } }),
    txt("v2", "34 s", 760, 780, { size: 84, weight: "black", color: TEXT, anchorX: 0, opacity: 0 }),
    txt("x", "2× faster", 1560, 940, { size: 110, weight: "black", color: MINT, scale: 0.01, opacity: 0 }));
  S.k("head", "opacity", 0.05, 0); S.k("head", "opacity", 0.3, 1, "out"); S.k("sub", "opacity", 0.3, 0); S.k("sub", "opacity", 0.6, 1, "out");
  for (const [l, b, v, w, t] of [["l1", "b1", "v1", 1050, 0.6], ["l2", "b2", "v2", 510, 0.6 + BEAT * 2]]) {
    S.k(l, "opacity", t, 0); S.k(l, "opacity", t + 0.2, 1, "out"); S.k(b, "opacity", t, 1); S.k(b, "width", t, 1);
    S.k(b, "width", t + 1.3, w, "out"); S.ev(t + 0.05, "grow");
    S.k(v, "opacity", t + 1.2, 0); S.k(v, "opacity", t + 1.4, 1, "out"); S.k(v, "x", t + 1.2, 200 + w + 60); S.k(v, "x", t + 1.2 + 0.001, 200 + w + 60);
  }
  S.k("v1", "x", 0, 1300); S.k("v2", "x", 0, 760);
  S.nodes.find((n) => n.key === "v1").x = 200 + 1050 + 60; S.nodes.find((n) => n.key === "v2").x = 200 + 510 + 60;
  S.k("v1", "x", 0, 1310); S.k("v2", "x", 0, 770);
  pop(S, "x", 0.6 + BEAT * 2 + 1.5); S.k("x", "rotation", 0.6 + BEAT * 2 + 1.5, -4); S.k("x", "rotation", 0.6 + BEAT * 2 + 1.9, 0, "spring", SETTLE);
  return S.layer();
}

/** 7 — install and sign-off. */
function outro(dur) {
  const S = stage(), CMD = "npm install -g vid2-gen";
  glow(S, "g1", "#3355FF66", 960, 480, 1400, 0, 0, dur);
  S.nodes.push(txt("name", "vid2-gen", 960, 300, { size: 220, weight: "black", color: TEXT, scale: 0.01, opacity: 0 }),
    rect("pill", 1100, 130, 960, 560, { radius: 65, fill: PANEL, stroke: SKY, strokeWidth: 3, opacity: 0, shadow: SH }),
    txt("cmd", CMD, 470, 560, { font: "mono", weight: "regular", size: 56, color: TEXT, anchorX: 0, reveal: 0 }),
    txt("url", "github.com/lidge-ai/vid2-gen", 960, 760, { font: "mono", weight: "regular", size: 42, color: SKY, opacity: 0 }),
    txt("made", "this film: vid2 stage nodes + a music2 cue", 960, 850, { font: "mono", weight: "regular", size: 30, color: DIM, opacity: 0 }),
    rect("black", 1920, 1080, 960, 540, { fill: INK, opacity: 0, z: 50 }));
  pop(S, "name", 0, 0.6);
  S.k("pill", "opacity", 0.5, 0); S.k("pill", "opacity", 0.8, 1, "out"); typed(S, "cmd", 0.9, 20, CMD.length, 3);
  for (const [key, t] of [["url", 2.6], ["made", 3.1]]) { S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.25, 1, "out"); S.ev(t, "token"); }
  S.k("black", "opacity", dur - 1.2, 0); S.k("black", "opacity", dur - 0.05, 1, "inout");
  return S.layer();
}

const plan = [["cold", 2, coldOpen], ["pitch", 4, pitch], ["brand", 2, brand], ["cards", 3, cards], ["code", 3, code], ["speed", 3, speed], ["outro", 3, outro]];
const scenes = plan.map(([id, bars, build], i) => {
  const last = i === plan.length - 1, dur = bars * BAR + (last ? 0 : FADE);
  return { id, duration: f(dur), background: INK, layers: [build(dur)], ...(last ? {} : { transition: { type: "fade", duration: f(FADE) } }) };
});
const timeline = {
  version: 1, output: { width: 1920, height: 1080, fps: 30, background: INK }, beat: { bpm: 128 },
  sources: { music: { type: "audio", path: "media/music.wav" } }, scenes,
  effects: [{ type: "flash", at: f(6 * BAR), strength: 0.55, decay: 10 }, { type: "grain", strength: 3 }, { type: "vignette", strength: 0.3 }],
  audio: { music: { source: "music", volume: 0.85, fadeOut: "2.5s" }, autoCues: true },
};
writeFileSync(new URL("./timeline.json", import.meta.url), JSON.stringify(timeline, null, 1) + "\n");
console.log("timeline.json:", scenes.length, "scenes,", (plan.reduce((s, p) => s + p[1], 0) * BAR).toFixed(2), "s");
