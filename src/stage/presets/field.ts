/** field (030): an input pill with placeholder, typed glyphs (accent decay), caret, synthetic cursor + click ripple, masking and clear. */
import { CURSORS } from "../icons/cursors.ts";
import { measureText } from "../raster.ts";
import { NODE_BASE } from "./builder.ts";
import type { Key, SpecBuilder } from "./builder.ts";
import type { ComponentStyle } from "./style.ts";

export interface FieldConfig {
  x: number; y: number; width: number; height: number; radius: number; grow?: { maxWidth: number; padX: number } | undefined;
  placeholder?: string | undefined; size: number; fontPath: string;
  typing: { at: number; text: string; glyph: number }[];
  clear?: number | undefined; mask?: { at: number; char: string } | undefined; accent?: { color: string; decay: number } | undefined;
  caret: boolean; cursor?: { style: "ibeam" | "arrow" | "hand"; from: { x: number; y: number }; at: number; click?: number | undefined } | undefined;
  style: ComponentStyle; duration: number; move: { stiffness: number; damping: number; mass: number };
}
interface Glyph { ch: string; t: number; x: number }

const PAD = 30;

/** Every typed glyph with its appearance time and advance offset (typing entries append). */
function glyphs(c: FieldConfig): { list: Glyph[]; advance: (n: number) => number } {
  const text = c.typing.map((t) => t.text).join("");
  const m = measureText(c.fontPath, text || " ", c.size, 0);
  const list: Glyph[] = [];
  let i = 0;
  for (const entry of c.typing) [...entry.text].forEach((ch, k) => { list.push({ ch, t: entry.at + k * entry.glyph, x: m.advances[i]! }); i++; });
  return { list, advance: (n) => m.advances[Math.min(n, m.advances.length - 1)]! };
}

function pill(b: SpecBuilder, c: FieldConfig, g: ReturnType<typeof glyphs>): Key[] {
  const s = c.style;
  b.add({ ...NODE_BASE, kind: "rect", key: "fld:pill", x: c.x, y: c.y, width: c.width, height: c.height, radius: Math.min(c.radius, c.height / 2),
    fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth, ...(s.glow ? { glow: { color: s.glow, blur: 18 } } : {}),
    shadow: { color: s.shadow, blur: 20, x: 0, y: 10 } });
  const pad = c.grow?.padX ?? PAD;
  if (!c.grow) return [{ t: 0, v: c.x - c.width / 2 + pad }];
  const spring = { ...c.move, damping: Math.max(c.move.damping, 2 * Math.sqrt(c.move.stiffness * c.move.mass)) };
  const widths: Key[] = [{ t: 0, v: c.width }];
  const lefts: Key[] = [{ t: 0, v: c.x - c.width / 2 + pad }];
  let last = c.width;
  g.list.forEach((glyph, i) => {
    const w = Math.min(c.grow!.maxWidth, Math.max(c.width, g.advance(i + 1) + pad * 2 + c.size * 0.6));
    if (w <= last + 0.5) return;
    widths.push({ t: glyph.t, v: w, ease: "spring", spring });
    lefts.push({ t: glyph.t, v: c.x - w / 2 + pad, ease: "spring", spring });
    last = w;
  });
  b.key("fld:pill", "width", widths);
  return lefts;
}

function typed(b: SpecBuilder, c: FieldConfig, g: ReturnType<typeof glyphs>, lefts: Key[]): void {
  b.add({ ...NODE_BASE, kind: "group", key: "fld:text", x: lefts[0]!.v as number, y: c.y, anchorX: 0, anchorY: 0 });
  b.key("fld:text", "x", lefts);
  if (c.placeholder) {
    b.add({ ...NODE_BASE, kind: "text", key: "fld:ph", parent: "fld:text", text: c.placeholder, font: c.fontPath, size: c.size, color: c.style.muted,
      letterSpacing: 0, anchorX: 0 });
    const first = g.list[0]?.t;
    if (first !== undefined) b.key("fld:ph", "opacity", [{ t: first, v: 1 }, { t: first, v: 0, ease: "hold" }]);
  }
  g.list.forEach((glyph, i) => {
    const key = `fld:g${i}`;
    b.add({ ...NODE_BASE, kind: "text", key, parent: "fld:text", text: glyph.ch, font: c.fontPath, size: c.size, color: c.style.text,
      letterSpacing: 0, x: glyph.x, anchorX: 0, opacity: 0 });
    b.key(key, "opacity", [{ t: glyph.t, v: 0 }, { t: glyph.t, v: 1, ease: "hold" }, ...(c.mask ? [{ t: c.mask.at, v: 1 }, { t: c.mask.at, v: 0, ease: "hold" as const }] : []),
      ...(c.clear !== undefined ? [{ t: c.clear, v: 1 }, { t: c.clear + 0.2, v: 0, ease: "in" as const }] : [])]);
    if (c.accent) b.key(key, "color", [{ t: glyph.t, v: c.accent.color }, { t: glyph.t + c.accent.decay, v: c.style.text, ease: "linear" }]);
    if (i % 3 === 0) b.event(glyph.t, "glyph");
  });
  if (c.mask) masked(b, c, g.list.length);
}

function masked(b: SpecBuilder, c: FieldConfig, count: number): void {
  const step = measureText(c.fontPath, c.mask!.char + c.mask!.char, c.size, 0).advances[1]! + c.size * 0.18;
  for (let i = 0; i < count; i++) {
    const key = `fld:m${i}`;
    b.add({ ...NODE_BASE, kind: "text", key, parent: "fld:text", text: c.mask!.char, font: c.fontPath, size: c.size, color: c.style.text,
      letterSpacing: 0, x: i * step, anchorX: 0, opacity: 0 });
    b.key(key, "opacity", [{ t: c.mask!.at + i * 0.012, v: 0 }, { t: c.mask!.at + i * 0.012, v: 1, ease: "hold" }]);
  }
}

function caret(b: SpecBuilder, c: FieldConfig, g: ReturnType<typeof glyphs>): void {
  if (!c.caret) return;
  b.add({ ...NODE_BASE, kind: "rect", key: "fld:caret", parent: "fld:text", x: 1, y: 0, width: Math.max(2, c.size * 0.07), height: c.size * 1.1,
    radius: 1, fill: c.style.accent, strokeWidth: 0 });
  b.key("fld:caret", "x", [{ t: 0, v: 1 }, ...g.list.map((glyph, i) => ({ t: glyph.t, v: g.advance(i + 1) + 2, ease: "hold" as const }))]);
  const busy = g.list.length ? [g.list[0]!.t, g.list[g.list.length - 1]!.t + 0.4] : [Infinity, -Infinity];
  const keys: Key[] = [];
  for (let t = 0, on = true; t < c.duration; t += 0.53, on = !on) {
    const visible = on || (t >= busy[0]! && t <= busy[1]!);
    keys.push({ t, v: visible ? 1 : 0, ease: "hold" });
  }
  b.key("fld:caret", "opacity", keys);
}

function cursor(b: SpecBuilder, c: FieldConfig): void {
  const cur = c.cursor;
  if (!cur) return;
  const size = c.size * 1.1;
  const target = { x: c.x - c.width / 2 + (c.grow?.padX ?? PAD) + size * 0.3, y: c.y };
  b.add({ ...NODE_BASE, kind: "icon", key: "fld:cursor", paths: CURSORS[cur.style], size, color: c.style.text, strokeWidth: 2.2, progress: 1,
    x: cur.from.x, y: cur.from.y, z: 5 });
  b.key("fld:cursor", "x", [{ t: cur.at - 0.6, v: cur.from.x }, { t: cur.at, v: target.x, ease: "inout" }]);
  b.key("fld:cursor", "y", [{ t: cur.at - 0.6, v: cur.from.y }, { t: cur.at, v: target.y, ease: "inout" }]);
  const firstGlyph = c.typing[0]?.at;
  if (firstGlyph !== undefined) b.key("fld:cursor", "opacity", [{ t: firstGlyph, v: 1 }, { t: firstGlyph + 0.25, v: 0, ease: "out" }]);
  if (cur.click === undefined) return;
  b.key("fld:cursor", "scale", [{ t: cur.click, v: 1 }, { t: cur.click + 0.07, v: 0.82, ease: "out" }, { t: cur.click + 0.2, v: 1, ease: "out" }]);
  b.add({ ...NODE_BASE, kind: "rect", key: "fld:ripple", x: target.x, y: target.y, width: 0, height: 0, radius: 999, fill: c.style.accent + "00",
    stroke: c.style.accent, strokeWidth: 2, opacity: 0, z: 4 });
  b.key("fld:ripple", "width", [{ t: cur.click, v: 4 }, { t: cur.click + 0.4, v: size * 1.6, ease: "out" }]);
  b.key("fld:ripple", "height", [{ t: cur.click, v: 4 }, { t: cur.click + 0.4, v: size * 1.6, ease: "out" }]);
  b.key("fld:ripple", "opacity", [{ t: cur.click, v: 0.9 }, { t: cur.click + 0.4, v: 0, ease: "out" }]);
  b.event(cur.click, "click");
}

export function buildField(b: SpecBuilder, c: FieldConfig): void {
  const g = glyphs(c);
  const lefts = pill(b, c, g);
  typed(b, c, g, lefts);
  caret(b, c, g);
  cursor(b, c);
}
