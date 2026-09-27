/** Measure and place kinetic tokens: greedy wrap, per-line alignment, icons sized from the font size. All values in authored px. */
import { measureText } from "../raster.ts";
import type { Token } from "./tokens.ts";

export interface LayoutOptions { fontPath: string; size: number; letterSpacing: number; gap: number; lineHeight: number;
  maxWidth?: number | undefined; align: "left" | "center" | "right"; x: number; y: number; iconScale: number }
/** A placed token: left edge x, vertical centre y, box size; glyph advances for text tokens. */
export interface Placed { key: string; x: number; y: number; width: number; height: number; line: number; advances: number[] }
export interface Layout { placed: Map<string, Placed>; order: string[]; bounds: { x0: number; y0: number; x1: number; y1: number } }

export function iconSize(o: LayoutOptions): number { return o.size * 0.82 * o.iconScale; }

function tokenWidth(t: Token, o: LayoutOptions): { width: number; advances: number[] } {
  if (t.icon !== undefined) return { width: iconSize(o), advances: [] };
  const m = measureText(o.fontPath, t.text ?? "", o.size, o.letterSpacing);
  return { width: m.width, advances: m.advances };
}

function wrap(tokens: Token[], widths: number[], o: LayoutOptions): number[][] {
  const space = o.size * o.gap;
  const lines: number[][] = [];
  let current: number[] = [];
  let width = 0;
  tokens.forEach((t, i) => {
    const w = widths[i]!;
    const next = current.length ? width + space + w : w;
    if (current.length && (t.newline || (o.maxWidth !== undefined && next > o.maxWidth))) { lines.push(current); current = []; width = 0; }
    width = current.length ? width + space + w : w;
    current.push(i);
  });
  if (current.length) lines.push(current);
  return lines;
}

export function layoutTokens(tokens: Token[], o: LayoutOptions): Layout {
  const measured = tokens.map((t) => tokenWidth(t, o));
  const widths = measured.map((m) => m.width);
  const lines = wrap(tokens, widths, o);
  const space = o.size * o.gap;
  const lineH = o.size * o.lineHeight;
  const top = o.y - (lines.length * lineH) / 2;
  const placed = new Map<string, Placed>();
  let bounds = { x0: Infinity, y0: top, x1: -Infinity, y1: top + lines.length * lineH };
  lines.forEach((line, li) => {
    const lineWidth = line.reduce((sum, i) => sum + widths[i]!, 0) + space * (line.length - 1);
    let x = o.align === "left" ? o.x : o.align === "right" ? o.x - lineWidth : o.x - lineWidth / 2;
    for (const i of line) {
      const t = tokens[i]!;
      const height = t.icon !== undefined ? iconSize(o) : o.size;
      placed.set(t.key, { key: t.key, x, y: top + (li + 0.5) * lineH, width: widths[i]!, height, line: li, advances: measured[i]!.advances });
      bounds = { ...bounds, x0: Math.min(bounds.x0, x), x1: Math.max(bounds.x1, x + widths[i]!) };
      x += widths[i]! + space;
    }
  });
  if (!placed.size) bounds = { x0: o.x, y0: o.y, x1: o.x, y1: o.y };
  return { placed, order: tokens.map((t) => t.key), bounds };
}
