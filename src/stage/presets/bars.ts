/** bars (030): a bar chart whose bars grow in stagger order, the highlighted one with a glow, values counting up beside them. */
import { measureText } from "../raster.ts";
import { NODE_BASE } from "./builder.ts";
import type { SpecBuilder } from "./builder.ts";
import type { ComponentStyle } from "./style.ts";

export interface BarsConfig {
  x: number; y: number; width: number; rowHeight: number; gap: number;
  items: { label: string; note?: string | undefined; value: number; highlight?: boolean | undefined }[];
  max: number; unit: string; decimals: number; start: number; grow: number; stagger: number; countUp: boolean;
  size: number; fontPath: string; style: ComponentStyle; barColor: string;
}

function row(b: SpecBuilder, c: BarsConfig, i: number): void {
  const item = c.items[i]!;
  const cy = c.y + i * (c.rowHeight + c.gap) + c.rowHeight / 2;
  const t0 = c.start + i * c.stagger;
  const full = (Math.max(0, Math.min(c.max, item.value)) / c.max) * c.width;
  const radius = c.rowHeight * 0.28;
  const hi = item.highlight === true;
  b.add({ ...NODE_BASE, kind: "rect", key: `bar:${i}:track`, x: c.x, y: cy, anchorX: 0, width: c.width, height: c.rowHeight, radius, fill: c.style.track, strokeWidth: 0 });
  b.add({ ...NODE_BASE, kind: "rect", key: `bar:${i}`, x: c.x, y: cy, anchorX: 0, width: 0, height: c.rowHeight, radius, strokeWidth: 0,
    fill: hi ? c.style.accent : c.barColor, ...(hi ? { glow: { color: c.style.accent + "88", blur: 22 } } : {}) });
  b.key(`bar:${i}`, "width", [{ t: t0, v: 0 }, { t: t0 + c.grow, v: full, ease: "out" }]);
  const label = `bar:${i}:label`;
  b.add({ ...NODE_BASE, kind: "text", key: label, x: c.x + c.rowHeight * 0.45, y: cy, anchorX: 0, text: item.label, font: c.fontPath, size: c.size,
    color: hi ? "#FFFFFF" : c.style.text, letterSpacing: 0, opacity: 0 });
  b.key(label, "opacity", [{ t: t0 + c.grow * 0.25, v: 0 }, { t: t0 + c.grow * 0.6, v: 1, ease: "out" }]);
  if (item.note) {
    const nx = c.x + c.rowHeight * 0.45 + measureText(c.fontPath, item.label, c.size, 0).width + c.size * 0.45;
    b.add({ ...NODE_BASE, kind: "text", key: `${label}:note`, x: nx, y: cy, anchorX: 0, text: item.note, font: c.fontPath, size: c.size * 0.9,
      color: hi ? "#FFFFFFB3" : c.style.muted, letterSpacing: 0, opacity: 0 });
    b.key(`${label}:note`, "opacity", [{ t: t0 + c.grow * 0.4, v: 0 }, { t: t0 + c.grow * 0.8, v: 1, ease: "out" }]);
  }
  value(b, c, i, cy, t0, hi);
}

function value(b: SpecBuilder, c: BarsConfig, i: number, cy: number, t0: number, hi: boolean): void {
  const item = c.items[i]!;
  const key = `bar:${i}:value`;
  const text = item.value.toFixed(c.decimals) + c.unit;
  b.add({ ...NODE_BASE, kind: "text", key, x: c.x + c.width + c.size * 0.8, y: cy, anchorX: 0, text, font: c.fontPath, size: c.size,
    color: hi ? c.style.accent : c.style.text, letterSpacing: 0, opacity: 0,
    ...(c.countUp ? { counter: { from: 0, to: item.value, start: b.frame(t0), end: b.frame(t0 + c.grow), decimals: c.decimals, prefix: "", suffix: c.unit } } : {}) });
  b.key(key, "opacity", [{ t: t0, v: 0 }, { t: t0 + 0.2, v: 1, ease: "out" }]);
}

export function buildBars(b: SpecBuilder, c: BarsConfig): void {
  c.items.forEach((_, i) => row(b, c, i));
  const hi = c.items.findIndex((item) => item.highlight);
  b.event(c.start + Math.max(0, hi) * c.stagger + c.grow, "grow");
}
