/** Deterministic post-join looks. Strength scales each adjustment; zero is an exact graph bypass. */
import { RISO_DEFAULT } from "../timeline/film.ts";
import type { LookSpec } from "../timeline/film.ts";
import { num, quoteExpr } from "./escape.ts";
import type { BuildContext } from "./ir.ts";

const FILTERS = {
  film: ["eq", "colorbalance", "split", "lutrgb", "gblur", "blend", "noise", "pad", "crop"],
  riso: ["color", "hstack", "format", "trim", "paletteuse", "noise", "rgbashift"],
  paper: ["colorchannelmixer", "noise", "vignette"],
} as const;

/** ffmpeg filters the look needs (for requireFeatures); empty when strength is 0. */
export function lookRequiredFilters(look: LookSpec): string[] {
  return look.strength === 0 ? [] : [...FILTERS[look.preset]];
}

function film(ctx: Pick<BuildContext, "graph" | "width" | "height" | "fps">, input: string, look: LookSpec): string {
  const s = look.strength;
  const graded = ctx.graph.add([input], [
    `eq=contrast=${num(1 + 0.08 * s)}:saturation=${num(1 - 0.08 * s)}:gamma=${num(1 + 0.025 * s)}`,
    `colorbalance=rs=${num(0.025 * s)}:gs=${num(0.005 * s)}:bh=${num(-0.025 * s)}`,
  ]);
  const branches = ctx.graph.split(graded, 2);
  const glow = ctx.graph.add([branches[1]!], [
    `lutrgb=r=${quoteExpr("if(gte(val,200),val,0)")}:g=${quoteExpr("if(gte(val,200),val,0)")}:b=${quoteExpr("if(gte(val,200),val,0)")}`,
    `gblur=sigma=${num(5 * s)}`,
  ]);
  const halated = ctx.graph.add([branches[0]!, glow], [`blend=all_mode=screen:all_opacity=${num(0.18 * s)}`]);
  const grained = ctx.graph.add([halated], [`noise=alls=${Math.round(8 * s)}:allf=u:all_seed=${look.seed}`]);
  const x = `2+round(${num(1.5 * s)}*sin(n*0.21+${look.seed}))`;
  const y = `2+round(${num(1.5 * s)}*sin(n*0.13+${look.seed}))`;
  return ctx.graph.add([grained], [
    `pad=w=${ctx.width + 4}:h=${ctx.height + 4}:x=2:y=2:color=black`,
    `crop=w=${ctx.width}:h=${ctx.height}:x=${quoteExpr(x)}:y=${quoteExpr(y)}:exact=1`,
  ]);
}

function riso(ctx: Pick<BuildContext, "graph" | "width" | "height" | "fps">, input: string, look: LookSpec): string {
  const colors = look.palette ?? [...RISO_DEFAULT];
  const each = Math.floor(256 / colors.length);
  const swatches = colors.map((color, index) => {
    const width = index === 0 ? 256 - each * (colors.length - 1) : each;
    return ctx.graph.add([], [`color=c=0x${color.slice(1)}:s=${width}x1:d=1`]);
  });
  const palette = ctx.graph.add(swatches, [`hstack=inputs=${colors.length}`, "format=rgb24", "trim=end_frame=1"]);
  const image = ctx.graph.add([input], ["format=rgb24"]);
  const mapped = ctx.graph.add([image, palette], ["paletteuse=dither=bayer:bayer_scale=2:new=0"]);
  const offset = Math.round(2 * look.strength);
  const shifted = offset ? ctx.graph.add([mapped], [`rgbashift=rh=${offset}:bh=${-offset}:edge=smear`]) : mapped;
  return ctx.graph.add([shifted], [`noise=alls=${Math.round(5 * look.strength)}:allf=u:all_seed=${look.seed}`]);
}

function paper(ctx: Pick<BuildContext, "graph" | "width" | "height" | "fps">, input: string, look: LookSpec): string {
  const s = look.strength;
  return ctx.graph.add([input], [
    `colorchannelmixer=rr=${num(1 + 0.035 * s)}:gg=${num(1 + 0.012 * s)}:bb=${num(1 - 0.065 * s)}`,
    `noise=alls=${Math.round(7 * s)}:allf=u:all_seed=${look.seed}`,
    `vignette=angle=${quoteExpr(`PI*${num(0.5 - 0.1 * s)}`)}`,
  ]);
}

/** Appends the look chain to `input` and returns the output label; riso palette stays in the filtergraph. */
export function applyLook(ctx: Pick<BuildContext, "graph" | "width" | "height" | "fps">, input: string, look: LookSpec): string {
  if (look.strength === 0) return input;
  switch (look.preset) {
    case "film": return film(ctx, input, look);
    case "riso": return riso(ctx, input, look);
    case "paper": return paper(ctx, input, look);
  }
}
