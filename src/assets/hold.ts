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
  const warnings = new Set<string>();
  const fps = t.fps.num / t.fps.den;
  const add = (source: string, sceneId: string, span: number, speed = 1, inSeconds = 0, outSeconds?: number): void => {
    const clip = generated[source]?.durationS;
    if (clip === null || clip === undefined) return;
    const requested = outSeconds === undefined ? span * speed : Math.min(span * speed, outSeconds - inSeconds);
    const available = Math.max(0, clip - inSeconds);
    const held = Math.max(0, requested - available) / speed;
    const frames = Math.floor(held * fps + 1e-9);
    if (frames < 1) return;
    warnings.add(`W_GENERATED_CLIP_HOLD ${source} ${sceneId} held ${held.toFixed(2)}s (${frames} frames): ` +
      `clip ${clip.toFixed(2)}s, read ${requested.toFixed(2)}s from ${inSeconds.toFixed(2)}s`);
  };
  for (const scene of t.scenes) {
    if (scene.background) add(scene.background, scene.id, scene.seconds);
    for (const layer of scene.layers) {
      if (layer.type !== "media") continue;
      add(layer.source, scene.id, layer.endSeconds - layer.startSeconds, layer.speed,
        layer.inSeconds ?? 0, layer.outSeconds);
    }
  }
  for (const layer of t.overlays) {
    if (layer.type === "overlay") add(layer.source, "overlays", layer.endSeconds - layer.startSeconds);
  }
  return [...warnings];
}
