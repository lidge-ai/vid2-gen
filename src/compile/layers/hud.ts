/** Full-timeline HUD stage clips and their post placement (030 G-11, B5, R2-10; 031). Stub signatures by main; W3 implements. */
import type { ResolvedHud } from "../../timeline/film.ts";
import type { ResolvedTimeline } from "../../timeline/index.ts";
import type { BuildContext, StageRender } from "../ir.ts";
import type { SegmentBase } from "../segment.ts";

/**
 * Time-ordered, contiguous absolute-time chunks (each ≤ chunkSeconds) covering [h.startFrame, h.endFrame). Registers each
 * chunk in base.stages itself (as placeStage does); plan.ts stores only the returned ids in PostPlan.hud.renders.
 */
export function hudRenders(h: ResolvedHud, t: ResolvedTimeline, base: SegmentBase, chunkSeconds = 20): StageRender[] {
  void h; void t; void base; void chunkSeconds;
  throw new Error("hudRenders: not implemented (wp4 W3)");
}

/** Concats the chunks (concat=n=k:v=1:a=0) and overlays them on `canvas` enabled over [start, end); returns the output label. */
export function placeHud(ctx: Pick<BuildContext, "graph" | "inputs" | "fps">, canvas: string, renders: StageRender[], h: ResolvedHud): string {
  void ctx; void canvas; void renders; void h;
  throw new Error("placeHud: not implemented (wp4 W3)");
}
