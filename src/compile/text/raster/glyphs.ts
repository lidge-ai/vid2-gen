/** Kerning-aware wrapping and OpenType paths for raster typography. */
import opentype from "opentype.js";
import { readFileSync } from "node:fs";
import type { Font, FontPath } from "opentype.js";
import { resolveFont } from "../fonts.ts";
import type { BuildContext, LayerOf } from "../../ir.ts";

type TextLayer = LayerOf<"text">;
export interface TextLayout { font: Font; lines: string[]; widths: number[]; width: number; height: number; lineHeight: number; ascent: number; size: number; boundaries: number[] }
const loaded = new Map<string, Font>();

function fontFor(layer: TextLayer, ctx: BuildContext): Font {
  const path = resolveFont(layer.font, layer.weight, ctx).path;
  let font = loaded.get(path);
  if (!font) { font = opentype.parse(readFileSync(path)); loaded.set(path, font); }
  return font;
}

function wrapLine(text: string, maxWidth: number, font: Font, size: number): string[] {
  if (!Number.isFinite(maxWidth)) return [text];
  const words = text.split(/(\s+)/u);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (/^\s+$/u.test(word)) { current += word; continue; }
    const candidate = current + word;
    if (current && font.getAdvanceWidth(candidate, size, { kerning: true }) > maxWidth) {
      lines.push(current.trimEnd());
      current = "";
    }
    if (font.getAdvanceWidth(word, size, { kerning: true }) <= maxWidth) { current += word; continue; }
    for (const char of word) {
      if (current && font.getAdvanceWidth(current + char, size, { kerning: true }) > maxWidth) {
        lines.push(current);
        current = "";
      }
      current += char;
    }
  }
  lines.push(current);
  return lines;
}

export function layoutText(layer: TextLayer, ctx: BuildContext): TextLayout {
  const font = fontFor(layer, ctx);
  // libass normalizes font size against ascent+descent, not the OpenType em square.
  const size = layer.size * ctx.scale * font.unitsPerEm / (font.ascender - font.descender);
  const maxWidth = layer.maxWidth === undefined ? Infinity : layer.maxWidth * ctx.scale;
  const lines = layer.text.split(/\r?\n/u).flatMap(line => wrapLine(line, maxWidth, font, size));
  const widths = lines.map(line => font.getAdvanceWidth(line, size, { kerning: true }));
  const width = Math.max(1, ...widths);
  const lineHeight = size * 1.2;
  const ascent = size * font.ascender / font.unitsPerEm;
  const height = Math.max(size, lines.length * lineHeight);
  const first = lines[0] ?? "";
  const boundaries = [0];
  for (let i = 1; i <= [...first].length; i++) boundaries.push(font.getAdvanceWidth([...first].slice(0, i).join(""), size, { kerning: true }));
  return { font, lines, widths, width, height, lineHeight, ascent, size, boundaries };
}

export function textPaths(layout: TextLayout, x: number, y: number, align: TextLayer["align"]): FontPath[] {
  return layout.lines.map((line, index) => {
    const offset = align === "left" ? 0 : align === "right" ? layout.width - layout.widths[index]! : (layout.width - layout.widths[index]!) / 2;
    return layout.font.getPath(line, x + offset, y + layout.ascent + index * layout.lineHeight, layout.size, { kerning: true });
  });
}
