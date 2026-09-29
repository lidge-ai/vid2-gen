// Shared paper-craft helpers for the Claude & Codex dawn film: key collector, world (sky, sun, stars, hills), puppets, bubbles, captions.
export const INK = "#2B2118", CREAM = "#FFF9EE", CLAY = "#D97757", CLAY_DK = "#B85A3A", BLUE = "#5B6CF2", BLUE_DK = "#3F4FD8";
export const GOLD = "#F2B84B", BLUSH = "#F49A8A", ROSE = "#E2645A", SAGE = "#7FA88C", PEACH = "#F3CBA5";
export const SH = { color: "#1E14104D", blur: 6, x: 4, y: 8 }, SH_SOFT = { color: "#1E141033", blur: 4, x: 2, y: 4 }, SH_UP = { color: "#0A081436", blur: 10, x: 0, y: -8 };
export const POP = { stiffness: 260, damping: 13 }, SETTLE = { stiffness: 200, damping: 20 };
export const f = (v) => Math.max(0, v).toFixed(3) + "s";
export const rect = (key, width, height, x, y, o = {}) => ({ kind: "rect", key, width, height, x, y, ...o });
export const txt = (key, text, x, y, o = {}) => ({ kind: "text", key, text, x, y, ...o });
export const grp = (key, x, y, o = {}) => ({ kind: "group", key, x, y, ...o });
export const img = (key, source, width, height, x, y, o = {}) => ({ kind: "image", key, source, width, height, x, y, ...o });

let seed = 77;
export const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** Collects keys per node/prop so helpers can add motion independently; one track per prop at the end. */
export function stage() {
  const nodes = [], keys = new Map(), events = [];
  const k = (node, prop, at, value, ease, spring) => {
    const id = node + "|" + prop;
    if (!keys.has(id)) keys.set(id, new Map());
    keys.get(id).set(Math.round(at * 1000), { at: f(at), value, ...(ease ? { ease } : {}), ...(spring ? { spring } : {}) });
  };
  const ev = (at, kind) => events.push({ at: f(at), kind });
  // vid2 sorts z globally without inheriting it, so nested nodes get their parent's z plus a small offset of their own.
  const flat = () => {
    const by = new Map(nodes.map((n) => [n.key, n])), eff = new Map();
    const zOf = (n) => { if (!eff.has(n.key)) eff.set(n.key, n.parent ? zOf(by.get(n.parent)) + (n.z ?? 0) * 0.01 : (n.z ?? 0)); return eff.get(n.key); };
    return nodes.map((n) => ({ ...n, z: +zOf(n).toFixed(4) }));
  };
  const layer = () => ({ type: "stage", nodes: flat(), events, tracks: [...keys].map(([id, m]) => {
    const [node, prop] = id.split("|");
    return { node, prop, keys: [...m.keys()].sort((a, b) => a - b).map((t) => m.get(t)) };
  }) });
  return { nodes, k, ev, layer };
}

// —— colour of the world at dawn progress d (0 night → 0.55 dusk → 1 morning)
const PAL = {
  sky: ["#151A3C", "#6A4C78", "#F4E2C4"], back: ["#252B56", "#7C5873", "#E8BD92"],
  mid: ["#1F254A", "#51416A", "#AABF9B"], front: ["#181D3D", "#3B3354", "#7E9E80"],
};
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mixHex = (a, b, t) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
export const tone = (name, d) => { const [n, m, day] = PAL[name]; return d < 0.55 ? mixHex(n, m, d / 0.55) : mixHex(m, day, (d - 0.55) / 0.45); };
const sunY = (d) => 1010 - 710 * d, starA = (d) => Math.max(0, Math.min(1, 1 - 1.7 * d));

export function world(S, d0, d1, dur, end = dur) {
  const layers = [["sky", 1920, 1080, 960, 540, 0, -20]];
  S.nodes.push(rect("sky", 1920, 1080, 960, 540, { fill: tone("sky", d0), z: -20 }));
  const dAt = (t) => d0 + (d1 - d0) * Math.min(1, t / end);
  // colours step every 0.3 s (hold) so the full frame is recomposited a few times a second instead of every frame
  const steps = (key, name) => { for (let t = 0; t <= dur; t += 0.3) S.k(key, "fill", t, tone(name, dAt(t)), "hold"); };
  steps("sky", "sky");
  for (let i = 0; i < 46; i++) {
    const key = "star" + i, s = 3 + rnd() * 5;
    S.nodes.push(rect(key, s, s, 30 + rnd() * 1860, 20 + rnd() * 560, { radius: 999, fill: CREAM, opacity: starA(d0), z: -19 }));
    const ph = rnd() * 1.4;
    for (let t = ph; t < dur; t += 1.4) { const d = d0 + (d1 - d0) * Math.min(1, t / end); S.k(key, "opacity", t, starA(d) * (0.45 + 0.55 * ((t / 1.4 | 0) % 2))); }
  }
  S.nodes.push(grp("sun", 960, sunY(d0), { z: -18 }), rect("sun:glow", 420, 420, 0, 0, { parent: "sun", radius: 999, fill: "#FFD89A", opacity: 0.35, blur: 24 }),
    rect("sun:disc", 300, 300, 0, 0, { parent: "sun", radius: 999, fill: "#F7B458", shadow: SH_SOFT }));
  S.k("sun", "y", 0, sunY(d0)); S.k("sun", "y", end, sunY(d1), "linear");
  const hills = [["back", "hb1", 1400, 520, 420, 930, -16], ["back", "hb2", 1300, 560, 1540, 900, -16], ["mid", "hm", 2300, 520, 1150, 1010, -14], ["front", "hf", 2800, 560, 960, 1100, -12]];
  for (const [name, key, w, h, x, y, z] of hills) {
    S.nodes.push(rect(key, w, h, x, y, { radius: h / 2, fill: tone(name, d0), shadow: SH_UP, z }));
    steps(key, name);
  }
  return layers;
}

// —— text measuring for bubbles and strips (KoPub Batang / Pretendard proportions)
export const est = (text, size) => [...text].reduce((w, c) => w + size * (/[\uac00-\ud7a3]/.test(c) ? 0.94 : c === " " ? 0.3 : /[.,!?'’·…]/.test(c) ? 0.34 : 0.56), 0);

export function caption(S, key, text, t, out, o = {}) {
  const { x = 960, y = 150, size = 50, rot = (rnd() - 0.5) * 2.4, font = "batang" } = o, w = est(text, size) + 90;
  S.nodes.push(grp(key, x, y + 24, { rotation: rot, opacity: 0, z: 20 }), rect(key + ":bg", w, size * 1.9, 0, 0, { parent: key, radius: 3, fill: CREAM, shadow: SH }),
    rect(key + ":tp", 110, 34, -w / 2 + 20, -size * 0.9, { parent: key, rotation: -16, fill: "#F2DE9FB8" }),
    txt(key + ":t", text, 0, 3, { parent: key, font, size, color: INK }));
  S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.25, 1); S.k(key, "y", t, y + 24); S.k(key, "y", t + 0.35, y, "spring", SETTLE);
  if (out !== undefined) { S.k(key, "opacity", out - 0.3, 1); S.k(key, "opacity", out, 0); S.k(key, "y", out - 0.3, y); S.k(key, "y", out, y - 16, "in"); }
}
export function bubble(S, key, text, x, y, tail, t, out) {
  const size = 44, w = est(text, size) + 80;
  S.nodes.push(grp(key, x, y, { scale: 0.01, z: 18 }), rect(key + ":tail", 34, 34, tail * Math.min(w / 2 - 60, 90), 50, { parent: key, rotation: 45, fill: CREAM, shadow: SH_SOFT }),
    rect(key + ":bg", w, 104, 0, 0, { parent: key, radius: 40, fill: CREAM, shadow: SH }), txt(key + ":t", text, 0, 3, { parent: key, font: "batang", size, color: INK }));
  S.k(key, "scale", t, 1, "spring", POP); S.k(key, "rotation", t, tail * -2.5);
  S.k(key, "opacity", out - 0.25, 1); S.k(key, "opacity", out, 0); S.k(key, "y", out - 0.25, y); S.k(key, "y", out, y - 24, "out");
  S.ev(t, "icon");
}
export function tag(S, key, text, x, y, rot, t, o = {}) {
  const size = o.size ?? 28, font = o.font ?? "dotum", w = est(text, size) + 50;
  S.nodes.push(grp(key, x, y + 30, { rotation: rot, opacity: 0, z: 16 }), rect(key + ":bg", w, size * 2, 0, 0, { parent: key, radius: 6, fill: CREAM, shadow: SH_SOFT }),
    txt(key + ":t", text, 0, 2, { parent: key, font, size, color: INK, weight: "regular" }));
  S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.2, 1); S.k(key, "y", t, y + 30); S.k(key, "y", t + 0.25, y, "spring", SETTLE);
}
