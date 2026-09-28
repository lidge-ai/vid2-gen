/** Root look → post-join filter chain (030 G-9, B8; 031). Stub signatures written by main; W2 implements. */
import type { LookSpec } from "../timeline/film.ts";
import type { BuildContext } from "./ir.ts";

/** ffmpeg filters the look needs (for requireFeatures); empty when strength is 0. */
export function lookRequiredFilters(look: LookSpec): string[] {
  void look;
  throw new Error("lookRequiredFilters: not implemented (wp4 W2)");
}

/** Appends the look chain to `input` and returns the output label; the riso palette is built in-graph (color + hstack). */
export function applyLook(ctx: Pick<BuildContext, "graph" | "width" | "height" | "fps">, input: string, look: LookSpec): string {
  void ctx; void input; void look;
  throw new Error("applyLook: not implemented (wp4 W2)");
}
