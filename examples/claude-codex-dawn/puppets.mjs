// Paper puppets: the real Claude and Codex marks with googly eyes, blush, paper arms and feet, plus a paper person with a lantern.
import { BLUE, BLUE_DK, BLUSH, CLAY, CLAY_DK, CREAM, GOLD, INK, PEACH, POP, SAGE, SH, SH_SOFT, grp, img, rect } from "./lib.mjs";

/** Tween from the property's current value (remembered per stage) to a new one. */
export function to(S, node, prop, t, value, dur = 0.25, ease = "inout", def = 0) {
  S.cur ??= new Map();
  const id = node + "|" + prop, from = S.cur.has(id) ? S.cur.get(id) : def;
  S.k(node, prop, t, from); S.k(node, prop, t + dur, value, ease); S.cur.set(id, value);
}

function googly(S, p, y, gap, w, h, parent) {
  S.nodes.push(grp(p + ":eyes", 0, y, { parent, z: 4 }));
  for (const s of [-1, 1]) S.nodes.push(rect(p + ":white" + s, w, h, s * gap, 0, { parent: p + ":eyes", radius: 999, fill: CREAM, stroke: INK, strokeWidth: 3, shadow: SH_SOFT }));
  S.nodes.push(grp(p + ":pups", 0, 0, { parent: p + ":eyes" }));
  for (const s of [-1, 1]) {
    S.nodes.push(rect(p + ":pup" + s, w * 0.48, h * 0.5, s * gap, h * 0.08, { parent: p + ":pups", radius: 999, fill: INK }),
      rect(p + ":hi" + s, w * 0.16, w * 0.16, s * gap - w * 0.1, -h * 0.04, { parent: p + ":pups", radius: 999, fill: CREAM }));
  }
}
function smile(S, p, y, w, color, parent) {
  S.nodes.push(grp(p + ":mouth", 0, y, { parent, z: 4, clip: { x: -w / 2 - 4, y: 2, width: w + 8, height: w * 0.62 } }),
    rect(p + ":smile", w, w * 0.86, 0, 0, { parent: p + ":mouth", radius: 999, fill: "#00000000", stroke: color, strokeWidth: 6 }));
}
function limbs(S, p, fill, dark, shoulder, sy, foot, fy) {
  for (const s of [-1, 1]) {
    S.nodes.push(rect(p + ":arm" + s, 24, 90, s * shoulder, sy, { parent: p + ":rig", radius: 12, fill, anchorY: 0.1, rotation: s * -30, z: -2, shadow: SH_SOFT }),
      rect(p + ":foot" + s, 62, 28, s * foot, fy, { parent: p + ":rig", radius: 999, fill: dark, z: -3, shadow: SH_SOFT }));
  }
}
function base(S, p, x, y, o) {
  S.nodes.push(rect(p + ":ground", 210, 26, x, y + 140, { radius: 999, fill: "#000000", opacity: 0.2, blur: 3, z: -5 }),
    grp(p, x, y, { scale: o.scale ?? 1, opacity: o.opacity ?? 1, z: o.z ?? 0 }), grp(p + ":rig", 0, 0, { parent: p }));
}

export function claude(S, x, y, o = {}) {
  const p = "cl";
  base(S, p, x, y, o);
  limbs(S, p, CLAY, CLAY_DK, 90, 22, 38, 124);
  S.nodes.push(img(p + ":shadow", "claudeShadow", 272, 273, 8, 11, { parent: p + ":rig", z: -1 }), img(p + ":logo", "claude", 272, 273, 0, 0, { parent: p + ":rig" }));
  googly(S, p, -8, 29, 44, 52, p + ":rig");
  for (const s of [-1, 1]) S.nodes.push(rect(p + ":cheek" + s, 32, 17, s * 64, 30, { parent: p + ":rig", radius: 999, fill: BLUSH, opacity: 0.9, z: 3 }));
  smile(S, p, 36, 42, INK, p + ":rig");
  return p;
}

export function codex(S, x, y, o = {}) {
  const p = "cx";
  base(S, p, x, y, o);
  limbs(S, p, BLUE, BLUE_DK, 106, 24, 40, 122);
  S.nodes.push(img(p + ":shadow", "codexShadow", 260, 260, 8, 11, { parent: p + ":rig", z: -1 }), img(p + ":logo", "codex", 260, 260, 0, 0, { parent: p + ":rig" }));
  googly(S, p, -64, 30, 42, 50, p + ":rig");
  for (const s of [-1, 1]) S.nodes.push(rect(p + ":cheek" + s, 30, 16, s * 80, -26, { parent: p + ":rig", radius: 999, fill: BLUSH, opacity: 0.85, z: 3 }));
  return p;
}

export function human(S, x, y, o = {}) {
  const p = "hu";
  base(S, p, x, y, o);
  S.nodes.push(rect(p + ":body", 160, 210, 0, 20, { parent: p + ":rig", radius: 64, fill: SAGE, shadow: SH }),
    rect(p + ":head", 128, 128, 0, -148, { parent: p + ":rig", radius: 999, fill: PEACH, shadow: SH }),
    grp(p + ":hairclip", 0, 0, { parent: p + ":rig", clip: { x: -70, y: -220, width: 140, height: 52 }, z: 2 }),
    rect(p + ":hair", 134, 134, 0, -150, { parent: p + ":hairclip", radius: 999, fill: "#3A2A22" }));
  for (const s of [-1, 1]) S.nodes.push(rect(p + ":foot" + s, 56, 28, s * 36, 130, { parent: p + ":rig", radius: 999, fill: "#4A3A30", z: -3 }));
  S.nodes.push(rect(p + ":arm-1", 30, 110, -86, -50, { parent: p + ":rig", radius: 15, fill: "#6A957D", anchorY: 0.08, rotation: 22, z: -2 }),
    grp(p + ":armR", 86, -56, { parent: p + ":rig", rotation: -22, z: 3 }), rect(p + ":armRr", 30, 110, 0, 50, { parent: p + ":armR", radius: 15, fill: "#6A957D", shadow: SH_SOFT }),
    grp(p + ":lamp", 0, 132, { parent: p + ":armR", rotation: 22 }), rect(p + ":lampGlow", 120, 120, 0, 8, { parent: p + ":lamp", radius: 999, fill: "#FFD98A", opacity: 0.45, blur: 16 }),
    rect(p + ":lampH", 26, 26, 0, -30, { parent: p + ":lamp", radius: 999, fill: "#00000000", stroke: INK, strokeWidth: 4 }),
    rect(p + ":lampB", 48, 60, 0, 8, { parent: p + ":lamp", radius: 12, fill: GOLD, stroke: INK, strokeWidth: 3, shadow: SH_SOFT }));
  googly(S, p, -152, 24, 34, 40, p + ":rig");
  for (const s of [-1, 1]) S.nodes.push(rect(p + ":cheek" + s, 24, 13, s * 40, -122, { parent: p + ":rig", radius: 999, fill: BLUSH, opacity: 0.9, z: 3 }));
  smile(S, p, -116, 30, INK, p + ":rig");
  return p;
}

/** Stop-motion boil on the rig: a slightly different pose every 1/8 s. */
export function boil(S, p, from, to, amp = 1) {
  let i = 0;
  for (let t = from; t < to; t += 0.125, i++) S.k(p + ":rig", "rotation", t, amp * [0.9, -0.6, 0.4, -1, 0.7, -0.3][i % 6], "hold");
}
export function blink(S, p, t) { S.k(p + ":eyes", "scaleY", t, 1); S.k(p + ":eyes", "scaleY", t + 0.06, 0.08, "in"); S.k(p + ":eyes", "scaleY", t + 0.16, 1, "out"); }
export function look(S, p, t, dx, dy = 0, dur = 0.16) { to(S, p + ":pups", "x", t, dx, dur, "out"); to(S, p + ":pups", "y", t, dy, dur, "out"); }
export function lean(S, p, t, deg, dur = 0.35) { to(S, p, "rotation", t, deg, dur, "inout"); }
export function arm(S, p, side, t, deg, dur = 0.22, ease = "out") { to(S, p + ":arm" + side, "rotation", t, deg, dur, ease, side * -30); }
export function wave(S, p, side, t, times = 2) {
  arm(S, p, side, t, side * -150, 0.18);
  for (let i = 0; i < times; i++) { arm(S, p, side, t + 0.2 + i * 0.36, side * -118, 0.18, "inout"); arm(S, p, side, t + 0.38 + i * 0.36, side * -150, 0.18, "inout"); }
  arm(S, p, side, t + 0.3 + times * 0.36, side * -30, 0.35, "inout");
}
export function pop(S, p, t) { S.k(p, "scale", t, 0.01); S.k(p, "scale", t + 0.02, 1, "spring", POP); S.k(p + ":ground", "opacity", t, 0); S.k(p + ":ground", "opacity", t + 0.2, 0.2); }

export function hops(S, p, x0, x1, y, t0, n, dur = 0.34, h = 80) {
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dur, xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n;
    S.k(p, "x", t, xa); S.k(p, "x", t + dur, xb, "linear"); S.k(p + ":ground", "x", t, xa); S.k(p + ":ground", "x", t + dur, xb, "linear");
    S.k(p, "y", t, y); S.k(p, "y", t + dur * 0.5, y - h, "out"); S.k(p, "y", t + dur, y, "in");
    S.k(p + ":ground", "scaleX", t, 1); S.k(p + ":ground", "scaleX", t + dur * 0.5, 0.6, "out"); S.k(p + ":ground", "scaleX", t + dur, 1, "in");
    S.k(p, "scaleY", t + dur, 0.9, "in"); S.k(p, "scaleX", t + dur, 1.07, "in");
    S.k(p, "scaleY", t + dur + 0.02, 1, "spring", POP); S.k(p, "scaleX", t + dur + 0.02, 1, "spring", POP);
  }
}
