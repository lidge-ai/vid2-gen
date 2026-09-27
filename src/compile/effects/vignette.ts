import type { ResolvedEffect } from "../../timeline/index.ts";
import type { EffectDef } from "../ir.ts";
import { num, quoteExpr } from "../escape.ts";

type Vignette = Extract<ResolvedEffect, { type: "vignette" }>;

export const vignetteEffect: EffectDef<Vignette> = {
  type: "vignette",
  requires: { filters: ["vignette"] },
  build(effect) { return [`vignette=angle=${quoteExpr(`PI*${num(effect.strength)}/2.5`)}`]; },
};
