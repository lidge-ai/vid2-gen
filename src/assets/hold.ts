/** Generated-clip hold warnings (040 B2, G-14; 041). Signature and text by main; W2 fills the body. */
import type { ResolvedTimeline } from "../timeline/index.ts";

/**
 * One warning per scene media layer or root overlay whose source id is in `generated` and whose read outlasts the clip:
 * requested = out !== undefined ? min(span·speed, out − in) : span·speed; available = max(0, clip − in);
 * held = max(0, requested − available) / speed. Emitted only when held covers at least one output frame. Text:
 * `W_GENERATED_CLIP_HOLD <sourceId> <sceneId> held <h>s (<n> frames): clip <c>s, read <r>s from <in>s` with toFixed(2) values;
 * sceneId is "overlays" for a root overlay. A scene `background` naming a generated video counts as a read with in 0,
 * speed 1 and the whole scene length under that scene's id. De-duplicated by exact string. A null duration yields nothing.
 */
export function holdWarnings(t: ResolvedTimeline, generated: Record<string, { durationS: number | null }>): string[] {
  void t; void generated;
  throw new Error("holdWarnings: not implemented (wp5 W2)");
}
