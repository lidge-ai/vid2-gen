import { Vid2Error } from "../../shared/index.ts";
import type { ResolvedEffect } from "../../timeline/index.ts";
import type { EffectDef } from "../ir.ts";
import { num, quoteExpr } from "../escape.ts";

type RgbSplit = Extract<ResolvedEffect, { type: "rgbsplit" }>;

export const rgbsplitEffect: EffectDef<RgbSplit> = {
  type: "rgbsplit",
  requires: { filters: ["rgbashift"] },
  build(effect, ctx) {
    if (effect.frames < 1) throw new Vid2Error("E_INPUT", "rgbsplit frames must be positive");
    const time = ctx.clock === "absolute-t";
    const start = time ? effect.absoluteAtSeconds ?? effect.atSeconds : effect.atFrame;
    if (start === undefined) throw new Vid2Error("E_INTERNAL", "rgbsplit needs resolved timing");
    const from = time ? start : start * ctx.rate;
    const span = time ? effect.frames * ctx.fps.den / ctx.fps.num : effect.frames * ctx.rate;
    const end = time ? from + span - ctx.fps.den / (2 * ctx.fps.num) : from + span - 1;
    const enabled = `between(${time ? "t" : "n"},${num(from)},${num(end)})`;
    return [`rgbashift=rh=${num(-effect.px)}:bh=${num(effect.px)}:edge=smear:enable=${quoteExpr(enabled)}`];
  },
};
