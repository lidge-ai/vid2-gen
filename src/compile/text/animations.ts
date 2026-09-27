/** ASS override generators for the public text animation presets. */
import type { LayerOf } from "../ir.ts";

type TextLayer = LayerOf<"text">;
const i = (value: number): number => Math.round(value);

export function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
}

export function karaokeText(text: string, durationMs: number): string {
  const chars = [...text];
  if (chars.length === 0) return "";
  const totalCs = Math.max(chars.length, i(durationMs / 10));
  const each = Math.max(1, i(totalCs / chars.length));
  return chars.map(char => `{\\k${each}}${escapeAssText(char)}`).join("");
}

export function animationOverride(layer: TextLayer, x: number, y: number, scale: number, ms: number, textWidth: number): string {
  switch (layer.animation) {
    case "none": return "";
    case "fade": return `\\fad(${ms},120)`;
    case "rise": return `\\move(${i(x)},${i(y + 24 * scale)},${i(x)},${i(y)},0,${ms})\\fad(${ms},120)`;
    case "slam": return `\\fscx145\\fscy145\\alpha&HFF&\\t(0,60,\\alpha&H00&)\\t(0,${ms},0.5,\\fscx100\\fscy100)`;
    case "pop": return `\\fscx80\\fscy80\\t(0,${i(ms * 0.6)},\\fscx108\\fscy108)\\t(${i(ms * 0.6)},${ms},\\fscx100\\fscy100)\\fad(80,120)`;
    case "type": return "\\2a&HFF&";
    case "wipe": {
      const left = i(x - textWidth / 2);
      const top = i(y - layer.size * scale);
      const bottom = i(y + layer.size * scale);
      return `\\clip(${left},${top},${left},${bottom})\\t(0,${ms},\\clip(${left},${top},${i(x + textWidth / 2)},${bottom}))`;
    }
    case "blur": return `\\blur18\\alpha&HFF&\\t(0,${ms},\\blur0\\alpha&H00&)`;
  }
}
