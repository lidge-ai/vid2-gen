/** Build one ASS document for one consecutive run of text layers. */
import { parseTimeLiteral } from "../../shared/time.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { BeatGrid } from "../../shared/time.ts";
import type { BuildContext, LayerOf } from "../ir.ts";
import { animationOverride, escapeAssText, karaokeText } from "./animations.ts";
import { cjkFontWarning, resolveFont } from "./fonts.ts";

type TextLayer = LayerOf<"text">;
interface Prepared { layer: TextLayer; style: string; family: string; x: number; y: number; size: number }
export interface AssDocument { content: string; fontFiles: string[]; fontsDir: string }

/** CSS #RRGGBB[AA] to ASS &HAABBGGRR (ASS alpha is inverted). */
export function assColor(color: string): string {
  const rgb = color.slice(1, 7);
  const alpha = color.length === 9 ? 255 - Number.parseInt(color.slice(7, 9), 16) : 0;
  const hex = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");
  return `&H${hex(alpha)}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}&`;
}

function timestamp(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const hh = Math.floor(cs / 360000);
  const mm = Math.floor(cs / 6000) % 60;
  const ss = Math.floor(cs / 100) % 60;
  return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function anchor(layer: TextLayer, ctx: BuildContext): { x: number; y: number } {
  return { x: layer.x === "center" ? ctx.width / 2 : layer.x * ctx.scale,
    y: layer.y === "center" ? ctx.height / 2 : layer.y * ctx.scale };
}

function alignNumber(align: TextLayer["align"]): number { return align === "left" ? 4 : align === "right" ? 6 : 5; }

function durationMs(layer: TextLayer, ctx: BuildContext): number {
  const lit = parseTimeLiteral(layer.animationDuration);
  if (lit.unit === "s") return Math.max(1, Math.round(lit.value * 1000));
  if (lit.unit === "f") return Math.max(1, Math.round(lit.value * ctx.fps.den * 1000 / ctx.fps.num));
  const beat = (ctx as BuildContext & { beat?: BeatGrid }).beat;
  if (!beat) throw new Vid2Error("E_SCHEMA", "beat animation duration needs a beat grid");
  return Math.max(1, Math.round(lit.value * 60000 / beat.bpm));
}

function styleKey(layer: TextLayer, family: string, size: number): string {
  return JSON.stringify([family, layer.weight, size, layer.color, layer.align, layer.box, layer.shadow]);
}

function styleLine(name: string, p: Prepared): string {
  const { layer, family, size } = p;
  const box = layer.box;
  const shadow = layer.shadow;
  const back = box ? assColor(box.color) : shadow ? assColor(shadow.color) : assColor("#00000000");
  const bold = ["semibold", "bold", "black"].includes(layer.weight) ? -1 : 0;
  const italic = layer.weight === "italic" ? -1 : 0;
  const border = box ? 3 : 1;
  const outline = box ? Math.max(0, Math.round(box.padding * size / layer.size)) : 0;
  const shad = shadow ? Math.max(0, Math.round(shadow.y * size / layer.size)) : 0;
  return `Style: ${name},${family.replaceAll(",", " ")},${Math.round(size)},${assColor(layer.color)},&HFF000000&,&H00000000&,${back},${bold},${italic},0,0,100,100,0,0,${border},${outline},${shad},${alignNumber(layer.align)},0,0,0,1`;
}

function dialogue(p: Prepared, ctx: BuildContext): string {
  const { layer, style, x, y } = p;
  const ms = durationMs(layer, ctx);
  const width = layer.maxWidth ? layer.maxWidth * ctx.scale : [...layer.text].length * p.size * 0.6;
  const motion = animationOverride(layer, x, y, ctx.scale, ms, width);
  const position = layer.animation === "rise" ? "" : `\\pos(${Math.round(x)},${Math.round(y)})`;
  const shadow = layer.shadow ? `\\shad${Math.round(layer.shadow.y * ctx.scale)}\\blur${Math.round(layer.shadow.blur * ctx.scale)}\\4c${assColor(layer.shadow.color)}` : "";
  const tags = `{\\an${alignNumber(layer.align)}${position}${shadow}${motion}}`;
  const text = layer.animation === "type" ? karaokeText(layer.text, ms) : escapeAssText(layer.text);
  return `Dialogue: 0,${timestamp(layer.startSeconds)},${timestamp(layer.endSeconds)},${style},,0,0,0,,${tags}${text}`;
}

export function buildAss(layers: TextLayer[], ctx: BuildContext): AssDocument {
  const fontFiles = new Set<string>();
  const styles = new Map<string, string>();
  let fontsDir = "";
  const prepared: Prepared[] = layers.map(layer => {
    const font = resolveFont(layer.font, layer.weight, ctx);
    fontFiles.add(font.path);
    fontsDir = font.fontsDir;
    const warning = cjkFontWarning(layer.text, layer.font);
    if (warning) process.stderr.write(`vid2 warn: ${warning}\n`);
    const size = layer.size * ctx.scale;
    const key = styleKey(layer, font.family, size);
    if (!styles.has(key)) styles.set(key, `T${styles.size + 1}`);
    return { layer, style: styles.get(key)!, family: font.family, size, ...anchor(layer, ctx) };
  });
  const firstByStyle = new Map(prepared.map(p => [p.style, p]));
  const header = ["[Script Info]", "ScriptType: v4.00+", `PlayResX: ${ctx.width}`, `PlayResY: ${ctx.height}`,
    "ScaledBorderAndShadow: yes", "WrapStyle: 2", "", "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding"];
  const styleLines = [...firstByStyle].map(([name, p]) => styleLine(name, p));
  const events = ["", "[Events]", "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text", ...prepared.map(p => dialogue(p, ctx))];
  return { content: [...header, ...styleLines, ...events, ""].join("\n"), fontFiles: [...fontFiles], fontsDir };
}
