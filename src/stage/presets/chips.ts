/** chips (030): pills (icon + text + note) entering in sequence, optionally joined to an origin by connector lines with a travelling dot. */
import { measureText } from "../raster.ts";
import { NODE_BASE } from "./builder.ts";
import type { SpecBuilder } from "./builder.ts";
import type { ComponentStyle } from "./style.ts";

export interface ChipsConfig {
  x: number; y: number; direction: "column" | "row"; gap: number;
  items: { at: number; text: string; icon?: { paths: string[] } | { image: string } | undefined; note?: string | undefined }[];
  connector?: { from: { x: number; y: number }; dot: boolean } | undefined;
  size: number; fontPath: string; style: ComponentStyle;
}

interface Box { x: number; y: number; width: number; height: number }

function chipBoxes(c: ChipsConfig): Box[] {
  const h = c.size * 2;
  let cursor = 0;
  return c.items.map((it) => {
    const icon = it.icon ? c.size * 1.3 : 0;
    const note = it.note ? measureText(c.fontPath, it.note, c.size * 0.9, 0).width + c.size * 0.6 : 0;
    const width = c.size * 1.1 + icon + measureText(c.fontPath, it.text, c.size, 0).width + note + c.size * 1.1;
    const box = c.direction === "column" ? { x: c.x, y: c.y + cursor, width, height: h } : { x: c.x + cursor, y: c.y, width, height: h };
    cursor += (c.direction === "column" ? h : width) + c.gap;
    return box;
  });
}

function chip(b: SpecBuilder, c: ChipsConfig, k: number, box: Box): void {
  const it = c.items[k]!;
  const key = `chip:${k}`;
  const cy = box.y + box.height / 2;
  b.add({ ...NODE_BASE, kind: "group", key, x: box.x, y: cy, anchorX: 0, anchorY: 0, opacity: 0 });
  b.add({ ...NODE_BASE, kind: "rect", key: `${key}:pill`, parent: key, x: 0, y: 0, anchorX: 0, width: box.width, height: box.height, radius: box.height / 2,
    fill: c.style.fill, stroke: c.style.stroke, strokeWidth: c.style.strokeWidth, shadow: { color: c.style.shadow, blur: 14, x: 0, y: 6 } });
  let x = c.size * 1.1;
  if (it.icon) {
    const size = c.size * 1.05;
    const base = { ...NODE_BASE, key: `${key}:icon`, parent: key, x: x + size / 2, y: 0 };
    if ("paths" in it.icon) b.add({ ...base, kind: "icon", paths: it.icon.paths, size, color: c.style.accent, strokeWidth: 2, progress: 1 });
    else b.add({ ...base, kind: "image", image: it.icon.image, width: size, height: size, radius: size * 0.22, fit: "cover" });
    x += c.size * 1.3;
  }
  b.add({ ...NODE_BASE, kind: "text", key: `${key}:text`, parent: key, x, y: 0, anchorX: 0, text: it.text, font: c.fontPath, size: c.size, color: c.style.text, letterSpacing: 0 });
  if (it.note) b.add({ ...NODE_BASE, kind: "text", key: `${key}:note`, parent: key, x: x + measureText(c.fontPath, it.text, c.size, 0).width + c.size * 0.6, y: 0,
    anchorX: 0, text: it.note, font: c.fontPath, size: c.size * 0.9, color: c.style.muted, letterSpacing: 0 });
  b.key(key, "opacity", [{ t: it.at, v: 0 }, { t: it.at + 0.3, v: 1, ease: "out" }]);
  b.key(key, "x", [{ t: it.at, v: box.x - 14 }, { t: it.at + 0.35, v: box.x, ease: "out" }]);
  b.key(`${key}:text`, "blur", [{ t: it.at, v: 6 }, { t: it.at + 0.3, v: 0, ease: "out" }]);
  b.event(it.at, "token");
}

/** Elbow connector from the origin to the chip's left middle, drawn over 0.35 s ending at the chip's entrance, with a travelling dot. */
function connector(b: SpecBuilder, c: ChipsConfig, k: number, box: Box): void {
  const from = c.connector!.from;
  const to = { x: box.x - 6, y: box.y + box.height / 2 };
  const midX = from.x + (to.x - from.x) * 0.5;
  const ox = Math.min(from.x, to.x);
  const oy = Math.min(from.y, to.y);
  const pts = [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to].map((pt) => ({ x: pt.x - ox, y: pt.y - oy }));
  const key = `chip:${k}:line`;
  const t0 = c.items[k]!.at - 0.35;
  b.add({ ...NODE_BASE, kind: "path", key, x: ox, y: oy, anchorX: 0, anchorY: 0, d: [`M${pts.map((pt) => `${pt.x} ${pt.y}`).join("L")}`],
    width: Math.max(1, Math.abs(to.x - from.x)), height: Math.max(1, Math.abs(to.y - from.y)), color: c.style.muted, strokeWidth: 1.5, progress: 0, z: -1 });
  b.key(key, "progress", [{ t: t0, v: 0 }, { t: c.items[k]!.at, v: 1, ease: "inout" }]);
  if (!c.connector!.dot) return;
  const lengths = pts.slice(1).map((pt, i) => Math.hypot(pt.x - pts[i]!.x, pt.y - pts[i]!.y));
  const total = lengths.reduce((a, v) => a + v, 0) || 1;
  const dot = `${key}:dot`;
  b.add({ ...NODE_BASE, kind: "rect", key: dot, x: from.x, y: from.y, width: 7, height: 7, radius: 4, fill: c.style.accent, strokeWidth: 0, opacity: 0 });
  let acc = 0;
  const xs = [{ t: t0, v: from.x }];
  const ys = [{ t: t0, v: from.y }];
  pts.slice(1).forEach((pt, i) => { acc += lengths[i]!; const t = t0 + 0.35 * (acc / total); xs.push({ t, v: pt.x + ox }); ys.push({ t, v: pt.y + oy }); });
  b.key(dot, "x", xs.map((k2, i) => (i ? { ...k2, ease: "linear" as const } : k2)));
  b.key(dot, "y", ys.map((k2, i) => (i ? { ...k2, ease: "linear" as const } : k2)));
  b.key(dot, "opacity", [{ t: t0, v: 0 }, { t: t0 + 0.05, v: 1, ease: "out" }, { t: c.items[k]!.at, v: 1 }, { t: c.items[k]!.at + 0.2, v: 0, ease: "out" }]);
}

export function buildChips(b: SpecBuilder, c: ChipsConfig): void {
  chipBoxes(c).forEach((box, k) => { if (c.connector) connector(b, c, k, box); chip(b, c, k, box); });
}
