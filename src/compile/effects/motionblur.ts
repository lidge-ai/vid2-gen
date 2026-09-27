import type { ResolvedEffect } from "../../timeline/index.ts";
import type { EffectDef } from "../ir.ts";
import { num } from "../escape.ts";

type MotionBlur = Extract<ResolvedEffect, { type: "motionblur" }>;

export const motionblurEffect: EffectDef<MotionBlur> = {
  type: "motionblur",
  requires: { filters: ["tmix", "fps"] },
  internalRate: (effect) => effect.frames,
  build(effect, ctx) {
    return [`tmix=frames=${num(effect.frames)}`, `fps=${num(ctx.fps.num)}/${num(ctx.fps.den)}`];
  },
};
