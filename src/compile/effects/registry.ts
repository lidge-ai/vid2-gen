import type { ResolvedEffect } from "../../timeline/index.ts";
import type { EffectContext, EffectDef } from "../ir.ts";
import { flashEffect } from "./flash.ts";
import { gradeEffect } from "./grade.ts";
import { grainEffect } from "./grain.ts";
import { motionblurEffect } from "./motionblur.ts";
import { rgbsplitEffect } from "./rgbsplit.ts";
import { vignetteEffect } from "./vignette.ts";

export const EFFECTS = {
  grade: gradeEffect,
  motionblur: motionblurEffect,
  vignette: vignetteEffect,
  grain: grainEffect,
  flash: flashEffect,
  rgbsplit: rgbsplitEffect,
} satisfies { [K in ResolvedEffect["type"]]: EffectDef<Extract<ResolvedEffect, { type: K }>> };

/** Build one effect against the scene clock or the absolute post-join clock. */
export function effectFilters(effect: ResolvedEffect, ctx: EffectContext): string[] {
  switch (effect.type) {
    case "grade": return EFFECTS.grade.build(effect, ctx);
    case "motionblur": return EFFECTS.motionblur.build(effect, ctx);
    case "vignette": return EFFECTS.vignette.build(effect, ctx);
    case "grain": return EFFECTS.grain.build(effect, ctx);
    case "flash": return EFFECTS.flash.build(effect, ctx);
    case "rgbsplit": return EFFECTS.rgbsplit.build(effect, ctx);
  }
}

/** Highest sub-frame rate required by a scene. */
export function internalRateFor(effects: readonly ResolvedEffect[]): number {
  return effects.reduce((rate, effect) => effect.type === "motionblur" ? Math.max(rate, effect.frames) : rate, 1);
}

/** No argument describes every supported effect (for doctor); an array describes one plan. */
export function requiredFilters(effects?: readonly ResolvedEffect[]): string[] {
  const filters = new Set<string>();
  if (!effects) {
    for (const def of Object.values(EFFECTS)) for (const filter of def.requires.filters) filters.add(filter);
    filters.add("colortemperature");
    filters.add("lut3d");
    return [...filters];
  }
  for (const effect of effects) {
    for (const filter of EFFECTS[effect.type].requires.filters) filters.add(filter);
    if (effect.type === "grade" && effect.temperature !== undefined) filters.add("colortemperature");
    if (effect.type === "grade" && effect.lut !== undefined) filters.add("lut3d");
  }
  return [...filters];
}
