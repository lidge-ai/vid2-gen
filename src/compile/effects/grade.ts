import type { ResolvedEffect } from "../../timeline/index.ts";
import type { EffectDef } from "../ir.ts";
import { escapePath, num } from "../escape.ts";

type Grade = Extract<ResolvedEffect, { type: "grade" }>;

export const gradeEffect: EffectDef<Grade> = {
  type: "grade",
  requires: { filters: ["eq"] },
  build(effect) {
    const filters = [`eq=brightness=${num(effect.brightness)}:contrast=${num(effect.contrast)}:saturation=${num(effect.saturation)}`];
    if (effect.temperature !== undefined) filters.push(`colortemperature=temperature=${num(effect.temperature)}`);
    if (effect.lut) filters.push(`lut3d=file=${escapePath(effect.lut)}`);
    return filters;
  },
};
