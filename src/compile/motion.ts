import { parseTimeLiteral, toFrames } from "../shared/time.ts";
import { Vid2Error } from "../shared/errors.ts";
import type { LayerOf, BuildContext } from "./ir.ts";
import { easeExpr } from "./ease.ts";
import { escapeValue, num, quoteExpr } from "./escape.ts";

type Media = LayerOf<"media">;
type CameraKey = Extract<NonNullable<Media["camera"]>, readonly unknown[]>[number];
type Key = { frame: number; zoom: number; x: number; y: number; ease: CameraKey["ease"] };

export interface MotionCanvas { width: number; height: number; oversample: 1 | 2; minZoom: number }

function keyframes(layer: Media, ctx: BuildContext): Key[] {
  if (layer.camera && !Array.isArray(layer.camera)) throw new Vid2Error("E_INPUT", "camera auto=events needs a capture session");
  if (Array.isArray(layer.camera)) return layer.camera.map((key) => ({
    frame: toFrames(parseTimeLiteral(key.at), { fps: ctx.fps, ...(ctx.beat ? { beat: ctx.beat } : {}) }, "duration") * ctx.rate,
    zoom: key.zoom, x: key.x, y: key.y, ease: key.ease,
  })).sort((a, b) => a.frame - b.frame);
  const end = Math.max(1, (layer.endFrame - layer.startFrame) * ctx.rate - 1);
  if (layer.motion === "kenburns") return [
    { frame: 0, zoom: 1, x: 0.5, y: 0.5, ease: "inout" },
    { frame: end, zoom: 1.08, x: 0.5, y: 0.5, ease: "inout" },
  ];
  if (layer.motion === "drift") return [
    { frame: 0, zoom: 1.04, x: 0.45, y: 0.5, ease: "linear" },
    { frame: end, zoom: 1.04, x: 0.55, y: 0.5, ease: "linear" },
  ];
  return [{ frame: 0, zoom: 1, x: 0.5, y: 0.5, ease: "linear" }];
}

function valueExpr(keys: Key[], field: "zoom" | "x" | "y", punchFrames?: number): string {
  if (field === "zoom" && punchFrames !== undefined) return `1+0.10*exp(-in/4)+0.025*in/${num(punchFrames)}`;
  if (keys.length === 1) return num(keys[0]![field]);
  const terms = [`lt(in,${num(keys[0]!.frame)})*${num(keys[0]![field])}`];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (b.frame <= a.frame) continue;
    const t = `(in-${num(a.frame)})/${num(b.frame - a.frame)}`;
    const tween = `${num(a[field])}+${num(b[field] - a[field])}*(${easeExpr(a.ease, t)})`;
    terms.push(`between(in,${num(a.frame)},${num(b.frame - 1)})*(${tween})`);
  }
  const last = keys.at(-1)!;
  terms.push(`gte(in,${num(last.frame)})*${num(last[field])}`);
  return terms.join("+");
}

export function motionCanvas(layer: Media, ctx: BuildContext, width: number, height: number): MotionCanvas {
  const minZoom = Math.min(1, ...keyframes(layer, ctx).map((key) => key.zoom));
  const expandedW = Math.ceil(width / minZoom / 2) * 2;
  const expandedH = Math.ceil(height / minZoom / 2) * 2;
  const oversample: 1 | 2 = Math.max(expandedW, expandedH) * ctx.oversample > 8192 ? 1 : ctx.oversample;
  return { width: Math.min(8192, expandedW * oversample), height: Math.min(8192, expandedH * oversample), oversample, minZoom };
}

function cornerExpr(side: "low" | "high", size: number, focus: string, zoom: string): string {
  const half = `(0.5/(${zoom}))`;
  const centre = `clip((${focus}),${half},1-${half})`;
  return `${num(size)}*(${centre}${side === "low" ? "-" : "+"}${half})`;
}

export function perspectiveFilters(layer: Media, ctx: BuildContext, width: number, height: number): { before: string[]; perspective: string; after: string[]; canvas: MotionCanvas } {
  const canvas = motionCanvas(layer, ctx, width, height);
  const keys = keyframes(layer, ctx);
  const punchFrames = layer.motion === "punch" && !Array.isArray(layer.camera) ? Math.max(1, (layer.endFrame - layer.startFrame) * ctx.rate) : undefined;
  const zoom = `(${valueExpr(keys, "zoom", punchFrames)})/${num(canvas.minZoom)}`;
  const x = valueExpr(keys, "x");
  const y = valueExpr(keys, "y");
  const x0 = cornerExpr("low", canvas.width, x, zoom);
  const x1 = cornerExpr("high", canvas.width, x, zoom);
  const y0 = cornerExpr("low", canvas.height, y, zoom);
  const y2 = cornerExpr("high", canvas.height, y, zoom);
  const perspective = `perspective=x0=${quoteExpr(x0)}:y0=${quoteExpr(y0)}:x1=${quoteExpr(x1)}:y1=${quoteExpr(y0)}:` +
    `x2=${quoteExpr(x0)}:y2=${quoteExpr(y2)}:x3=${quoteExpr(x1)}:y3=${quoteExpr(y2)}:interpolation=cubic:sense=source:eval=frame`;
  if (perspective.length > 100_000) throw new Vid2Error("E_INPUT", `camera perspective expression is ${perspective.length} characters (limit 100000)`, {
    details: { path: `${ctx.layerPath ?? `scenes.?(${ctx.sceneId}).layers.?`}.camera`, sceneId: ctx.sceneId, sourceId: layer.source },
    fix: "use fewer camera keys or split the layer",
  });
  const baseW = Math.round(width * canvas.oversample);
  const baseH = Math.round(height * canvas.oversample);
  const background = ctx.background.startsWith("#") ? ctx.background : "#000000";
  const before = [`scale=${num(baseW)}:${num(baseH)}:flags=lanczos`, `pad=${num(canvas.width)}:${num(canvas.height)}:(ow-iw)/2:(oh-ih)/2:color=${escapeValue(background)}`,
    "format=rgba", "setsar=1"];
  return { before, perspective, after: [`scale=${num(width)}:${num(height)}:flags=area`, "format=rgba"], canvas };
}

export interface ProjectedCorner { x: number; y: number }
export function projectWindowCorners(width: number, height: number, cx: number, cy: number, rx: number, ry: number): [ProjectedCorner, ProjectedCorner, ProjectedCorner, ProjectedCorner] {
  const ax = rx * Math.PI / 180;
  const ay = ry * Math.PI / 180;
  const focal = 1.2 * width;
  const project = (x: number, y: number): ProjectedCorner => {
    const xx = x - cx;
    const yy = y - cy;
    const rotatedY = yy * Math.cos(ax);
    const z = yy * Math.sin(ax) - xx * Math.sin(ay) * Math.cos(ax);
    const rotatedX = xx * Math.cos(ay) + yy * Math.sin(ax) * Math.sin(ay);
    const scale = focal / (focal + z);
    return { x: cx + rotatedX * scale, y: cy + rotatedY * scale };
  };
  return [project(0, 0), project(width, 0), project(0, height), project(width, height)];
}
