import { Vid2Error } from "../../shared/errors.ts";
import { num, quoteExpr } from "../escape.ts";
import type { BuildContext, LayerBuilder, LayerOf } from "../ir.ts";
import { fitFilters, layerRate, sourceInput, spanSeconds } from "./media.ts";

type Overlay = LayerOf<"overlay">;

function prepared(layer: Overlay, ctx: BuildContext, seconds: number): string {
  const source = ctx.sources[layer.source];
  if (!source) throw new Vid2Error("E_SCHEMA", `unknown overlay source: ${layer.source}`);
  const input = sourceInput(source, seconds, ctx);
  return ctx.graph.add([input], ["scale=in_range=auto:out_range=tv", ...fitFilters("cover", ctx.width, ctx.height),
    `fps=${layerRate(ctx)}`, "format=rgba", "setsar=1"]);
}

function blackCanvas(ctx: BuildContext, seconds: number): string {
  const lavfi = `color=c=black:s=${num(ctx.width)}x${num(ctx.height)}:r=${layerRate(ctx)}:d=${num(seconds)}`;
  const input = ctx.inputs.add({ kind: "lavfi", lavfi, args: ["-f", "lavfi", "-i", lavfi] });
  return ctx.graph.add([input], ["format=rgba"]);
}

export const buildOverlayLayer: LayerBuilder<Overlay> = (layer, ctx) => {
  const seconds = spanSeconds(layer, ctx);
  let label = prepared(layer, ctx, seconds);
  if (layer.motion === "sweep") {
    const x = `-${num(ctx.width)}*0.4+${num(ctx.width)}*0.8*t/${num(seconds)}`;
    label = ctx.graph.add([blackCanvas(ctx, seconds), label],
      [`overlay=x=${quoteExpr(x)}:y=0:eof_action=pass:format=auto`, "format=rgba"]);
  }
  if (layer.blend === "normal") {
    return { mode: "overlay", label: ctx.graph.add([label], [`colorchannelmixer=aa=${num(layer.opacity)}`,
      `setpts=PTS-STARTPTS+${num(layer.startSeconds)}/TB`]), x: "0", y: "0" };
  }
  const before = layer.startSeconds;
  const after = Math.max(0, (ctx.renderFrames - layer.endFrame) * ctx.fps.den / ctx.fps.num);
  const neutral = ctx.graph.add([label], ["format=gbrp", `tpad=start_duration=${num(before)}:stop_duration=${num(after)}:color=black`,
    `trim=end_frame=${num(ctx.renderFrames * ctx.rate)}`, "setpts=PTS-STARTPTS"]);
  return { mode: "blend", label: neutral, blend: layer.blend, opacity: layer.opacity };
};
