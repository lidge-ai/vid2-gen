import { Vid2Error } from "../../shared/errors.ts";
import { escapeValue, num } from "../escape.ts";
import type { LayerBuilder, LayerOf } from "../ir.ts";
import { cachedPng, solidRect } from "../png.ts";
import { layerRate, pngInput, spanSeconds } from "./media.ts";

type Shape = LayerOf<"shape">;

function colorBytes(hex: string): [number, number, number, number] {
  const s = hex.startsWith("#") ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) throw new Vid2Error("E_SCHEMA", `invalid color: ${hex}`);
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), s.length === 8 ? parseInt(s.slice(6, 8), 16) : 255];
}

export const buildShapeLayer: LayerBuilder<Shape> = (layer, ctx) => {
  const width = Math.max(1, Math.round(layer.width * ctx.scale));
  const height = Math.max(1, Math.round(layer.height * ctx.scale));
  const radius = Math.max(0, Math.round(layer.radius * ctx.scale));
  const seconds = spanSeconds(layer, ctx);
  let label: string;
  if (radius === 0) {
    const lavfi = `color=c=black@0:s=${num(width)}x${num(height)}:r=${layerRate(ctx)}:d=${num(seconds)}`;
    const input = ctx.inputs.add({ kind: "lavfi", lavfi, args: ["-f", "lavfi", "-i", lavfi] });
    label = ctx.graph.add([input], ["format=rgba", `drawbox=x=0:y=0:w=iw:h=ih:color=${escapeValue(layer.color)}:t=fill`]);
  } else {
    const path = cachedPng(ctx.pngDir, { kind: "shape", width, height, radius, color: layer.color },
      () => solidRect(width, height, radius, colorBytes(layer.color)));
    label = ctx.graph.add([pngInput(path, seconds, ctx)], ["format=rgba"]);
  }
  return { mode: "overlay", label: ctx.graph.add([label], [`setpts=PTS-STARTPTS+${num(layer.startSeconds)}/TB`]),
    x: num(layer.x * ctx.scale), y: num(layer.y * ctx.scale) };
};
