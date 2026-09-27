/** Kinetic framing (020): the pill behind the line, camera follow, and the expand plate. */
import { interpolate } from "../tracks.ts";
import { settleTime } from "../springs.ts";
import type { SpringParams } from "../types.ts";
import { NODE_BASE } from "./builder.ts";
import type { Key, SpecBuilder } from "./builder.ts";
import { iconSize } from "./layout.ts";
import { CAMERA_LEAD, GROUP, critical, moveKeys } from "./kinetic-types.ts";
import type { Actor, KineticConfig } from "./kinetic-types.ts";

/** Pill behind the line: sized to the entered tokens' extent at every entrance and state change, on the move spring. */
export function pillKeys(b: SpecBuilder, c: KineticConfig, all: Map<string, Actor>): void {
  if (!c.pill) return;
  const times = [...new Set([...[...all.values()].map((a) => a.appear), ...c.states.map((s) => s.at)])].sort((x, y) => x - y);
  const pad = c.pill;
  const keys = { x: [] as Key[], width: [] as Key[], y: [] as Key[], height: [] as Key[] };
  for (const t of times) {
    const boxes = [...all.values()].filter((a) => a.appear <= t + 1e-6 && (a.gone === undefined || a.gone > t + 1e-6))
      .map((a) => [...a.placements].reverse().find((pl) => pl.t <= t + 1e-6)!.p);
    if (!boxes.length) continue;
    const x0 = Math.min(...boxes.map((p) => p.x)); const x1 = Math.max(...boxes.map((p) => p.x + p.width));
    const y0 = Math.min(...boxes.map((p) => p.y - c.layout.size / 2)); const y1 = Math.max(...boxes.map((p) => p.y + c.layout.size / 2));
    const k = (v: number): Key => (keys.x.length ? { t, v, ease: "spring", spring: critical(c.move) } : { t: 0, v });
    keys.x.push(k(x0 - pad.padX)); keys.width.push(k(x1 - x0 + pad.padX * 2));
    keys.y.push(k((y0 + y1) / 2)); keys.height.push(k(y1 - y0 + pad.padY * 2));
  }
  if (!keys.x.length) return;
  b.add({ ...NODE_BASE, kind: "rect", key: "kin:pill", parent: GROUP, anchorX: 0, anchorY: 0.5, z: -1, x: keys.x[0]!.v as number,
    y: keys.y[0]!.v as number, width: keys.width[0]!.v as number, height: keys.height[0]!.v as number, radius: pad.radius,
    fill: pad.fill, stroke: pad.stroke, strokeWidth: pad.stroke ? pad.strokeWidth : 0, ...(pad.glow ? { glow: { color: pad.glow, blur: 18 } } : {}) });
  for (const prop of ["x", "width", "y", "height"] as const) b.key("kin:pill", prop, keys[prop]);
}

/** Camera follow: translate the token group so the newest token's right edge stays margin inside the viewport. */
export function cameraKeys(b: SpecBuilder, c: KineticConfig, all: Map<string, Actor>): Key[] {
  if (c.camera?.mode !== "follow") return [];
  const right = c.layout.x + c.camera.width / 2 - c.camera.margin;
  const keys: Key[] = [{ t: 0, v: 0 }];
  let current = 0;
  for (const a of [...all.values()].sort((x, y) => x.appear - y.appear)) {
    const p = a.placements[0]!.p;
    const shift = Math.min(0, right - (p.x + p.width));
    if (Math.abs(shift - current) < 0.5) continue;
    keys.push({ t: Math.max(0, a.appear - CAMERA_LEAD), v: shift, ease: "spring", spring: critical(c.move) });
    current = shift;
  }
  for (const s of c.states.slice(1)) if (current !== 0 && !s.tokens.some((t) => all.get(t.key)?.placements.some((pl) => pl.t === s.at && pl.p.x + pl.p.width > right))) {
    keys.push({ t: s.at, v: 0, ease: "spring", spring: critical(c.move) });
    current = 0;
  }
  b.key(GROUP, "x", keys);
  return keys;
}

/** Value of preset keys at time t (the same evaluation the renderer performs). */
export function valueAt(b: SpecBuilder, keys: Key[], t: number): number {
  if (!keys.length) return 0;
  const frames = keys.map((k) => ({ frame: b.frame(k.t), value: k.v, ease: k.ease, spring: k.spring }));
  return interpolate(frames, b.frame(t), { num: b.rate, den: 1 }) as number;
}

/**
 * Expand: a plate starts at the token's evaluated on-screen box (layout spring + camera at that frame) and springs to the target rect.
 * Image tokens become the plate; a built-in icon grows with the plate while the plate's fill fades in over it.
 */
export function expandKeys(b: SpecBuilder, c: KineticConfig, all: Map<string, Actor>, camera: Key[]): void {
  const size = iconSize(c.layout);
  for (const s of c.states) {
    if (!s.expand) continue;
    const entry = [...all.entries()].find(([, a]) => a.token.key === s.expand!.token && a.appear <= s.at && (a.gone === undefined || a.gone >= s.at));
    if (!entry) continue;
    const [id, actor] = entry;
    const at = { x: valueAt(b, moveKeys(actor, (p) => p.x + size / 2, c.move), s.at) + valueAt(b, camera, s.at),
      y: valueAt(b, moveKeys(actor, (p) => p.y, c.move), s.at) };
    const to = s.expand.to;
    const target = { x: to.x + to.width / 2, y: to.y + to.height / 2, width: to.width, height: to.height, radius: s.expand.radius };
    const source = c.icons(actor.token.icon ?? "");
    const plate = "kin:plate:" + id;
    const spring = critical(c.move);
    const common = { ...NODE_BASE, key: plate, x: at.x, y: at.y, width: size, height: size, radius: size * 0.22, z: 10, opacity: 0 };
    const image = "image" in source && !s.expand.fill;
    if (image) b.add({ ...common, kind: "image", image: source.image, fit: "cover" });
    else b.add({ ...common, kind: "rect", fill: s.expand.fill ?? c.color, strokeWidth: 0 });
    b.key(plate, "opacity", image ? [{ t: s.at, v: 0 }, { t: s.at, v: 1, ease: "hold" }] : [{ t: s.at, v: 0 }, { t: s.at + 0.25, v: 1, ease: "out" }]);
    for (const prop of ["x", "y", "width", "height", "radius"] as const) b.key(plate, prop, [{ t: s.at, v: target[prop], ease: "spring", spring }]);
    const node = "kin:" + id;
    if (image) b.key(node, "opacity", [{ t: s.at, v: 1 }, { t: s.at, v: 0, ease: "hold" }]);
    else growIcon(b, node, s.at, valueAt(b, camera, s.at), target, size, spring);
    // The riser is end-anchored: fire it when the plate has settled over the frame.
    b.event(s.at + settleTime(spring), "grow");
  }
}

/** A stroke icon rides the plate: its group springs to the target centre (in camera-group space), grows and fades under the fill. */
export function growIcon(b: SpecBuilder, node: string, t: number, camera: number, target: { x: number; y: number; width: number; height: number },
  size: number, spring: SpringParams): void {
  b.key(node, "x", [{ t, v: target.x - camera, ease: "spring", spring }]);
  b.key(node, "y", [{ t, v: target.y, ease: "spring", spring }]);
  b.key(`${node}:i`, "scale", [{ t, v: 1 }, { t, v: Math.min(target.width, target.height) / size / 3, ease: "spring", spring }]);
  b.key(`${node}:i`, "opacity", [{ t, v: 1 }, { t: t + 0.3, v: 0, ease: "in" }]);
}
