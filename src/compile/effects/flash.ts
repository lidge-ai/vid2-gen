import { Vid2Error } from "../../shared/index.ts";
import type { ResolvedEffect } from "../../timeline/index.ts";
import type { EffectDef, EffectContext } from "../ir.ts";
import { num, quoteExpr } from "../escape.ts";

type Flash = Extract<ResolvedEffect, { type: "flash" }>;

function effectAtSeconds(effect: Flash, ctx: EffectContext): number {
  const at = ctx.clock === "absolute-t" ? effect.absoluteAtSeconds ?? effect.atSeconds : effect.atSeconds;
  if (at === undefined) throw new Vid2Error("E_INTERNAL", "timed effect needs resolved seconds");
  return at;
}

export const flashEffect: EffectDef<Flash> = {
  type: "flash",
  requires: { filters: ["eq"] },
  build(effect, ctx) {
    const at = num(effectAtSeconds(effect, ctx));
    const brightness = `${num(effect.strength)}*exp(-max(0,t-${at})*${num(effect.decay)})*gte(t,${at})`;
    return [`eq=brightness=${quoteExpr(brightness)}:eval=frame`];
  },
};
