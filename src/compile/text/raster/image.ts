/** Compose glyph mask, optional box, and shadow into one RGBA PNG. */
import { encodePng } from "../../png.ts";
import type { BuildContext, LayerOf } from "../../ir.ts";
import { layoutText, textPaths } from "./glyphs.ts";
import { rasterizePaths } from "./rasterize.ts";

type TextLayer = LayerOf<"text">;
export interface RevealLine { top: number; bottom: number; left: number; boundaries: number[] }
export interface RasterTextImage { png: Buffer; data: Uint8Array; width: number; height: number; inkLeft: number; inkWidth: number; chars: number; lines: RevealLine[] }

function color(hex: string): [number, number, number, number] {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16),
    hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) : 255];
}

function over(data: Uint8Array, index: number, rgb: [number, number, number, number], coverage: number): void {
  const alpha = coverage * rgb[3] / 255 / 255;
  const old = data[index + 3]! / 255;
  const combined = alpha + old * (1 - alpha);
  if (combined === 0) return;
  for (let c = 0; c < 3; c++) data[index + c] = Math.round((rgb[c]! * alpha + data[index + c]! * old * (1 - alpha)) / combined);
  data[index + 3] = Math.round(combined * 255);
}

function blur(alpha: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius < 1) return alpha;
  const tmp = new Float32Array(alpha.length);
  const out = new Uint8Array(alpha.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += alpha[y * width + Math.max(0, Math.min(width - 1, x + k))]!;
    tmp[y * width + x] = sum / (2 * radius + 1);
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.max(0, Math.min(height - 1, y + k)) * width + x]!;
    out[y * width + x] = Math.round(sum / (2 * radius + 1));
  }
  return out;
}

function boxCoverage(x: number, y: number, width: number, height: number, radius: number): number {
  const cx = Math.max(radius, Math.min(width - radius, x));
  const cy = Math.max(radius, Math.min(height - radius, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 ? 255 : 0;
}

export function renderTextImage(layer: TextLayer, ctx: BuildContext): RasterTextImage {
  const layout = layoutText(layer, ctx);
  const pad = Math.max(8, Math.ceil((layer.box?.padding ?? 0) * ctx.scale),
    Math.ceil(((layer.shadow?.blur ?? 0) + Math.abs(layer.shadow?.y ?? 0)) * ctx.scale + 4));
  const width = Math.max(1, Math.ceil(layout.width + pad * 2));
  const height = Math.max(1, Math.ceil(layout.height + pad * 2));
  const data = new Uint8Array(width * height * 4);
  const glyph = rasterizePaths(textPaths(layout, pad, pad, layer.align), width, height);
  if (layer.shadow) {
    const shadow = blur(glyph, width, height, Math.round(layer.shadow.blur * ctx.scale));
    const dy = Math.round(layer.shadow.y * ctx.scale);
    const shade = color(layer.shadow.color);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sy = y - dy;
      if (sy >= 0 && sy < height) over(data, (y * width + x) * 4, shade, shadow[sy * width + x]!);
    }
  }
  if (layer.box) {
    const inset = pad - layer.box.padding * ctx.scale;
    const boxColor = color(layer.box.color);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const covered = boxCoverage(x - inset, y - inset, width - inset * 2, height - inset * 2, 6 * ctx.scale);
      if (covered) over(data, (y * width + x) * 4, boxColor, covered);
    }
  }
  const foreground = color(layer.color);
  for (let i = 0; i < glyph.length; i++) if (glyph[i]) over(data, i * 4, foreground, glyph[i]!);
  const lines = layout.lines.map((line, index) => {
    const left = pad + (layer.align === "left" ? 0 : layer.align === "right" ? layout.width - layout.widths[index]!
      : (layout.width - layout.widths[index]!) / 2);
    const boundaries = [0];
    for (let n = 1; n <= [...line].length; n++) boundaries.push(layout.font.getAdvanceWidth([...line].slice(0, n).join(""), layout.size, { kerning: true }));
    return { top: Math.floor(pad + index * layout.lineHeight), bottom: Math.ceil(pad + (index + 1) * layout.lineHeight), left, boundaries };
  });
  return { png: encodePng(width, height, 4, data), data, width, height, inkLeft: pad, inkWidth: layout.width,
    chars: lines.reduce((sum, line) => sum + line.boundaries.length - 1, 0), lines };
}
