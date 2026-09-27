/** ticker (030): an optional fixed prefix and a slot-machine list that rolls one item per interval, dimming items by depth. */
import { measureText } from "../raster.ts";
import { NODE_BASE } from "./builder.ts";
import type { Key, SpecBuilder } from "./builder.ts";
import type { ComponentStyle } from "./style.ts";

export interface TickerConfig {
  x: number; y: number; prefix?: string | undefined; items: { text: string; icon?: { paths: string[] } | { image: string } | undefined }[];
  start: number; interval: number; visible: number; size: number; fontPath: string; style: ComponentStyle;
  move: { stiffness: number; damping: number; mass: number };
}

const DEPTH = [1, 0.45, 0.25, 0.12];

function depthOpacity(d: number, visible: number): number {
  if (d < 0 || d >= visible) return 0;
  return DEPTH[Math.min(d, DEPTH.length - 1)]!;
}

function item(b: SpecBuilder, c: TickerConfig, k: number, left: number, rowH: number): void {
  const it = c.items[k]!;
  const key = `tick:${k}`;
  b.add({ ...NODE_BASE, kind: "group", key, x: left, y: c.y + k * rowH, anchorX: 0, anchorY: 0, opacity: 0 });
  let tx = 0;
  if (it.icon) {
    const size = c.size * 0.82;
    const base = { ...NODE_BASE, key: `${key}:icon`, parent: key, x: size / 2, y: 0 };
    if ("paths" in it.icon) b.add({ ...base, kind: "icon", paths: it.icon.paths, size, color: c.style.text, strokeWidth: 2, progress: 1 });
    else b.add({ ...base, kind: "image", image: it.icon.image, width: size, height: size, radius: size * 0.22, fit: "cover" });
    tx = size + c.size * 0.3;
  }
  b.add({ ...NODE_BASE, kind: "text", key: `${key}:text`, parent: key, x: tx, y: 0, anchorX: 0, text: it.text, font: c.fontPath, size: c.size,
    color: c.style.text, letterSpacing: 0 });
  const ys: Key[] = [{ t: 0, v: c.y + k * rowH }];
  const op: Key[] = [{ t: c.start, v: 0 }, { t: c.start + 0.3, v: depthOpacity(k, c.visible), ease: "out" }];
  for (let s = 1; s < c.items.length; s++) {
    const t = c.start + s * c.interval;
    ys.push({ t, v: c.y + (k - s) * rowH, ease: "spring", spring: c.move });
    op.push({ t, v: op[op.length - 1]!.v }, { t: t + 0.25, v: depthOpacity(k - s, c.visible), ease: "out" });
  }
  b.key(key, "y", ys);
  b.key(key, "opacity", op);
}

export function buildTicker(b: SpecBuilder, c: TickerConfig): void {
  let left = c.x;
  if (c.prefix) {
    b.add({ ...NODE_BASE, kind: "text", key: "tick:prefix", x: c.x, y: c.y, anchorX: 0, text: c.prefix, font: c.fontPath, size: c.size,
      color: c.style.text, letterSpacing: 0, opacity: 0 });
    b.key("tick:prefix", "opacity", [{ t: c.start, v: 0 }, { t: c.start + 0.3, v: 1, ease: "out" }]);
    left = c.x + measureText(c.fontPath, c.prefix, c.size, 0).width + c.size * 0.35;
  }
  const rowH = c.size * 1.25;
  c.items.forEach((_, k) => item(b, c, k, left, rowH));
  for (let s = 1; s < c.items.length; s++) b.event(c.start + s * c.interval, "tick");
}
