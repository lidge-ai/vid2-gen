/** Kerning-aware wrapping and OpenType paths for raster typography. */
import opentype from "opentype.js";
import { readFileSync } from "node:fs";
import type { Font, FontPath, Glyph } from "opentype.js";
import { resolveFont } from "../fonts.ts";

/**
 * Direct glyph layout (cmap + kerning, no GSUB). opentype.js 2 always runs ccmp substitution and throws on chained-context lookups
 * (type 6 format 2) in Instrument Serif, so text is shaped glyph by glyph; raster text must never fail on a font table.
 */
function glyphRun(font: Font, text: string): Glyph[] {
  return [...text].map((ch) => font.charToGlyph(ch));
}

export function advanceWidth(font: Font, text: string, size: number): number {
  const glyphs = glyphRun(font, text);
  const scale = size / font.unitsPerEm;
  let units = 0;
  glyphs.forEach((g, i) => {
    units += g.advanceWidth ?? 0;
    const next = glyphs[i + 1];
    if (next) units += font.getKerningValue(g, next);
  });
  return units * scale;
}

export function textPath(font: Font, text: string, x: number, y: number, size: number): FontPath {
  const glyphs = glyphRun(font, text);
  const scale = size / font.unitsPerEm;
  const commands: FontPath["commands"] = [];
  let pen = x;
  glyphs.forEach((g, i) => {
    commands.push(...g.getPath(pen, y, size).commands);
    pen += (g.advanceWidth ?? 0) * scale;
    const next = glyphs[i + 1];
    if (next) pen += font.getKerningValue(g, next) * scale;
  });
  return { commands };
}
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
    if (current && advanceWidth(font, candidate, size) > maxWidth) {
      lines.push(current.trimEnd());
      current = "";
    }
    if (advanceWidth(font, word, size) <= maxWidth) { current += word; continue; }
    for (const char of word) {
      if (current && advanceWidth(font, current + char, size) > maxWidth) {
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
  const widths = lines.map(line => advanceWidth(font, line, size));
  const width = Math.max(1, ...widths);
  const lineHeight = size * 1.2;
  const ascent = size * font.ascender / font.unitsPerEm;
  const height = Math.max(size, lines.length * lineHeight);
  const first = lines[0] ?? "";
  const boundaries = [0];
  for (let i = 1; i <= [...first].length; i++) boundaries.push(advanceWidth(font, [...first].slice(0, i).join(""), size));
  return { font, lines, widths, width, height, lineHeight, ascent, size, boundaries };
}

export function textPaths(layout: TextLayout, x: number, y: number, align: TextLayer["align"]): FontPath[] {
  return layout.lines.map((line, index) => {
    const offset = align === "left" ? 0 : align === "right" ? layout.width - layout.widths[index]! : (layout.width - layout.widths[index]!) / 2;
    return textPath(layout.font, line, x + offset, y + layout.ascent + index * layout.lineHeight, layout.size);
  });
}
