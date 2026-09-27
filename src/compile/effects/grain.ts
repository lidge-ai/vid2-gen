import type { ResolvedEffect } from "../../timeline/index.ts";
import type { EffectDef } from "../ir.ts";
import { num } from "../escape.ts";

type Grain = Extract<ResolvedEffect, { type: "grain" }>;

export const grainEffect: EffectDef<Grain> = {
  type: "grain",
  requires: { filters: ["noise"] },
  build(effect) { return [`noise=alls=${num(effect.strength)}:allf=t`]; },
};
